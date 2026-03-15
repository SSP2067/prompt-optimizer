from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

import models
import schemas
from database import get_db

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("/", response_model=List[schemas.TemplateOut])
def list_templates(project_id: Optional[str] = None, db: Session = Depends(get_db)):
    """List global templates + optionally project-specific ones."""
    query = db.query(models.PromptTemplate)
    if project_id:
        query = query.filter(
            (models.PromptTemplate.project_id == project_id) |
            (models.PromptTemplate.project_id == None)
        )
    else:
        query = query.filter(models.PromptTemplate.project_id == None)
    return query.order_by(models.PromptTemplate.use_count.desc()).all()


@router.post("/", response_model=schemas.TemplateOut, status_code=201)
def create_template(body: schemas.TemplateCreate, db: Session = Depends(get_db)):
    template = models.PromptTemplate(**body.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
def delete_template(template_id: str, db: Session = Depends(get_db)):
    t = db.query(models.PromptTemplate).filter_by(id=template_id).first()
    if not t:
        raise HTTPException(404, "Template not found")
    db.delete(t)
    db.commit()


@router.post("/{template_id}/use", response_model=schemas.TemplateOut)
def use_template(template_id: str, db: Session = Depends(get_db)):
    """Increment use count when a template is applied."""
    t = db.query(models.PromptTemplate).filter_by(id=template_id).first()
    if not t:
        raise HTTPException(404, "Template not found")
    t.use_count += 1
    db.commit()
    db.refresh(t)
    return t
