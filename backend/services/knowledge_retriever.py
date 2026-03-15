"""
Local knowledge retriever — zero API cost.
Uses sentence-transformers (runs on CPU) to find the most relevant
prompt engineering technique from knowledge_base.json for any given input.

Flow:
1. On first run: loads knowledge_base.json, embeds all entries, caches to disk
2. At query time: embed the user's input locally → cosine similarity → return top-1 match
3. The matched technique's example is injected into the optimizer prompt (~80 tokens)

Total API cost added: 0 tokens for retrieval.
"""
import hashlib
import json
import os
import pickle
from pathlib import Path
from typing import Optional

import numpy as np

KB_PATH = Path(__file__).parent.parent / "knowledge_base.json"
CACHE_PATH = Path(__file__).parent.parent / ".kb_embeddings.pkl"
MODEL_NAME = "all-MiniLM-L6-v2"  # 22MB, fast on CPU, good semantic similarity

_model = None
_entries = None
_embeddings = None


def _load_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def _get_knowledge_base():
    """Load and embed knowledge base. Uses disk cache after first run."""
    global _entries, _embeddings

    if _entries is not None and _embeddings is not None:
        return _entries, _embeddings

    # Load knowledge base
    with open(KB_PATH, "r", encoding="utf-8") as f:
        _entries = json.load(f)

    # Content hash for cache invalidation (catches edits without entry count changes)
    content_hash = hashlib.md5(
        json.dumps(_entries, sort_keys=True).encode()
    ).hexdigest()

    # Try to load cached embeddings
    if CACHE_PATH.exists():
        try:
            with open(CACHE_PATH, "rb") as f:
                cache = pickle.load(f)
            if cache.get("content_hash") == content_hash:
                _embeddings = cache["embeddings"]
                return _entries, _embeddings
        except Exception:
            pass

    # Build embeddings from scratch
    model = _load_model()
    texts = [_entry_to_text(e) for e in _entries]
    _embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)

    # Cache to disk for next run
    with open(CACHE_PATH, "wb") as f:
        pickle.dump({"content_hash": content_hash, "embeddings": _embeddings}, f)

    return _entries, _embeddings


def _entry_to_text(entry: dict) -> str:
    """Convert a KB entry into a string for embedding."""
    return " ".join([
        entry.get("technique", ""),
        entry.get("when_to_use", ""),
        " ".join(entry.get("keywords", [])),
    ])


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Compute cosine similarity between a vector and a matrix."""
    a_norm = a / (np.linalg.norm(a) + 1e-9)
    b_norm = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-9)
    return b_norm @ a_norm


def retrieve_technique(user_input: str, top_k: int = 1) -> Optional[dict]:
    """
    Find the most relevant prompt engineering technique for the given input.
    Returns a dict with: technique, example_optimized, token_note, when_to_use
    Cost: 0 API tokens.
    """
    try:
        entries, embeddings = _get_knowledge_base()
        model = _load_model()

        query_embedding = model.encode(user_input, convert_to_numpy=True, show_progress_bar=False)
        scores = _cosine_similarity(query_embedding, embeddings)
        top_idx = int(np.argmax(scores))
        top_score = float(scores[top_idx])

        # Only return if similarity is meaningful (>0.35 prevents weak/irrelevant matches)
        if top_score < 0.35:
            return None

        entry = entries[top_idx]
        return {
            "technique": entry["technique"],
            "when_to_use": entry["when_to_use"],
            "example_raw": entry.get("example_raw", ""),
            "example_optimized": entry.get("example_optimized", ""),
            "token_note": entry.get("token_note", ""),
            "score": round(top_score, 3),
        }

    except Exception as e:
        # Never crash the optimizer if retrieval fails
        return None


def build_technique_hint(match: Optional[dict]) -> str:
    """
    Format the retrieved technique as a compact hint to inject into the optimizer.
    Keeps it to ~80 tokens max.
    """
    if not match:
        return ""

    technique = match["technique"]
    token_note = match["token_note"]
    example_opt = match["example_optimized"]

    # Truncate example if too long
    if len(example_opt) > 400:
        example_opt = example_opt[:400] + "..."

    return (
        f"\n\n[RETRIEVED TECHNIQUE — {technique.upper()}]\n"
        f"When to use: {match['when_to_use'][:120]}\n"
        f"Key rule: {token_note}\n"
        f"Optimized example:\n{example_opt}"
    )


def preload():
    """Call this at startup to pre-load and cache embeddings."""
    try:
        _get_knowledge_base()
        print("[KnowledgeRetriever] Embeddings loaded and cached.")
    except Exception as e:
        print(f"[KnowledgeRetriever] Warning: could not preload ({e})")
