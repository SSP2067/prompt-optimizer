from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

import models
import schemas
from database import get_db

router = APIRouter(prefix="/projects/{project_id}/sessions", tags=["sessions"])


@router.get("/", response_model=List[schemas.SessionOut])
def list_sessions(project_id: str, db: Session = Depends(get_db)):
    sessions = (
        db.query(models.Session)
        .filter_by(project_id=project_id)
        .order_by(models.Session.last_active.desc())
        .all()
    )
    result = []
    for s in sessions:
        out = schemas.SessionOut.model_validate(s)
        out.message_count = len(s.messages)
        result.append(out)
    return result


@router.post("/", response_model=schemas.SessionOut, status_code=201)
def create_session(project_id: str, body: schemas.SessionCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    session = models.Session(project_id=project_id, title=body.title)
    db.add(session)
    db.commit()
    db.refresh(session)
    out = schemas.SessionOut.model_validate(session)
    out.message_count = 0
    return out


@router.get("/{session_id}", response_model=schemas.SessionOut)
def get_session(project_id: str, session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.Session).filter_by(id=session_id, project_id=project_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    out = schemas.SessionOut.model_validate(session)
    out.message_count = len(session.messages)
    return out


@router.get("/{session_id}/messages", response_model=List[schemas.MessageOut])
def get_messages(project_id: str, session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.Session).filter_by(id=session_id, project_id=project_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    return session.messages


@router.delete("/{session_id}", status_code=204)
def delete_session(project_id: str, session_id: str, db: Session = Depends(get_db)):
    session = db.query(models.Session).filter_by(id=session_id, project_id=project_id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    db.delete(session)
    db.commit()
