"""Multi-provider LLM client with unified interface."""

import logging
from typing import AsyncIterator
from openai import AsyncOpenAI
from backend.config import settings

logger = logging.getLogger(__name__)

# Module-level token usage tracking
_last_usage: dict = {}
_cumulative_usage: dict = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def get_last_usage() -> dict:
    """Get a copy of the last API call's token usage."""
    return _last_usage.copy()


def reset_usage():
    """Reset the tracked last-call usage to empty."""
    global _last_usage
    _last_usage = {}


def get_cumulative_usage() -> dict:
    """Get cumulative token usage across all calls."""
    return _cumulative_usage.copy()


def reset_cumulative_usage():
    """Reset cumulative usage to zero."""
    global _cumulative_usage
    _cumulative_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}


def _add_to_cumulative(prompt_tokens: int, completion_tokens: int):
    global _cumulative_usage
    _cumulative_usage["prompt_tokens"] += prompt_tokens
    _cumulative_usage["completion_tokens"] += completion_tokens
    _cumulative_usage["total_tokens"] += prompt_tokens + completion_tokens


def _record_usage(usage):
    """Record token usage from an API response (OpenAI-compatible format)."""
    global _last_usage
    if usage:
        pt = getattr(usage, "prompt_tokens", 0) or 0
        ct = getattr(usage, "completion_tokens", 0) or 0
        tt = getattr(usage, "total_tokens", 0) or (pt + ct)
        _last_usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt}
        _add_to_cumulative(pt, ct)


def _record_anthropic_usage(response):
    """Record token usage from an Anthropic API response."""
    global _last_usage
    if hasattr(response, "usage") and response.usage:
        pt = response.usage.input_tokens or 0
        ct = response.usage.output_tokens or 0
        _last_usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": pt + ct}
        _add_to_cumulative(pt, ct)


def estimate_cost(prompt_tokens: int, completion_tokens: int) -> str:
    """Estimate cost in RMB based on current provider."""
    provider = settings.llm_provider
    if provider == "deepseek":
        cost = (prompt_tokens / 1_000_000) * 1.0 + (completion_tokens / 1_000_000) * 2.0
        return f"¥{cost:.4f}"
    elif provider == "claude":
        cost = (prompt_tokens / 1_000_000) * 3.0 + (completion_tokens / 1_000_000) * 15.0
        return f"${cost:.4f}"
    elif provider == "openai":
        cost = (prompt_tokens / 1_000_000) * 2.5 + (completion_tokens / 1_000_000) * 10.0
        return f"${cost:.4f}"
    return "未知"


def _get_openai_client() -> AsyncOpenAI:
    """Create an OpenAI-compatible client based on current settings."""
    provider = settings.llm_provider

    if provider == "deepseek":
        api_key = settings.deepseek_api_key
        base_url = "https://api.deepseek.com/v1"
    elif provider == "openai":
        api_key = settings.openai_api_key
        base_url = settings.openai_base_url or "https://api.openai.com/v1"
    else:
        api_key = None
        base_url = None

    if not api_key:
        raise ValueError(f"No API key configured for provider: {provider}")

    return AsyncOpenAI(api_key=api_key, base_url=base_url)


def _get_anthropic_client():
    """Create an Anthropic client."""
    import anthropic
    api_key = settings.anthropic_api_key
    if not api_key:
        raise ValueError("No Anthropic API key configured")
    return anthropic.AsyncAnthropic(api_key=api_key)


def _get_model_name() -> str:
    """Get the model name from settings, with provider defaults."""
    if settings.llm_model:
        return settings.llm_model
    provider = settings.llm_provider
    defaults = {
        "deepseek": "deepseek-chat",
        "claude": "claude-sonnet-4-6",
        "openai": "gpt-4o",
    }
    return defaults.get(provider, "gpt-4o")


async def chat(messages: list[dict], temperature: float = 0.7, max_tokens: int = 4096) -> str:
    """Send a chat completion and return the full response text."""
    provider = settings.llm_provider
    model = _get_model_name()

    if provider == "claude":
        client = _get_anthropic_client()
        system_msg = None
        user_msgs = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                user_msgs.append(m)

        kwargs = {"model": model, "messages": user_msgs, "max_tokens": max_tokens}
        if system_msg:
            kwargs["system"] = system_msg

        response = await client.messages.create(**kwargs)
        _record_anthropic_usage(response)
        return response.content[0].text

    else:
        # OpenAI-compatible (DeepSeek, OpenAI, etc.)
        client = _get_openai_client()
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        _record_usage(response.usage)
        return response.choices[0].message.content or ""


async def chat_stream(messages: list[dict], temperature: float = 0.7, max_tokens: int = 4096) -> AsyncIterator[str]:
    """Stream a chat completion, yielding text chunks."""
    provider = settings.llm_provider
    model = _get_model_name()

    if provider == "claude":
        import anthropic
        client = _get_anthropic_client()
        system_msg = None
        user_msgs = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                user_msgs.append(m)

        kwargs = {"model": model, "messages": user_msgs, "max_tokens": max_tokens}
        if system_msg:
            kwargs["system"] = system_msg

        async with client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
    else:
        client = _get_openai_client()
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
            if hasattr(chunk, "usage") and chunk.usage:
                _record_usage(chunk.usage)
