import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Text, Integer, Float, DateTime, Date,
    ForeignKey, CheckConstraint
)
from sqlalchemy.orm import relationship
from database import Base


def new_uuid():
    return str(uuid.uuid4())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=new_uuid)
    name = Column(String, nullable=False)
    description = Column(Text)
    system_context = Column(Text)          # standing instructions injected into every session
    model = Column(String, default="gemini-2.0-flash")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sessions = relationship("Session", back_populates="project", cascade="all, delete-orphan")
    context_summaries = relationship("ContextSummary", back_populates="project", cascade="all, delete-orphan")
    prompt_templates = relationship("PromptTemplate", back_populates="project", cascade="all, delete-orphan")
    token_stats = relationship("TokenStat", back_populates="project", cascade="all, delete-orphan")
    optimization_history = relationship("OptimizationHistory", back_populates="project", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    title = Column(String)                 # auto-generated from first user message
    total_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_active = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="sessions")
    messages = relationship("Message", back_populates="session", cascade="all, delete-orphan", order_by="Message.created_at")
    context_summaries = relationship("ContextSummary", back_populates="session", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=new_uuid)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, CheckConstraint("role IN ('user','assistant','system')"), nullable=False)
    raw_input = Column(Text)               # original unedited user text
    optimized_prompt = Column(Text)        # prompt-engineered version
    content = Column(Text, nullable=False) # actual text sent/received by LLM
    token_count = Column(Integer)
    tokens_saved = Column(Integer, default=0)  # raw_tokens - optimized_tokens
    model = Column(String)
    technique = Column(String)             # zero-shot, CoT, few-shot, role, etc.
    is_summarized = Column(Integer, default=0)  # 1 if this message has been rolled into a summary
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="messages")


class ContextSummary(Base):
    __tablename__ = "context_summaries"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    session_id = Column(String, ForeignKey("sessions.id", ondelete="CASCADE"))  # NULL = project-level
    summary = Column(Text, nullable=False)
    original_token_count = Column(Integer)
    compressed_token_count = Column(Integer)
    compression_ratio = Column(Float)      # compressed / original (lower = better compression)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="context_summaries")
    session = relationship("Session", back_populates="context_summaries")


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"))  # NULL = global
    name = Column(String, nullable=False)
    description = Column(Text)
    template = Column(Text, nullable=False)  # with {variable} placeholders
    technique = Column(String)             # zero-shot, CoT, role, few-shot, etc.
    avg_tokens = Column(Integer)
    use_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="prompt_templates")


class TokenStat(Base):
    __tablename__ = "token_stats"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    raw_tokens = Column(Integer, default=0)
    optimized_tokens = Column(Integer, default=0)
    saved_tokens = Column(Integer, default=0)

    project = relationship("Project", back_populates="token_stats")


class OptimizationHistory(Base):
    __tablename__ = "optimization_history"

    id = Column(String, primary_key=True, default=new_uuid)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    raw = Column(Text, nullable=False)
    optimized = Column(Text, nullable=False)
    technique = Column(String)
    tokens_saved = Column(Integer, default=0)
    savings_pct = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="optimization_history")
