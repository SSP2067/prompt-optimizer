"""
LLM client — 3-tier fallback chain (all free/cheap):
  1. Gemini 2.0 Flash  (Google, free tier — primary)
  2. Groq Llama 3.3    (Groq, free tier — fallback on Gemini rate limit)
  3. OpenAI gpt-4o-mini (paid, last resort)

Fallback triggers: 429 / quota exceeded / resource_exhausted errors.
"""
import os
from typing import AsyncGenerator, List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY    = os.getenv("GEMINI_API_KEY", "")
GROQ_API_KEY      = os.getenv("GROQ_API_KEY", "")

GEMINI_BASE_URL   = "https://generativelanguage.googleapis.com/v1beta/openai/"
GROQ_BASE_URL     = "https://api.groq.com/openai/v1"

GROQ_FALLBACK     = "llama-3.3-70b-versatile"   # best free Groq model
OPENAI_FALLBACK   = "gpt-4o-mini"                # paid last resort
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "20"))


def _is_gemini(model: str) -> bool:
    return model.startswith("gemini")

def _is_claude(model: str) -> bool:
    return model.startswith("claude")

def _is_groq(model: str) -> bool:
    return model.startswith("llama") or model.startswith("mixtral") or model.startswith("deepseek")

def _is_openai(model: str) -> bool:
    return model.startswith("gpt") or model.startswith("o1") or model.startswith("o3")


async def stream_response(
    messages: List[Dict],
    model: str,
    system: Optional[str] = None,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    """Stream LLM response tokens. Yields string chunks."""
    if _is_gemini(model):
        async for chunk in _stream_gemini(messages, model, system, max_tokens, temperature):
            yield chunk
    elif _is_claude(model):
        async for chunk in _stream_claude(messages, model, system, max_tokens, temperature):
            yield chunk
    elif _is_groq(model):
        async for chunk in _stream_groq(messages, model, system, max_tokens, temperature):
            yield chunk
    elif _is_openai(model):
        async for chunk in _stream_openai(messages, model, system, max_tokens, temperature):
            yield chunk
    else:
        yield f"[Error: unsupported model '{model}']"


async def complete(
    messages: List[Dict],
    model: str,
    system: Optional[str] = None,
    max_tokens: int = 1024,
    temperature: float = 0.7,
) -> str:
    """Non-streaming completion. Returns full response string."""
    result = []
    async for chunk in stream_response(messages, model, system, max_tokens, temperature):
        result.append(chunk)
    return "".join(result)


# ── Gemini (primary) ──────────────────────────────────────────────────────────

async def _stream_gemini(
    messages: List[Dict],
    model: str,
    system: Optional[str],
    max_tokens: int,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=GEMINI_API_KEY,
            base_url=GEMINI_BASE_URL,
            timeout=LLM_TIMEOUT_SECONDS,
        )

        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        stream = await client.chat.completions.create(
            model=model,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    except Exception as e:
        print(f"[LLM] Gemini failed ({e}) → falling back to Groq ({GROQ_FALLBACK})")
        async for chunk in _stream_groq(messages, GROQ_FALLBACK, system, max_tokens, temperature):
            yield chunk


# ── Groq (first fallback, free) ───────────────────────────────────────────────

async def _stream_groq(
    messages: List[Dict],
    model: str,
    system: Optional[str],
    max_tokens: int,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=GROQ_API_KEY,
            base_url=GROQ_BASE_URL,
            timeout=LLM_TIMEOUT_SECONDS,
        )

        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        stream = await client.chat.completions.create(
            model=model,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    except Exception as e:
        print(f"[LLM] Groq failed ({e}) → falling back to OpenAI ({OPENAI_FALLBACK})")
        async for chunk in _stream_openai(messages, OPENAI_FALLBACK, system, max_tokens, temperature):
            yield chunk


# ── OpenAI (last resort, paid) ────────────────────────────────────────────────

async def _stream_openai(
    messages: List[Dict],
    model: str,
    system: Optional[str],
    max_tokens: int,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=OPENAI_API_KEY, timeout=LLM_TIMEOUT_SECONDS)

        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        stream = await client.chat.completions.create(
            model=model,
            messages=all_messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content
    except Exception as e:
        yield f"[OpenAI error: {e}]"


# ── Claude (optional) ─────────────────────────────────────────────────────────

async def _stream_claude(
    messages: List[Dict],
    model: str,
    system: Optional[str],
    max_tokens: int,
    temperature: float = 0.7,
) -> AsyncGenerator[str, None]:
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        kwargs = dict(model=model, messages=messages, max_tokens=max_tokens, temperature=temperature)
        if system:
            kwargs["system"] = system
        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
    except Exception as e:
        yield f"[Claude error: {e}]"
