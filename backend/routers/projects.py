from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

import models
import schemas
from database import get_db

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/", response_model=List[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(models.Project).order_by(models.Project.updated_at.desc()).all()
    result = []
    for p in projects:
        out = schemas.ProjectOut.model_validate(p)
        out.session_count = len(p.sessions)
        result.append(out)
    return result


@router.post("/", response_model=schemas.ProjectOut, status_code=201)
def create_project(body: schemas.ProjectCreate, db: Session = Depends(get_db)):
    project = models.Project(**body.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    out = schemas.ProjectOut.model_validate(project)
    out.session_count = 0
    return out


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    out = schemas.ProjectOut.model_validate(project)
    out.session_count = len(project.sessions)
    return out


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: str, body: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(project, field, value)
    project.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(project)
    out = schemas.ProjectOut.model_validate(project)
    out.session_count = len(project.sessions)
    return out


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()
