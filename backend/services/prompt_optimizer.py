"""
Token-saving design:
- Skips optimization entirely if input is already short (<30 tokens) — zero API cost
- Uses local RAG (zero API cost) to retrieve the best technique example from knowledge_base.json
- Injects only the relevant example (~80 tokens) instead of a full static knowledge dump
- Uses Gemini 2.0 Flash (free tier) for the actual optimization call
- max_tokens=400 — rationale is 1 sentence, no padding needed

New features:
- tone: inject tone requirement into system prompt
- temperature: passed through to LLM for creativity control
- llm_response: second-pass refinement — optimizer sees the actual LLM output
- mistakes_found: list of issues detected and fixed in the raw input
- prompt_type: classification (instructional/exploratory/conversational/structured/clarifying)
- ai_received: full transparency dict of what was sent to the LLM
"""
import json
import os
from typing import Optional
from services.llm_client import complete
from services.token_counter import count_tokens
from services.knowledge_retriever import retrieve_technique, build_technique_hint

OPTIMIZER_MODEL = os.getenv("OPTIMIZER_MODEL", "gemini-2.0-flash")
MIN_TOKENS_TO_OPTIMIZE = int(os.getenv("MIN_TOKENS_TO_OPTIMIZE", "30"))

TONE_MAP = {
    "professional": "Use formal, precise language. Avoid colloquialisms.",
    "technical": "Use domain-specific technical terminology. Be exact and terse.",
    "creative": "Allow expressive, vivid language. Prioritize engagement and originality.",
    "casual": "Use conversational, friendly tone. Keep sentences short.",
}

OPTIMIZER_SYSTEM_PROMPT = """You are an expert prompt engineer at Anthropic. Transform the user's raw input into an optimized, token-efficient prompt.

Rules:
1. ROLE — Assign a precise expert role when task-specific (e.g., "Act as a senior Python developer")
2. TASK — Lead with a strong action verb: Analyze, Generate, Classify, Extract, Summarize, Debug, List
3. CONTEXT — Keep only essential context; cut filler words, hedging, repetition
4. FORMAT — Specify output format explicitly (JSON, bullets, table, single sentence)
5. BREVITY — Remove filler words, hedging, and repetition. Preserve ALL requirements, constraints, and factual details.
6. POSITIVE — Rewrite "Don't do X" as "Do Y instead"
7. VARIABLES — Replace hardcoded values with {placeholders} where reuse makes sense
8. VALIDATE — Before returning, verify your optimized prompt: (a) preserves ALL original requirements and constraints, (b) adds no new assumptions not in the original, (c) is a complete, executable instruction

Return ONLY valid JSON:
{
  "optimized": "...",
  "technique": "...",
  "rationale": "...",
  "mistakes": ["issue 1 → fix applied", "issue 2 → fix applied"],
  "prompt_type": "..."
}

technique: zero-shot | few-shot | chain-of-thought | role-prompting | contextual | step-back | system-prompt | code-generation | output-format | self-consistency | variable-prompts | iterative-prompting | react | least-to-most | generated-knowledge | prompt-chaining
rationale: 1 sentence max — explain what technique was applied and why
mistakes: list of 0-3 short strings describing what was wrong in the raw input (empty list [] if the prompt was already well-formed). Each string format: "what was wrong → what was done"
prompt_type: classify the raw input as one of: instructional | exploratory | conversational | structured | clarifying"""

REFINE_RULE = """
9. REFINE — A previous LLM response to the optimized prompt is provided. Use it to:
   (a) For CoT tasks: extract the actual reasoning structure shown in the response and build proper few-shot CoT examples with real reasoning steps
   (b) Identify what the response missed or got wrong vs the original intent, tighten those constraints
   (c) If the response was good: reinforce what made it work as concrete few-shot examples in the new prompt
   (d) The refined prompt should be noticeably better than the first — not just a minor tweak"""


async def optimize_prompt(
    raw_input: str,
    model: str = OPTIMIZER_MODEL,
    system_context: Optional[str] = None,
    session_summary: Optional[str] = None,
    temperature: float = 0.7,
    tone: Optional[str] = None,
    llm_response: Optional[str] = None,
) -> dict:
    """
    Transform raw_input into an optimized prompt.
    Returns dict with: optimized, technique, rationale, raw_tokens, optimized_tokens,
                       tokens_saved, savings_pct, skipped, retrieved_technique,
                       mistakes_found, prompt_type, ai_received
    """
    raw_tokens = count_tokens(raw_input, model)

    # --- Short-input fast path: skip LLM call entirely ---
    if raw_tokens < MIN_TOKENS_TO_OPTIMIZE and not llm_response:
        return {
            "optimized": raw_input,
            "technique": "zero-shot",
            "rationale": "Input is already concise — no optimization needed.",
            "raw_tokens": raw_tokens,
            "optimized_tokens": raw_tokens,
            "tokens_saved": 0,
            "savings_pct": 0.0,
            "skipped": True,
            "retrieved_technique": None,
            "mistakes_found": [],
            "prompt_type": "instructional",
            "ai_received": {},
        }

    # --- Local RAG: zero API cost technique retrieval ---
    match = retrieve_technique(raw_input)
    technique_hint = build_technique_hint(match)
    retrieved_name = match["technique"] if match else None

    # --- Build system prompt ---
    tone_instruction = ""
    if tone and tone in TONE_MAP:
        tone_instruction = f"\nTone requirement: {TONE_MAP[tone]}"

    refine_instruction = REFINE_RULE if llm_response else ""

    full_system = OPTIMIZER_SYSTEM_PROMPT + tone_instruction + refine_instruction + technique_hint

    # --- Build user message ---
    context_parts = []
    if system_context:
        context_parts.append(f"[Project context: {system_context[:200]}]")
    if session_summary:
        context_parts.append(f"[Session so far: {session_summary[:300]}]")
    if llm_response:
        context_parts.append(f"[Previous LLM response to optimized prompt:\n{llm_response[:600]}]")

    if context_parts:
        user_msg = "\n".join(context_parts) + "\n\nUser's raw input:\n" + raw_input
    else:
        user_msg = raw_input

    # --- Build ai_received transparency dict ---
    ai_received = {
        "system_prompt": full_system[:500] + ("..." if len(full_system) > 500 else ""),
        "technique_hint": technique_hint[:300] if technique_hint else "",
        "chain_context": session_summary[:300] if session_summary else None,
        "project_context": system_context[:200] if system_context else None,
        "user_message": user_msg[:600] + ("..." if len(user_msg) > 600 else ""),
    }

    try:
        response = await complete(
            messages=[{"role": "user", "content": user_msg}],
            model=model,
            system=full_system,
            max_tokens=500,
            temperature=temperature,
        )

        # Strip markdown code fences if present
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        cleaned = cleaned.strip()

        result = json.loads(cleaned)
        optimized = result.get("optimized", raw_input)
        technique = result.get("technique", "zero-shot")
        rationale = result.get("rationale", "")
        mistakes_found = result.get("mistakes", [])
        prompt_type = result.get("prompt_type", "instructional")

        # Validate lists
        if not isinstance(mistakes_found, list):
            mistakes_found = []
        mistakes_found = [str(m) for m in mistakes_found[:3]]  # cap at 3

    except Exception:
        optimized = raw_input
        technique = "zero-shot"
        rationale = "Optimization failed; using raw input."
        mistakes_found = []
        prompt_type = "instructional"

    optimized_tokens = count_tokens(optimized, model)
    tokens_saved = max(0, raw_tokens - optimized_tokens)
    savings_pct = round((tokens_saved / raw_tokens * 100) if raw_tokens > 0 else 0, 1)

    return {
        "optimized": optimized,
        "technique": technique,
        "rationale": rationale,
        "raw_tokens": raw_tokens,
        "optimized_tokens": optimized_tokens,
        "tokens_saved": tokens_saved,
        "savings_pct": savings_pct,
        "skipped": False,
        "retrieved_technique": retrieved_name,
        "mistakes_found": mistakes_found,
        "prompt_type": prompt_type,
        "ai_received": ai_received,
    }
