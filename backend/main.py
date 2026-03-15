from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
import models  # noqa: F401 — registers all ORM models

from routers import projects, sessions, messages, optimize, context, templates, history

# Create all DB tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Prompt Generator",
    description="Local app for optimizing and organizing prompts across projects.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(sessions.router)
app.include_router(messages.router)
app.include_router(optimize.router)
app.include_router(context.router)
app.include_router(templates.router)
app.include_router(history.router)


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}
