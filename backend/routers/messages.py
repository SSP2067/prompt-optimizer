import json
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from services.llm_client import stream_response
from services.token_counter import count_tokens
from services.prompt_optimizer import optimize_prompt
from services.context_manager import get_session_messages_for_llm, get_project_context

router = APIRouter(prefix="/projects/{project_id}/sessions/{session_id}/messages", tags=["messages"])


@router.post("/stream")
async def send_message_stream(
    project_id: str,
    session_id: str,
    body: schemas.MessageSend,
    db: Session = Depends(get_db),
):
    """
    Send a user message and stream back the assistant response via SSE.
    Automatically runs prompt optimization if use_optimized=True.
    """
    session = db.query(models.Session).filter_by(id=session_id, project_id=project_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    project = db.query(models.Project).filter_by(id=project_id).first()
    model = project.model if project else "claude-haiku-4-5-20251001"

    # --- Prompt optimization ---
    raw_input = body.raw_input
    optimized_prompt = None
    technique = "zero-shot"
    tokens_saved = 0
    raw_tokens = count_tokens(raw_input, model)

    if body.use_optimized:
        system_ctx = project.system_context if project else None
        opt_result = await optimize_prompt(raw_input, model=model, system_context=system_ctx)
        optimized_prompt = opt_result["optimized"]
        technique = opt_result["technique"]
        tokens_saved = opt_result["tokens_saved"]
        content_to_send = optimized_prompt
    else:
        content_to_send = raw_input

    # --- Store user message ---
    user_msg = models.Message(
        session_id=session_id,
        role="user",
        raw_input=raw_input,
        optimized_prompt=optimized_prompt,
        content=content_to_send,
        token_count=count_tokens(content_to_send, model),
        tokens_saved=tokens_saved,
        model=model,
        technique=technique,
    )
    db.add(user_msg)

    # Auto-title session from first user message
    if not session.title:
        session.title = raw_input[:60].strip()

    db.commit()

    # --- Build message history for LLM ---
    history, _ = get_session_messages_for_llm(db, session_id, model)

    # --- Get project-level system prompt ---
    system_prompt = await get_project_context(db, project_id)

    # --- Update token stats ---
    _update_token_stats(db, project_id, raw_tokens, count_tokens(content_to_send, model))

    # --- Stream response ---
    async def event_stream():
        full_response = []
        yield _sse("start", {"message_id": user_msg.id})

        async for chunk in stream_response(history, model, system=system_prompt or None):
            full_response.append(chunk)
            yield _sse("chunk", {"text": chunk})

        # Store assistant message
        assistant_text = "".join(full_response)
        assistant_tokens = count_tokens(assistant_text, model)

        assistant_msg = models.Message(
            session_id=session_id,
            role="assistant",
            content=assistant_text,
            token_count=assistant_tokens,
            model=model,
        )
        db.add(assistant_msg)
        session.total_tokens = (session.total_tokens or 0) + user_msg.token_count + assistant_tokens
        session.last_active = datetime.utcnow()
        db.commit()

        yield _sse("done", {
            "assistant_message_id": assistant_msg.id,
            "assistant_tokens": assistant_tokens,
            "total_session_tokens": session.total_tokens,
        })

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def _update_token_stats(db: Session, project_id: str, raw: int, optimized: int):
    today = date.today()
    stat = db.query(models.TokenStat).filter_by(project_id=project_id, date=today).first()
    if not stat:
        stat = models.TokenStat(project_id=project_id, date=today)
        db.add(stat)
    stat.raw_tokens = (stat.raw_tokens or 0) + raw
    stat.optimized_tokens = (stat.optimized_tokens or 0) + optimized
    stat.saved_tokens = (stat.saved_tokens or 0) + max(0, raw - optimized)
    db.commit()
