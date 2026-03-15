from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from services.prompt_optimizer import optimize_prompt, OPTIMIZER_MODEL
from services.llm_client import complete
from services.token_counter import count_tokens

router = APIRouter(prefix="/optimize", tags=["optimize"])


@router.post("/", response_model=schemas.OptimizeResponse)
async def optimize(body: schemas.OptimizeRequest, db: Session = Depends(get_db)):
    """
    Optimize a raw prompt using local RAG + LLM.
    Supports: chain context, tone, temperature, second-pass refinement (llm_response).
    """
    system_ctx = None
    model = OPTIMIZER_MODEL
    if body.project_id:
        project = db.query(models.Project).filter_by(id=body.project_id).first()
        if project:
            system_ctx = project.system_context
            model = project.model or OPTIMIZER_MODEL

    # Build chain context from previous prompts in this session
    chain_summary = None
    if body.previous_prompts:
        lines = ["[Chain context — previous prompts in this session:]"]
        for i, p in enumerate(body.previous_prompts, 1):
            raw_preview = p.raw[:120] + ("…" if len(p.raw) > 120 else "")
            opt_preview = p.optimized[:180] + ("…" if len(p.optimized) > 180 else "")
            lines.append(f"{i}. Raw: \"{raw_preview}\"")
            lines.append(f"   → Optimized: \"{opt_preview}\"")
        chain_summary = "\n".join(lines)

    result = await optimize_prompt(
        body.raw_input,
        model=model,
        system_context=system_ctx,
        session_summary=chain_summary,
        temperature=body.temperature,
        tone=body.tone,
        llm_response=body.llm_response,
    )
    return schemas.OptimizeResponse(**result)


@router.post("/run", response_model=schemas.RunPromptResponse)
async def run_prompt(body: schemas.RunPromptRequest, db: Session = Depends(get_db)):
    """
    Run an optimized prompt directly through the LLM — no optimization step.
    Used for Test & Refine: see what the LLM actually responds with before refining.
    """
    system_ctx = None
    model = OPTIMIZER_MODEL
    if body.project_id:
        project = db.query(models.Project).filter_by(id=body.project_id).first()
        if project and project.system_context:
            system_ctx = project.system_context
        if project and project.model:
            model = project.model

    response = await complete(
        messages=[{"role": "user", "content": body.prompt}],
        model=model,
        system=system_ctx,
        max_tokens=1024,
        temperature=body.temperature,
    )
    tokens_used = count_tokens(response, model)
    return schemas.RunPromptResponse(response=response, tokens_used=tokens_used)
