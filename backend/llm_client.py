"""
llm_client.py — Optimized Ollama HTTP client
"""

from __future__ import annotations
import logging
import os
from typing import Optional, List, Dict

import httpx

logger = logging.getLogger(__name__)
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_MODEL = "llama3:latest"


# ✅ Reuse client (BIG performance win)
_client: Optional[httpx.AsyncClient] = None

system_prompt = """
You are a senior product analyst and technical consultant.

Your job is to compare two technical documents with precision and depth.

Rules:
- Be concise, structured, and evidence-driven.
- Do NOT give generic statements.
- Always reference concrete features from the documents.
- Avoid vague phrases like "more robust" or "better performance" without justification.
- Focus on developer impact, feature coverage, and real-world usability.

Tone:
- Professional, analytical, and confident.
- No storytelling, no fluff, no repetition.

Output style:
- Clear sections
- Bullet points where useful
- Direct, high-signal insights only
"""

def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, connect=5.0),
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _client


# ─────────────────────────────────────────────
# Generate (non-streaming)
# ─────────────────────────────────────────────
async def ollama_generate(
    prompt: str,
    system: Optional[str] = None,   # make optional (avoid conflicts)
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 512,
) -> str:
    model = model or OLLAMA_MODEL

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    #  Only include system if explicitly passed
    if system:
        payload["system"] = system

    client = get_client()

    last_error = None

    for attempt in range(2):  #  retry once
        try:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json=payload,
                timeout=httpx.Timeout(400, connect=5.0)
            )

            resp.raise_for_status()

            #  Safe JSON parsing
            try:
                data = resp.json()
            except Exception as e:
                logger.error(f"Ollama JSON parse failed: {e}")
                last_error = e
                continue

            # Debug (truncate safely)
            logger.info(f"Ollama raw response: {str(data)[:300]}")

            output = data.get("response")

            #  Handle missing/empty output
            if not output or not output.strip():
                logger.warning("Empty response from Ollama")
                last_error = ValueError("Empty response")
                continue

            return output.strip()

        except httpx.ConnectError as e:
            logger.error("Ollama not reachable (connection error)")
            return ""   #  no retry — infra issue

        except httpx.ReadTimeout as e:
            logger.warning(f"Ollama timeout (attempt {attempt+1})")
            last_error = e

        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama HTTP error: {e.response.text[:200]}")
            last_error = e

        except Exception as e:
            logger.error(f"LLM generation error (attempt {attempt+1}): {e}", exc_info=True)
            last_error = e

    #  Final failure after retries
    logger.error(f"Ollama failed after retries: {last_error}")
    return ""


# ─────────────────────────────────────────────
# Chat API
# ─────────────────────────────────────────────
async def ollama_chat(
    messages: List[Dict],
    model: Optional[str] = None,
    temperature: float = 0.4,
) -> str:
    model = model or OLLAMA_MODEL

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }

    try:
        client = get_client()

        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
        )

        resp.raise_for_status()
        data = resp.json()

        return data.get("message", {}).get("content", "").strip()

    except Exception as e:
        logger.error(f"Ollama chat error: {e}")
        return ""


# ─────────────────────────────────────────────
# Health check (cached optional)
# ─────────────────────────────────────────────
async def check_ollama_health() -> dict:
    try:
        client = get_client()

        resp = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
        resp.raise_for_status()

        data = resp.json()
        models = [m["name"] for m in data.get("models", [])]

        return {
            "status": "online",
            "models": models,
            "current_model": OLLAMA_MODEL,
        }

    except Exception:
        return {
            "status": "offline",
            "models": [],
            "current_model": OLLAMA_MODEL,
        }


# ─────────────────────────────────────────────
# Fallback
# ─────────────────────────────────────────────
def _fallback_response() -> str:
    return (
        "[LLM Offline] Ollama is not available. "
        "Run `ollama serve` and `ollama pull llama3`. "
        "Showing NLP-based insights only."
    )