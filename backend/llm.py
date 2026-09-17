"""
Engram — LLM Provider Abstraction

Single interface for all LLM calls. Swap providers by setting two env vars:

  LLM_PROVIDER=gemini   + GEMINI_API_KEY    (default)
  LLM_PROVIDER=openai   + OPENAI_API_KEY    (GPT-4o, GPT-4o-mini, etc.)
  LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY (Claude 3.5 Sonnet, etc.)
  LLM_PROVIDER=deepseek + DEEPSEEK_API_KEY  (deepseek-chat, deepseek-reasoner)

Default models per provider (override with LLM_MODEL in .env):
  gemini    → gemini-3-flash-preview
  openai    → gpt-4o-mini
  anthropic → claude-3-5-haiku-20241022
  deepseek  → deepseek-chat

"""

import os
import time
import random
from functools import lru_cache, wraps
from config import get_settings

settings = get_settings()

def get_provider() -> str:
    return os.getenv("LLM_PROVIDER", "gemini").lower().strip()

def get_model() -> str:
    override = os.getenv("LLM_MODEL", "").strip()
    if override:
        return override
    defaults = {
        "gemini":    "gemini-3-flash-preview",
        "openai":    "gpt-4o-mini",
        "anthropic": "claude-3-5-haiku-20241022",
        "deepseek":  "deepseek-chat",
    }
    return defaults.get(get_provider(), "gemini-3-flash-preview")

def _gemini_complete(system: str, user: str) -> str:
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY", getattr(settings, "gemini_api_key", ""))
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=get_model(),
        system_instruction=system,
    )
    response = model.generate_content(user)
    return response.text.strip()

def _gemini_chat(system: str, history: list[dict], message: str) -> str:
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY", getattr(settings, "gemini_api_key", ""))
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=get_model(),
        system_instruction=system,
    )
    gemini_history = [
        {"role": m["role"], "parts": [m["content"]]}
        for m in history
    ]
    session = model.start_chat(history=gemini_history)
    response = session.send_message(message)
    return response.text.strip()

def _openai_complete(system: str, user: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    resp = client.chat.completions.create(
        model=get_model(),
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        max_tokens=2048,
    )
    return resp.choices[0].message.content.strip()

def _openai_chat(system: str, history: list[dict], message: str) -> str:
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    messages = [{"role": "system", "content": system}]
    for m in history:

        role = "assistant" if m["role"] == "model" else m["role"]
        messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": message})
    resp = client.chat.completions.create(
        model=get_model(),
        messages=messages,
        max_tokens=2048,
    )
    return resp.choices[0].message.content.strip()

def _anthropic_complete(system: str, user: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    resp = client.messages.create(
        model=get_model(),
        max_tokens=2048,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return resp.content[0].text.strip()

def _anthropic_chat(system: str, history: list[dict], message: str) -> str:
    import anthropic
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    messages = []
    for m in history:
        role = "assistant" if m["role"] == "model" else m["role"]
        messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": message})
    resp = client.messages.create(
        model=get_model(),
        max_tokens=2048,
        system=system,
        messages=messages,
    )
    return resp.content[0].text.strip()

def _deepseek_complete(system: str, user: str) -> str:
    from openai import OpenAI
    client = OpenAI(
        api_key=os.environ["DEEPSEEK_API_KEY"],
        base_url="https://api.deepseek.com",
    )
    resp = client.chat.completions.create(
        model=get_model(),
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        max_tokens=2048,
    )
    return resp.choices[0].message.content.strip()

def _deepseek_chat(system: str, history: list[dict], message: str) -> str:
    from openai import OpenAI
    client = OpenAI(
        api_key=os.environ["DEEPSEEK_API_KEY"],
        base_url="https://api.deepseek.com",
    )
    messages = [{"role": "system", "content": system}]
    for m in history:
        role = "assistant" if m["role"] == "model" else m["role"]
        messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": message})
    resp = client.chat.completions.create(
        model=get_model(),
        messages=messages,
        max_tokens=2048,
    )
    return resp.choices[0].message.content.strip()

_COMPLETE = {
    "gemini":    _gemini_complete,
    "openai":    _openai_complete,
    "anthropic": _anthropic_complete,
    "deepseek":  _deepseek_complete,
}

_CHAT = {
    "gemini":    _gemini_chat,
    "openai":    _openai_chat,
    "anthropic": _anthropic_chat,
    "deepseek":  _deepseek_chat,
}

_MAX_RETRIES = 3

def _is_transient(exc: BaseException) -> bool:
    """Classify whether an LLM error is worth retrying.

    Retry only when there's a plausible chance the next attempt succeeds:
      • rate limits          (429 / ResourceExhausted)
      • timeouts             (DeadlineExceeded, timeout errors)
      • server errors        (5xx / InternalServerError / Unavailable)
      • connection problems  (transient network blips)
      • google api-core errors explicitly marked `.retryable`

    Do NOT retry permanent failures — bad credentials, invalid requests,
    and safety blocks won't fix themselves with another attempt:
      • 4xx other than 408/409/429   (auth, forbidden, bad request, ...)
      • google errors with `.retryable is False`  (incl. safety blocks)
    """
    # google.api_core exceptions carry an explicit, authoritative signal.
    if hasattr(exc, "retryable"):
        return bool(exc.retryable)

    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if isinstance(status, int):
        return status in (408, 409, 429) or 500 <= status < 600

    name = type(exc).__name__
    transient_names = {
        "RateLimitError",          # openai / anthropic
        "APITimeoutError",         # openai
        "APIConnectionError",      # openai
        "TimeoutError",            # builtin / anthropic
        "ConnectionError",         # builtin
        "InternalServerError",     # openai / deepseek
        "ServiceUnavailableError", # openai
        "ServerError",             # anthropic
    }
    if name in transient_names:
        return True

    # Anthropic / Gemini sometimes raise an APIStatusError subclass; check the
    # status embedded in the message as a last resort.
    import re
    m = re.search(r"\b(429|50[0-9])\b", str(exc))
    return m is not None

def _wrap_retry(fn):
    """Decorator: retry transient LLM errors up to _MAX_RETRIES times.

    Exponential backoff (1s → 2s → ...) with ±50% jitter. Logs a warning
    on each retry. Preserves the wrapped function's signature — public
    `complete()` / `chat_complete()` args are unchanged.
    """
    @wraps(fn)
    def _wrapped(*args, **kwargs):
        attempt = 0
        while True:
            try:
                return fn(*args, **kwargs)
            except Exception as e:
                attempt += 1
                if attempt >= _MAX_RETRIES or not _is_transient(e):
                    raise
                delay = (2 ** (attempt - 1)) * random.uniform(0.5, 1.5)
                print(f"[Engram] LLM {fn.__name__} failed (transient: "
                      f"{type(e).__name__}) — retry {attempt}/{_MAX_RETRIES - 1} "
                      f"in {delay:.1f}s")
                time.sleep(delay)
    return _wrapped

@_wrap_retry
def complete(system: str, user: str) -> str:
    """
    Single-turn LLM call. Used by extractor, HyDE, graph classifier.
    Raises on error — callers handle gracefully.
    """
    provider = get_provider()
    fn = _COMPLETE.get(provider)
    if not fn:
        raise ValueError(f"Unknown LLM provider: '{provider}'. "
                         f"Set LLM_PROVIDER to one of: gemini, openai, anthropic, deepseek")
    return fn(system, user)

@_wrap_retry
def chat_complete(system: str, history: list[dict], message: str) -> str:
    """
    Multi-turn chat. Used by brain.chat().
    history: list of {"role": "user"|"assistant"|"model", "content": "..."}
    """
    provider = get_provider()
    fn = _CHAT.get(provider)
    if not fn:
        raise ValueError(f"Unknown LLM provider: '{provider}'.")
    return fn(system, history, message)

# ---------------------------------------------------------------------------
# Streaming (token-level) — same providers, same prompt construction.
# `chat_complete()` above stays byte-identical; these are additive.
# Each *_chat_stream() is a **sync generator** (runs inside the OpenAI SDK /
# genai / anthropic iterables). stream_chat_complete() drives them through
# asyncio.to_thread so the FastAPI event loop is never blocked per token.
# ---------------------------------------------------------------------------

def _gemini_chat_stream(system: str, history: list[dict], message: str):
    import google.generativeai as genai
    api_key = os.getenv("GEMINI_API_KEY", getattr(settings, "gemini_api_key", ""))
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=get_model(),
        system_instruction=system,
    )
    gemini_history = [{"role": m["role"], "parts": [m["content"]]} for m in history]
    session = model.start_chat(history=gemini_history)
    response = session.send_message(message, stream=True)
    for chunk in response:
        try:
            text = chunk.text or ""
        except Exception:
            continue
        if text:
            yield text

def _openai_chat_stream(system: str, history: list[dict], message: str):
    from openai import OpenAI
    import os
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    messages = [{"role": "system", "content": system}]
    for m in history:
        role = "assistant" if m["role"] == "model" else m["role"]
        messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": message})
    stream = client.chat.completions.create(
        model=get_model(),
        messages=messages,
        max_tokens=2048,
        stream=True,
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content

def _anthropic_chat_stream(system: str, history: list[dict], message: str):
    import anthropic
    import typing
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    messages = []
    for m in history:
        role = "assistant" if m["role"] == "model" else m["role"]
        messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": message})
    with client.messages.stream(
        model=get_model(),
        max_tokens=2048,
        system=system,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            if text:
                yield text

def _deepseek_chat_stream(system: str, history: list[dict], message: str):
    from openai import OpenAI
    import os
    client = OpenAI(
        api_key=os.environ["DEEPSEEK_API_KEY"],
        base_url="https://api.deepseek.com",
    )
    messages = [{"role": "system", "content": system}]
    for m in history:
        role = "assistant" if m["role"] == "model" else m["role"]
        messages.append({"role": role, "content": m["content"]})
    messages.append({"role": "user", "content": message})
    stream = client.chat.completions.create(
        model=get_model(),
        messages=messages,
        max_tokens=2048,
        stream=True,
    )
    for chunk in stream:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content

_STREAM_CHAT = {
    "gemini":    _gemini_chat_stream,
    "openai":    _openai_chat_stream,
    "anthropic": _anthropic_chat_stream,
    "deepseek":  _deepseek_chat_stream,
}

async def stream_chat_complete(system: str, history: list[dict], message: str) -> typing.AsyncIterator[str]:
    """Async stream of chat tokens. Falls back to a single non-streaming
    completion (one yield) when the provider has no stream path, so callers
    can always consume it identically."""
    provider = get_provider()
    fn = _STREAM_CHAT.get(provider)
    if not fn:
        yield await asyncio.to_thread(chat_complete, system, history, message)
        return
    for token in await asyncio.to_thread(_run_stream, fn, system, history, message):
        if token:
            yield token

def _run_stream(fn, system, history, message):
    for token in fn(system, history, message):
        yield token

def provider_info() -> dict:
    """Returns current provider and model — used by /health endpoint."""
    return {"provider": get_provider(), "model": get_model()}
