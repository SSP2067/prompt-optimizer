"""
Context Manager Service.
Handles token budget tracking, auto-summarization, and project-level context reuse.
"""
import os
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session as DBSession
from services.llm_client import complete
from services.token_counter import count_tokens, get_model_context_limit
import models

WARN_THRESHOLD = float(os.getenv("TOKEN_WARN_THRESHOLD", "0.60"))
SUMMARIZE_THRESHOLD = float(os.getenv("TOKEN_SUMMARIZE_THRESHOLD", "0.75"))
HARD_LIMIT = float(os.getenv("TOKEN_HARD_LIMIT", "0.90"))

SUMMARIZER_SYSTEM = """You are a concise summarizer. Given a sequence of chat messages,
produce a 3-5 sentence summary capturing the key topics discussed, decisions made,
and any important context for future reference. Be factual and dense. No fluff."""


def get_session_messages_for_llm(
    db: DBSession,
    session_id: str,
    model: str,
) -> Tuple[List[Dict], str]:
    """
    Build the message list to send to the LLM for a session.
    Applies summarization if token threshold is exceeded.
    Returns (messages_list, context_status) where context_status is one of:
    'full' | 'partial_summary' | 'summary_only'
    """
    session = db.query(models.Session).filter_by(id=session_id).first()
    if not session:
        return [], "full"

    limit = get_model_context_limit(model)
    warn_at = int(limit * WARN_THRESHOLD)
    summarize_at = int(limit * SUMMARIZE_THRESHOLD)

    # Get all non-summarized messages
    messages = (
        db.query(models.Message)
        .filter_by(session_id=session_id)
        .filter(models.Message.role.in_(["user", "assistant"]))
        .order_by(models.Message.created_at)
        .all()
    )

    msg_dicts = [{"role": m.role, "content": m.content} for m in messages]
    total_tokens = sum(count_tokens(m["content"], model) for m in msg_dicts)

    if total_tokens < warn_at:
        return msg_dicts, "full"

    if total_tokens < summarize_at:
        # Just warn — return full but flag
        return msg_dicts, "partial_summary"

    # Summarize oldest half, keep newest 5 verbatim
    keep_recent = 5
    to_summarize = messages[:-keep_recent] if len(messages) > keep_recent else []
    recent = messages[-keep_recent:] if len(messages) > keep_recent else messages

    if to_summarize:
        summary = _build_summary_sync(to_summarize, model)
        summary_msg = {"role": "system", "content": f"[Conversation summary so far]: {summary}"}
        recent_dicts = [{"role": m.role, "content": m.content} for m in recent]
        return [summary_msg] + recent_dicts, "summary_only"

    return [{"role": m.role, "content": m.content} for m in recent], "summary_only"


async def summarize_session(
    db: DBSession,
    session_id: str,
    project_id: str,
    model: str,
) -> Optional[models.ContextSummary]:
    """
    Summarize all messages in a session and store as a ContextSummary.
    Used at end-of-session and for mid-session compression.
    """
    messages = (
        db.query(models.Message)
        .filter_by(session_id=session_id)
        .filter(models.Message.role.in_(["user", "assistant"]))
        .order_by(models.Message.created_at)
        .all()
    )
    if not messages:
        return None

    full_text = "\n".join(f"{m.role.upper()}: {m.content}" for m in messages)
    original_tokens = count_tokens(full_text, model)

    summary_text = await complete(
        messages=[{"role": "user", "content": full_text}],
        model=model,
        system=SUMMARIZER_SYSTEM,
        max_tokens=256,
    )

    compressed_tokens = count_tokens(summary_text, model)
    ratio = round(compressed_tokens / original_tokens, 3) if original_tokens > 0 else 1.0

    summary = models.ContextSummary(
        project_id=project_id,
        session_id=session_id,
        summary=summary_text,
        original_token_count=original_tokens,
        compressed_token_count=compressed_tokens,
        compression_ratio=ratio,
    )
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return summary


async def get_project_context(db: DBSession, project_id: str) -> str:
    """
    Build the system context string for a new session:
    [project.system_context] + [most recent project-level summary]
    """
    project = db.query(models.Project).filter_by(id=project_id).first()
    if not project:
        return ""

    parts = []
    if project.system_context:
        parts.append(project.system_context)

    # Latest project-level summary (session_id IS NULL)
    latest_summary = (
        db.query(models.ContextSummary)
        .filter_by(project_id=project_id, session_id=None)
        .order_by(models.ContextSummary.created_at.desc())
        .first()
    )
    if latest_summary:
        parts.append(f"[Previous work in this project]: {latest_summary.summary}")

    return "\n\n".join(parts)


def _build_summary_sync(messages: List[models.Message], model: str) -> str:
    """
    Synchronous summary builder for use inside get_session_messages_for_llm.
    Uses a simple truncation-based approach to avoid async complexity in a sync context.
    Returns a truncated string to represent the summarized older context.
    """
    # Build a brief summary inline without async LLM call
    # (full async summarization happens via summarize_session endpoint)
    lines = []
    for m in messages[-20:]:  # take last 20 of the "old" messages
        snippet = m.content[:100].replace("\n", " ")
        lines.append(f"{m.role}: {snippet}...")
    return "Earlier conversation covered: " + " | ".join(lines[:5])
