from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

import models
import schemas
from database import get_db

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/{project_id}", response_model=List[schemas.HistoryItemOut])
def get_history(project_id: str, limit: int = 20, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    items = (
        db.query(models.OptimizationHistory)
        .filter_by(project_id=project_id)
        .order_by(models.OptimizationHistory.created_at.desc())
        .limit(limit)
        .all()
    )
    return items


@router.post("/{project_id}", response_model=schemas.HistoryItemOut, status_code=201)
def save_history(project_id: str, body: schemas.HistoryItemCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    item = models.OptimizationHistory(project_id=project_id, **body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{project_id}/{item_id}", status_code=204)
def delete_history_item(project_id: str, item_id: str, db: Session = Depends(get_db)):
    item = db.query(models.OptimizationHistory).filter_by(id=item_id, project_id=project_id).first()
    if not item:
        raise HTTPException(404, "History item not found")
    db.delete(item)
    db.commit()
