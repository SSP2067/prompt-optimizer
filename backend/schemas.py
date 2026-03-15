from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_context: Optional[str] = None
    model: str = "gemini-2.0-flash"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_context: Optional[str] = None
    model: Optional[str] = None


class ProjectOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    system_context: Optional[str]
    model: str
    created_at: datetime
    updated_at: datetime
    session_count: int = 0

    model_config = {"from_attributes": True}


# ── Sessions ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    title: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    project_id: str
    title: Optional[str]
    total_tokens: int
    created_at: datetime
    last_active: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


# ── Messages ──────────────────────────────────────────────────────────────────

class MessageSend(BaseModel):
    raw_input: str
    use_optimized: bool = True            # if True, run through optimizer before sending


class MessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    raw_input: Optional[str]
    optimized_prompt: Optional[str]
    content: str
    token_count: Optional[int]
    tokens_saved: int
    model: Optional[str]
    technique: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Optimize ──────────────────────────────────────────────────────────────────

class PreviousPrompt(BaseModel):
    raw: str
    optimized: str


class OptimizeRequest(BaseModel):
    raw_input: str
    project_id: Optional[str] = None
    session_id: Optional[str] = None
    previous_prompts: Optional[List[PreviousPrompt]] = None
    temperature: float = 0.7
    tone: Optional[str] = None          # professional | technical | creative | casual
    llm_response: Optional[str] = None  # second-pass refinement context


class OptimizeResponse(BaseModel):
    optimized: str
    technique: str
    rationale: str
    raw_tokens: int
    optimized_tokens: int
    tokens_saved: int
    savings_pct: float
    skipped: bool = False
    retrieved_technique: Optional[str] = None
    mistakes_found: List[str] = []
    prompt_type: str = "instructional"
    ai_received: dict = {}


# ── Run Prompt (Test & Refine pass 2) ─────────────────────────────────────────

class RunPromptRequest(BaseModel):
    prompt: str
    project_id: Optional[str] = None
    temperature: float = 0.7


class RunPromptResponse(BaseModel):
    response: str
    tokens_used: int


# ── Context Summaries ─────────────────────────────────────────────────────────

class ContextSummaryOut(BaseModel):
    id: str
    project_id: str
    session_id: Optional[str]
    summary: str
    original_token_count: Optional[int]
    compressed_token_count: Optional[int]
    compression_ratio: Optional[float]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Prompt Templates ──────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    template: str
    technique: Optional[str] = None
    project_id: Optional[str] = None


class TemplateOut(BaseModel):
    id: str
    project_id: Optional[str]
    name: str
    description: Optional[str]
    template: str
    technique: Optional[str]
    avg_tokens: Optional[int]
    use_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Optimization History ──────────────────────────────────────────────────────

class HistoryItemCreate(BaseModel):
    raw: str
    optimized: str
    technique: str
    tokens_saved: int = 0
    savings_pct: float = 0.0


class HistoryItemOut(BaseModel):
    id: str
    project_id: str
    raw: str
    optimized: str
    technique: str
    tokens_saved: int
    savings_pct: float
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Token Stats ───────────────────────────────────────────────────────────────

class TokenStatOut(BaseModel):
    id: str
    project_id: str
    date: date
    raw_tokens: int
    optimized_tokens: int
    saved_tokens: int

    model_config = {"from_attributes": True}


class TokenStatsSummary(BaseModel):
    total_raw: int
    total_optimized: int
    total_saved: int
    savings_pct: float
    by_day: List[TokenStatOut]
