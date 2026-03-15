"""
Token counting service.
Uses tiktoken for OpenAI models and estimates for Anthropic/Gemini.
"""
import tiktoken
from typing import List, Dict


# Map model names to tiktoken encodings
MODEL_ENCODING_MAP = {
    "gpt-4o": "o200k_base",
    "gpt-4o-mini": "o200k_base",
    "gpt-4": "cl100k_base",
    "gpt-3.5-turbo": "cl100k_base",
}

# Anthropic/Gemini: approximate at ~4 chars per token
CHARS_PER_TOKEN = 4


def count_tokens(text: str, model: str = "gpt-4o") -> int:
    """Count tokens in a string for a given model."""
    if not text:
        return 0

    # OpenAI models: use tiktoken
    encoding_name = MODEL_ENCODING_MAP.get(model)
    if encoding_name:
        try:
            enc = tiktoken.get_encoding(encoding_name)
            return len(enc.encode(text))
        except Exception:
            pass

    # Claude/Gemini: character-based approximation
    # Claude tokenizes closer to 3.5-4 chars/token on average
    return max(1, len(text) // CHARS_PER_TOKEN)


def count_messages_tokens(messages: List[Dict], model: str = "gpt-4o") -> int:
    """Count total tokens across a list of message dicts."""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        total += count_tokens(content, model)
        total += 4  # per-message overhead (role + formatting)
    return total


def get_model_context_limit(model: str) -> int:
    """Return the context window size for a given model."""
    limits = {
        # Claude models
        "claude-opus-4-6": 200_000,
        "claude-sonnet-4-6": 200_000,
        "claude-haiku-4-5-20251001": 200_000,
        # OpenAI models
        "gpt-4o": 128_000,
        "gpt-4o-mini": 128_000,
        "gpt-4": 8_192,
        "gpt-3.5-turbo": 16_385,
        # Gemini
        "gemini-2.0-flash": 1_000_000,
        "gemini-2.0-flash-lite": 1_000_000,
        "gemini-1.5-pro": 1_000_000,
        "gemini-1.5-flash": 1_000_000,
    }
    return limits.get(model, 100_000)
