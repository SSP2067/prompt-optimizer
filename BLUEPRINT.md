# AI Prompt Optimizer — Build Blueprint

> A complete guide to rebuild this app from scratch.
> Share this document with anyone who wants to build a production-ready prompt optimization tool.

---

## What This App Does

A **local, project-based prompt optimizer**. You paste a messy raw prompt, click Optimize, and get back a token-efficient, well-structured version with:
- The prompt engineering technique used (Chain-of-Thought, Role-Prompting, Few-Shot, etc.)
- Token savings count and percentage
- A one-sentence rationale explaining *why* that technique was applied
- Full history persisted to SQLite — survives browser clears

Projects let you group related prompts with shared **standing context** (e.g. "Always use Python 3.12. Use type hints.") that gets injected into every optimization automatically.

**Chain-of-prompts**: When you optimize a second prompt in the same project, the system sends the previous 5 raw+optimized pairs as context — so the optimizer can make coherent, related optimizations.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend API | **FastAPI** + Python 3.11+ | Async, auto-docs at `/docs` |
| Database | **SQLite** via SQLAlchemy | Zero setup, file-based, works locally |
| LLM — primary | **Gemini 2.0 Flash** | Free tier, fast |
| LLM — fallback 1 | **Groq Llama 3.3-70B** | Free tier |
| LLM — fallback 2 | **OpenAI gpt-4o-mini** | Paid last resort |
| Local RAG | **sentence-transformers** (`all-MiniLM-L6-v2`) | Zero API cost technique retrieval |
| Frontend | **Next.js 14** (App Router) + TypeScript | |
| Styling | **Tailwind CSS** | Dark theme |
| State | **Zustand** | Simple store with localStorage fallback |
| HTTP client | **Axios** | |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                       │
│                                                                 │
│  Page: /                          Page: /project/[id]           │
│  ┌──────────────────────┐         ┌────────────────────────┐   │
│  │   ProjectSelector    │  →  →   │      ProjectPage        │   │
│  │  List / Create /     │         │  Raw Input  │  Optimized │   │
│  │  Edit / Delete       │         │  (left)     │  (right)   │   │
│  └──────────────────────┘         │             │            │   │
│                                   │  History (bottom strip) │   │
│                                   └────────────────────────┘   │
│                                                                 │
│  State: Zustand store (projects, history, rawInput, result)     │
│  API calls: Axios → http://localhost:8000                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                    REST API (JSON)
                              │
┌─────────────────────────────────────────────────────────────────┐
│                        BACKEND (FastAPI)                        │
│                                                                 │
│  POST /optimize/          ← core endpoint                       │
│  GET/POST /history/{id}   ← optimization history               │
│  GET/POST/PATCH/DELETE /projects/                               │
│  GET /health                                                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              prompt_optimizer.py                    │       │
│  │                                                     │       │
│  │  1. Count tokens of raw input                       │       │
│  │  2. If < 30 tokens → skip (return as-is)            │       │
│  │  3. Local RAG → retrieve best technique             │       │
│  │  4. Build system prompt + inject technique example  │       │
│  │  5. Call LLM → parse JSON response                  │       │
│  │  6. Return optimized + technique + rationale        │       │
│  └─────────────────────────────────────────────────────┘       │
│                     │                    │                      │
│          ┌──────────┘                    └──────────────┐       │
│          ▼                                              ▼       │
│  ┌───────────────────┐              ┌───────────────────────┐  │
│  │ knowledge_retriever│              │      llm_client.py    │  │
│  │                   │              │                       │  │
│  │ sentence-transformers             │  Gemini 2.0 Flash     │  │
│  │ all-MiniLM-L6-v2  │              │    → (fails) →        │  │
│  │ cosine similarity  │              │  Groq Llama 3.3-70B   │  │
│  │ disk cache (pkl)   │              │    → (fails) →        │  │
│  └───────────────────┘              │  OpenAI gpt-4o-mini   │  │
│                                     └───────────────────────┘  │
│                                                                 │
│  Database: SQLite (prompts.db)                                  │
│  Tables: projects, optimization_history, sessions, messages,    │
│          context_summaries, prompt_templates, token_stats       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Complete File Structure

```
prompt-generator/
├── start.bat                    # Windows launcher (runs start.ps1)
├── start.ps1                    # PowerShell: starts backend + frontend, no popups
├── BLUEPRINT.md                 # This file
│
├── .vscode/
│   └── tasks.json               # Ctrl+Shift+B starts both servers in VS Code terminal
│
├── backend/
│   ├── main.py                  # FastAPI app, CORS, router registration, DB init
│   ├── database.py              # SQLAlchemy engine + session factory (SQLite)
│   ├── models.py                # ORM models (Project, OptimizationHistory, etc.)
│   ├── schemas.py               # Pydantic request/response models
│   ├── knowledge_base.json      # 18 prompt engineering techniques (RAG source)
│   ├── .kb_embeddings.pkl       # Auto-generated embedding cache (sentence-transformers)
│   ├── prompts.db               # Auto-created SQLite database
│   ├── requirements.txt         # Python dependencies
│   ├── .env                     # API keys (not committed)
│   ├── .env.example             # Template for .env
│   │
│   ├── routers/
│   │   ├── optimize.py          # POST /optimize/ — core optimization endpoint
│   │   ├── projects.py          # CRUD for projects
│   │   ├── history.py           # GET/POST /history/{project_id}
│   │   ├── sessions.py          # Session management (legacy)
│   │   ├── messages.py          # Message storage (legacy)
│   │   ├── context.py           # Token stats
│   │   └── templates.py        # Prompt templates
│   │
│   └── services/
│       ├── prompt_optimizer.py  # Core: RAG + LLM orchestration
│       ├── llm_client.py        # 3-tier LLM fallback (Gemini → Groq → OpenAI)
│       ├── knowledge_retriever.py # Local RAG with sentence-transformers
│       └── token_counter.py     # Character-based token estimator
│
└── frontend/
    ├── package.json
    ├── tailwind.config.ts
    ├── tsconfig.json
    │
    ├── app/
    │   ├── layout.tsx           # Root layout, dark background
    │   ├── page.tsx             # Home → renders ProjectSelector
    │   └── project/[id]/
    │       └── page.tsx         # Main optimizer: 2-panel + history
    │
    ├── components/
    │   ├── ProjectSelector.tsx  # List / Create / Edit / Delete projects
    │   └── TokenMeter.tsx       # Token count visualization
    │
    └── lib/
        ├── api.ts               # All Axios API calls
        └── store.ts             # Zustand global state + history persistence
```

---

## Database Schema

```sql
-- Core project container
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  system_context TEXT,        -- injected into every optimization
  model TEXT DEFAULT 'gemini-2.0-flash',
  created_at DATETIME,
  updated_at DATETIME
);

-- Every optimization result
CREATE TABLE optimization_history (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  raw TEXT NOT NULL,
  optimized TEXT NOT NULL,
  technique TEXT,
  tokens_saved INTEGER DEFAULT 0,
  savings_pct REAL DEFAULT 0.0,
  created_at DATETIME
);

-- Token stats per day (for future analytics)
CREATE TABLE token_stats (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  raw_tokens INTEGER DEFAULT 0,
  optimized_tokens INTEGER DEFAULT 0,
  saved_tokens INTEGER DEFAULT 0
);
```

---

## Backend Setup

### 1. Python environment

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

pip install -r requirements.txt
```

### 2. requirements.txt

```
fastapi
uvicorn[standard]
sqlalchemy
pydantic
python-dotenv
openai           # used for Gemini + Groq (they have OpenAI-compatible APIs)
anthropic        # optional, for Claude models
sentence-transformers
numpy
```

### 3. .env file

```env
# Primary — free tier
GEMINI_API_KEY=your_gemini_key_here

# Fallback 1 — free tier
GROQ_API_KEY=your_groq_key_here

# Fallback 2 — paid last resort
OPENAI_API_KEY=your_openai_key_here

# Optional: override the optimizer model
# OPTIMIZER_MODEL=gemini-2.0-flash
# MIN_TOKENS_TO_OPTIMIZE=30
```

Get free keys:
- **Gemini**: https://aistudio.google.com/apikey
- **Groq**: https://console.groq.com

### 4. Run backend

```bash
python -m uvicorn main:app --port 8000 --reload
```

API docs auto-available at: http://localhost:8000/docs

---

## Frontend Setup

```bash
cd frontend
npm install
npm run dev -- -p 3001
```

App runs at: http://localhost:3001

---

## Key Implementation Details

### The Optimization Pipeline

```python
# backend/services/prompt_optimizer.py

async def optimize_prompt(raw_input, system_context=None, session_summary=None):

    # 1. Count tokens (character / 4 estimate)
    raw_tokens = count_tokens(raw_input, model)

    # 2. Short input fast-path — skip LLM, zero cost
    if raw_tokens < 30:
        return { "optimized": raw_input, "technique": "zero-shot", "skipped": True, ... }

    # 3. Local RAG — find best technique (zero API cost)
    match = retrieve_technique(raw_input)          # cosine similarity against KB
    technique_hint = build_technique_hint(match)   # ~80 tokens injected into system prompt

    # 4. Build system prompt
    system = OPTIMIZER_SYSTEM_PROMPT + technique_hint

    # 5. Build user message with chain context
    if system_context or session_summary:
        user_msg = f"[Project: {system_context}]\n[Chain: {session_summary}]\n\nInput:\n{raw_input}"
    else:
        user_msg = raw_input

    # 6. Call LLM (Gemini → Groq → OpenAI fallback chain)
    response = await complete(messages=[{"role": "user", "content": user_msg}],
                              model="gemini-2.0-flash", system=system, max_tokens=400)

    # 7. Parse JSON response
    result = json.loads(response)
    # → { "optimized": "...", "technique": "...", "rationale": "..." }
```

### The System Prompt (8 rules)

```
You are an expert prompt engineer at Anthropic. Transform the user's raw input into
an optimized, token-efficient prompt.

Rules:
1. ROLE — Assign a precise expert role when task-specific
2. TASK — Lead with a strong action verb: Analyze, Generate, Classify, Extract, Summarize
3. CONTEXT — Keep only essential context; cut filler words, hedging, repetition
4. FORMAT — Specify output format explicitly (JSON, bullets, table, single sentence)
5. BREVITY — Remove filler. Preserve ALL requirements, constraints, factual details.
6. POSITIVE — Rewrite "Don't do X" as "Do Y instead"
7. VARIABLES — Replace hardcoded values with {placeholders} where reuse makes sense
8. VALIDATE — Verify: (a) all requirements preserved, (b) no added assumptions, (c) complete instruction

Return ONLY valid JSON: {"optimized": "...", "technique": "...", "rationale": "..."}
technique: zero-shot | few-shot | chain-of-thought | role-prompting | ...
rationale: 1 sentence max
```

### Local RAG (Zero API Cost Technique Retrieval)

The knowledge base has 18 entries. Each describes a prompt engineering technique.

On first run, `sentence-transformers` embeds all 18 entries locally (CPU, ~2 seconds). The embeddings are cached to `.kb_embeddings.pkl` using an MD5 content hash as the cache key — so any edit to `knowledge_base.json` invalidates the cache automatically.

At query time:
1. Embed the user's raw input (local, ~30ms)
2. Cosine similarity against all 18 embeddings
3. Return top-1 match if score > 0.35 (threshold prevents weak matches)
4. Inject the matched technique's example into the system prompt (~80 tokens)

```json
// knowledge_base.json entry structure
{
  "id": "chain-of-thought",
  "technique": "chain-of-thought",
  "when_to_use": "Multi-step reasoning, math, logic, planning tasks",
  "keywords": ["step by step", "reason", "think", "explain", "walk through"],
  "example_raw": "Solve this math problem: ...",
  "example_optimized": "Solve step-by-step: ...",
  "token_note": "Add 'Think step-by-step.' — 4 tokens, significant accuracy gain"
}
```

**Techniques in the knowledge base:** zero-shot, few-shot, chain-of-thought, role-prompting, system-prompt, output-format, step-back, self-consistency, code-generation, contextual, variable-prompts, automatic-prompt-engineering, react, least-to-most, generated-knowledge, prompt-chaining

### 3-Tier LLM Fallback

```python
# backend/services/llm_client.py

async def _stream_gemini(messages, model, system, max_tokens):
    try:
        # Gemini uses OpenAI-compatible API
        client = AsyncOpenAI(api_key=GEMINI_API_KEY, base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
        # ... stream response
    except Exception as e:
        # Any error (rate limit, quota, network) → fall through to Groq
        async for chunk in _stream_groq(messages, "llama-3.3-70b-versatile", system, max_tokens):
            yield chunk

async def _stream_groq(messages, model, system, max_tokens):
    try:
        client = AsyncOpenAI(api_key=GROQ_API_KEY, base_url="https://api.groq.com/openai/v1")
        # ...
    except Exception as e:
        async for chunk in _stream_openai(messages, "gpt-4o-mini", system, max_tokens):
            yield chunk
```

**Key insight**: Gemini and Groq both expose OpenAI-compatible REST APIs, so the same `AsyncOpenAI` client works for all three — just swap `api_key` and `base_url`.

Model detection by prefix:
```python
def _is_gemini(model): return model.startswith("gemini")
def _is_groq(model):   return model.startswith("llama") or model.startswith("mixtral")
def _is_openai(model): return model.startswith("gpt") or model.startswith("o1")
def _is_claude(model): return model.startswith("claude")
```

### Chain of Prompts

When the user submits their 2nd, 3rd... prompt, the frontend sends the last 5 history items as context:

```typescript
// frontend/app/project/[id]/page.tsx
const chainContext = history.slice(0, 5).map((h) => ({ raw: h.raw, optimized: h.optimized }));
const result = await optimizePrompt(rawInput, projectId, chainContext);
```

The backend builds a compact summary:
```
[Chain context — previous prompts in this session:]
1. Raw: "write a python function to parse json"
   → Optimized: "Write a Python function that parses a JSON string..."
2. Raw: "add error handling"
   → Optimized: "Extend the function with try/except..."
```

This gets injected as `[Session so far: ...]` into the user message.

### History Persistence Strategy

Two-layer persistence (backend authoritative, localStorage for speed):

```typescript
// store.ts

addHistory: (item) => {
  // Layer 1: Update state + localStorage immediately (instant UI)
  const updated = [item, ...existing].slice(0, 20);
  localStorage.setItem(key, JSON.stringify(updated));
  set({ history: updated });

  // Layer 2: Fire-and-forget backend save (SQLite, survives browser clears)
  saveHistoryItem(projectId, item).catch(() => {});
},

loadHistory: (projectId) => {
  // Show localStorage first (instant, no flash)
  const cached = JSON.parse(localStorage.getItem(key) || "[]");
  if (cached.length > 0) set({ history: cached });

  // Then load from backend (authoritative)
  getHistory(projectId, 20).then((items) => {
    const mapped = items.map(mapBackendItem);
    set({ history: mapped });
    localStorage.setItem(key, JSON.stringify(mapped));  // sync back
  }).catch(() => { /* backend down — localStorage already shown */ });
},
```

---

## API Reference

### POST /optimize/

```json
// Request
{
  "raw_input": "write code that reads a csv file and calculates average",
  "project_id": "uuid-optional",
  "previous_prompts": [           // optional — chain context
    { "raw": "...", "optimized": "..." }
  ]
}

// Response
{
  "optimized": "Write a Python function that reads a CSV file using pandas...",
  "technique": "code-generation",
  "rationale": "Applied code-generation technique with explicit language and library specification.",
  "raw_tokens": 14,
  "optimized_tokens": 12,
  "tokens_saved": 2,
  "savings_pct": 14.3,
  "skipped": false
}
```

### GET /history/{project_id}?limit=20

```json
[
  {
    "id": "uuid",
    "project_id": "uuid",
    "raw": "...",
    "optimized": "...",
    "technique": "code-generation",
    "tokens_saved": 2,
    "savings_pct": 14.3,
    "created_at": "2026-02-25T10:30:00"
  }
]
```

### GET/POST/PATCH/DELETE /projects/

Standard CRUD. Project fields: `name`, `description`, `system_context`, `model`.

---

## Frontend Design

**Color palette:**
```
Background:  gray-950  (#030712)
Panels:      gray-900  (#111827)
Borders:     gray-800  (#1f2937)
Text:        gray-100, gray-400, gray-500
Accent:      indigo-600 (#4f46e5)  — buttons, focus rings
Success:     green-400  — token savings
Error:       red-900 border + red-400 text
```

**Layout: 2-panel side-by-side**
```
┌─────────────────────────────────────────────────────┐
│  ← Projects · ProjectName                AI Prompt  │  ← header
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│   Raw Input          │   Optimized Prompt           │
│   [textarea]         │   [result text]              │
│                      │                              │
│   ✨ Optimize  Ctrl+↵│   chain-of-thought  ↓12t    │
│                      │   📋 Copy                    │
│                      │   Rationale text...          │
├──────────────────────┴──────────────────────────────┤
│  Recent Optimizations                               │  ← history strip
│  raw preview → optimized preview  [technique] Copy Reuse
└─────────────────────────────────────────────────────┘
```

**Technique badge colors:**
```
chain-of-thought    → purple
role-prompting      → blue
few-shot            → green
zero-shot           → gray
system-prompt       → yellow
output-format       → yellow
code-generation     → cyan
contextual          → teal
variable-prompts    → teal
step-back           → orange
self-consistency    → red
automatic-prompt-engineering → pink
```

**UX patterns:**
- `Ctrl+Enter` submits optimization (keyboard shortcut shown inline)
- Animated spinner during loading
- Error panel with red border if backend is unreachable
- History items show on-hover Copy + Reuse buttons (opacity-0 → opacity-100)
- Project delete: click trash → shows "Confirm" button (3-second timeout to auto-cancel)
- Project edit: inline form replaces the card

---

## How to Start (VS Code)

Press **`Ctrl+Shift+B`** — both servers start in VS Code's integrated terminal.

Or double-click **`start.bat`** — opens a single PowerShell window with colored logs.

---

## Common Gotchas

| Problem | Cause | Fix |
|---------|-------|-----|
| History disappeared | Was localStorage-only before this version | Now SQLite-backed |
| Groq never used | Model ID `llama-...` was misrouted to else branch | Fixed: `_is_groq()` checks `startswith("llama")` |
| Optimization loses requirements | Old rule "target 40-60% compression" | Fixed: BREVITY rule now says "Preserve ALL requirements" |
| KB cache stale after edit | Was keyed by entry count | Fixed: MD5 hash of full JSON content |
| Wrong technique shown for code prompts | `code-generation` entry had `technique: "zero-shot"` | Fixed in KB |
| Weak technique matches | Similarity threshold was 0.25 | Raised to 0.35 |
| Silent failures | Frontend only did `console.error` | Added error state + red UI panel |

---

## Extending This App

**Add a new prompt engineering technique:**
1. Add an entry to `backend/knowledge_base.json` with the structure above
2. Delete `.kb_embeddings.pkl` (or it will auto-invalidate via MD5 hash)
3. Add a color entry in `TECHNIQUE_COLORS` in `frontend/app/project/[id]/page.tsx`

**Add a new LLM provider:**
1. Add env vars in `.env`
2. Add `_is_xxx()` and `_stream_xxx()` in `llm_client.py`
3. Add to the routing chain in `stream_response()`

**Move to PostgreSQL:**
```python
# database.py — just change the URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/promptdb")
# Remove SQLite-specific connect_args
```

---

*Built with FastAPI, Next.js 14, sentence-transformers, Gemini 2.0 Flash.*
