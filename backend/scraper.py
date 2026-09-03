"""
scraper.py
──────────
Robust data ingestion pipeline.
  - Playwright async browser pool with user-agent rotation + request delays
  - Reddit JSON API (no auth required for public endpoints)
  - Exa.ai semantic search (minimal, targeted use)
  - BeautifulSoup content extraction
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from dataclasses import dataclass, field
from typing import Optional

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── User-Agent pool ────────────────────────────────────────────────────────────

USER_AGENTS: list[str] = [
    # Chrome on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Chrome on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    # Firefox on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Firefox on Linux
    "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
    # Safari on macOS
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
    # Edge on Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    # Mobile Chrome (Android)
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
]

_DELAY_MIN = 1.2   # seconds between requests
_DELAY_MAX = 3.5

_PLAYWRIGHT_DELAY_MIN = 1500   # ms for Playwright
_PLAYWRIGHT_DELAY_MAX = 4000


def _random_ua() -> str:
    return random.choice(USER_AGENTS)


def _random_delay_sync(min_s: float = _DELAY_MIN, max_s: float = _DELAY_MAX) -> None:
    time.sleep(random.uniform(min_s, max_s))


async def _random_delay(min_s: float = _DELAY_MIN, max_s: float = _DELAY_MAX) -> None:
    await asyncio.sleep(random.uniform(min_s, max_s))


# ═══════════════════════════════════════════════════════════════════════════════
# PLAYWRIGHT SCRAPER
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ScrapedPage:
    url: str
    title: str = ""
    body_text: str = ""
    meta_description: str = ""
    error: Optional[str] = None


async def scrape_url_playwright(url: str) -> ScrapedPage:
    """
    Scrape a single URL using Playwright with a random user-agent,
    viewport randomization, and human-like navigation delays.
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return ScrapedPage(url=url, error="Playwright not installed")

    result = ScrapedPage(url=url)
    ua = _random_ua()

    # Random viewport to avoid fingerprinting
    viewports = [
        {"width": 1920, "height": 1080},
        {"width": 1440, "height": 900},
        {"width": 1366, "height": 768},
        {"width": 1280, "height": 800},
    ]
    vp = random.choice(viewports)

    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            ctx = await browser.new_context(
                user_agent=ua,
                viewport=vp,
                locale="en-US",
                timezone_id="America/New_York",
            )
            page = await ctx.new_page()

            # Block images/fonts to speed up scraping
            await page.route(
                "**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,otf}",
                lambda route: route.abort(),
            )

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20_000)
            except Exception as e:
                result.error = f"Navigation error: {e}"
                await browser.close()
                return result

            # Simulate human scroll
            await page.evaluate("window.scrollBy(0, Math.random() * 500 + 200)")
            await asyncio.sleep(random.uniform(_PLAYWRIGHT_DELAY_MIN / 1000, _PLAYWRIGHT_DELAY_MAX / 1000))

            html = await page.content()
            result.title = await page.title()

            await browser.close()

        # Parse with BeautifulSoup
        soup = BeautifulSoup(html, "lxml")

        # Remove nav, header, footer, scripts, styles
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
            tag.decompose()

        # Extract meta description
        meta = soup.find("meta", attrs={"name": "description"})
        if meta and meta.get("content"):
            result.meta_description = meta["content"]

        # Main content extraction: prioritize <article>, <main>, largest <div>
        main = soup.find("article") or soup.find("main") or soup.find("div", class_=re.compile(r"content|main|body", re.I))
        target = main if main else soup.body

        if target:
            paragraphs = target.find_all(["p", "h1", "h2", "h3", "li"])
            result.body_text = " ".join(
                p.get_text(separator=" ", strip=True) for p in paragraphs
            )[:8000]

    except Exception as e:
        result.error = str(e)
        logger.error(f"Playwright error for {url}: {e}")

    return result


async def scrape_multiple_urls(urls: list[str], max_concurrent: int = 3) -> list[ScrapedPage]:
    """
    Scrape multiple URLs concurrently with rate limiting.
    max_concurrent controls the semaphore to avoid overwhelming targets.
    """
    semaphore = asyncio.Semaphore(max_concurrent)

    async def _bounded_scrape(url: str) -> ScrapedPage:
        async with semaphore:
            result = await scrape_url_playwright(url)
            await _random_delay()
            return result

    return await asyncio.gather(*[_bounded_scrape(u) for u in urls], return_exceptions=False)


# ═══════════════════════════════════════════════════════════════════════════════
# REDDIT JSON PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class RedditPost:
    title: str
    body: str
    score: int
    num_comments: int
    subreddit: str
    url: str
    comments: list[str] = field(default_factory=list)


_REDDIT_BASE = "https://www.reddit.com"
_REDDIT_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}


async def search_reddit(
    query: str,
    subreddits: Optional[list[str]] = None,
    limit: int = 10,
    sort: str = "relevance",
    time_filter: str = "month",
) -> list[RedditPost]:
    """
    Fetch posts from Reddit JSON API.
    Uses public .json endpoints — no auth required for public subreddits.
    Implements user-agent rotation and request delays.
    """
    posts: list[RedditPost] = []

    if subreddits:
        # Search within specific subreddits
        search_urls = [
            f"{_REDDIT_BASE}/r/{sr}/search.json?q={_url_encode(query)}&sort={sort}&t={time_filter}&limit={limit}&restrict_sr=1"
            for sr in subreddits
        ]
    else:
        search_urls = [
            f"{_REDDIT_BASE}/search.json?q={_url_encode(query)}&sort={sort}&t={time_filter}&limit={limit}"
        ]

    async with aiohttp.ClientSession() as session:
        for url in search_urls:
            headers = {**_REDDIT_HEADERS, "User-Agent": _random_ua()}
            try:
                async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status == 429:
                        logger.warning(f"Reddit rate limit hit. Sleeping 60s.")
                        await asyncio.sleep(60)
                        continue
                    if resp.status != 200:
                        logger.warning(f"Reddit returned {resp.status} for {url}")
                        continue
                    data = await resp.json()
                    children = data.get("data", {}).get("children", [])
                    for child in children:
                        pd = child.get("data", {})
                        if pd.get("is_self"):
                            post = RedditPost(
                                title=pd.get("title", ""),
                                body=pd.get("selftext", ""),
                                score=pd.get("score", 0),
                                num_comments=pd.get("num_comments", 0),
                                subreddit=pd.get("subreddit", ""),
                                url=f"{_REDDIT_BASE}{pd.get('permalink', '')}",
                            )
                            posts.append(post)
            except Exception as e:
                logger.error(f"Reddit fetch error: {e}")
            await _random_delay()

    return posts[:limit]


async def fetch_reddit_comments(post_url: str, limit: int = 20) -> list[str]:
    """
    Fetch top comments from a Reddit post using the .json endpoint.
    """
    json_url = post_url.rstrip("/") + ".json?limit=" + str(limit)
    headers = {**_REDDIT_HEADERS, "User-Agent": _random_ua()}
    comments: list[str] = []

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(json_url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    return comments
                data = await resp.json()
                if isinstance(data, list) and len(data) > 1:
                    comment_listing = data[1].get("data", {}).get("children", [])
                    for c in comment_listing:
                        body = c.get("data", {}).get("body", "")
                        if body and body != "[deleted]" and body != "[removed]":
                            comments.append(body)
        except Exception as e:
            logger.error(f"Comment fetch error: {e}")

    return comments[:limit]


def _url_encode(s: str) -> str:
    from urllib.parse import quote_plus
    return quote_plus(s)


# ═══════════════════════════════════════════════════════════════════════════════
# EXA SEARCH (targeted, minimal use)
# ═══════════════════════════════════════════════════════════════════════════════

async def exa_search(query: str, num_results: int = 5) -> list[dict]:
    """
    Exa.ai semantic search.
    Only used when explicitly requested and API key is configured.
    Returns structured result objects.
    """
    api_key = os.getenv("EXA_API_KEY", "")
    if not api_key:
        logger.info("EXA_API_KEY not set — skipping Exa search")
        return []

    payload = {
        "query": query,
        "numResults": num_results,
        "type": "neural",
        "contents": {"text": True},
    }
    headers = {
        "x-api-key": api_key,
        "Content-Type": "application/json",
        "User-Agent": _random_ua(),
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.exa.ai/search",
                json=payload,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    logger.error(f"Exa API error {resp.status}")
                    return []
                data = await resp.json()
                return [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "text": r.get("text", "")[:1000],
                        "score": r.get("score", 0.0),
                    }
                    for r in data.get("results", [])
                ]
    except Exception as e:
        logger.error(f"Exa search failed: {e}")
        return []


# ═══════════════════════════════════════════════════════════════════════════════
# UNIFIED CORPUS BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

import re  # noqa: E402  (placed here to avoid circular at top)


async def build_corpus(
    query: str,
    sources: list[str] = None,
    max_results: int = 10,
    use_exa: bool = False,
) -> dict:
    """
    Aggregate text data from multiple sources for a query.
    Returns dict with texts, sources metadata, and raw posts.
    """
    if sources is None:
        sources = ["reddit"]

    all_texts: list[str] = []
    source_meta: list[dict] = []

    # Reddit
    if "reddit" in sources:
        posts = await search_reddit(query, limit=min(max_results, 15))
        for p in posts:
            combined = f"{p.title}. {p.body}".strip()
            if combined and len(combined) > 20:
                all_texts.append(combined)
                source_meta.append({
                    "source": "reddit",
                    "subreddit": p.subreddit,
                    "title": p.title,
                    "score": p.score,
                    "url": p.url,
                    "text_length": len(combined),
                })

    # Exa (targeted use)
    if "web" in sources and use_exa:
        exa_results = await exa_search(query, num_results=3)
        for r in exa_results:
            text = f"{r['title']}. {r['text']}"
            all_texts.append(text)
            source_meta.append({
                "source": "exa",
                "title": r["title"],
                "url": r["url"],
                "score": r["score"],
                "text_length": len(text),
            })

    return {
        "texts": all_texts,
        "source_meta": source_meta,
        "query": query,
        "total_documents": len(all_texts),
    }