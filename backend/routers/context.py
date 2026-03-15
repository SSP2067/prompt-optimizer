from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import get_db
from services.context_manager import summarize_session

router = APIRouter(prefix="/context", tags=["context"])


@router.post("/summarize/{session_id}", response_model=schemas.ContextSummaryOut)
async def summarize(session_id: str, db: Session = Depends(get_db)):
    """Manually trigger summarization of a session's messages."""
    session = db.query(models.Session).filter_by(id=session_id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    project = db.query(models.Project).filter_by(id=session.project_id).first()
    model = project.model if project else "claude-haiku-4-5-20251001"

    summary = await summarize_session(db, session_id, session.project_id, model)
    if not summary:
        raise HTTPException(422, "No messages to summarize")
    return summary


@router.get("/project/{project_id}", response_model=List[schemas.ContextSummaryOut])
def get_project_summaries(project_id: str, db: Session = Depends(get_db)):
    """Get all context summaries for a project."""
    summaries = (
        db.query(models.ContextSummary)
        .filter_by(project_id=project_id)
        .order_by(models.ContextSummary.created_at.desc())
        .all()
    )
    return summaries


@router.get("/stats/{project_id}", response_model=schemas.TokenStatsSummary)
def get_token_stats(project_id: str, db: Session = Depends(get_db)):
    """Get aggregated token usage stats for a project."""
    stats = (
        db.query(models.TokenStat)
        .filter_by(project_id=project_id)
        .order_by(models.TokenStat.date)
        .all()
    )
    total_raw = sum(s.raw_tokens for s in stats)
    total_optimized = sum(s.optimized_tokens for s in stats)
    total_saved = sum(s.saved_tokens for s in stats)
    savings_pct = round((total_saved / total_raw * 100) if total_raw > 0 else 0, 1)

    return schemas.TokenStatsSummary(
        total_raw=total_raw,
        total_optimized=total_optimized,
        total_saved=total_saved,
        savings_pct=savings_pct,
        by_day=[schemas.TokenStatOut.model_validate(s) for s in stats],
    )
