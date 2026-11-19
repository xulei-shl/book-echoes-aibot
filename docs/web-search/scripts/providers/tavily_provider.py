"""Tavily 事实检索 Provider。"""
from __future__ import annotations

from typing import List

from common.models import (
    CredentialMissingException,
    SearchResult,
    UpstreamRequestException,
)
from .base import BaseSearchProvider

TAVILY_SEARCH_URL = "https://api.tavily.com/search"


class TavilyProvider(BaseSearchProvider):
    id = "tavily"
    name = "Tavily"
    requires_key = True
    supports_modes = ["web"]

    def is_available(self) -> bool:
        return bool(self.config.tavily_api_key)

    def search(self, query: str, count: int = 5, mode: str = "web", **kwargs) -> List[SearchResult]:
        if not self.config.tavily_api_key:
            raise CredentialMissingException("缺少 TAVILY_API_KEY 配置", provider=self.id)

        q = (query or "").strip()
        if not q:
            return []
        c = max(1, min(int(count or 5), 20))

        headers = {
            "Authorization": f"Bearer {self.config.tavily_api_key}",
        }
        payload = {
            "query": q,
            "max_results": c,
            "include_answer": False,
        }

        data = self.request_json(TAVILY_SEARCH_URL, method="POST", headers=headers, data=payload)

        items = data.get("results", [])
        results: List[SearchResult] = []
        for r in items:
            results.append(
                SearchResult(
                    title=r.get("title", ""),
                    url=r.get("url", ""),
                    snippet=r.get("content", ""),
                    source="tavily",
                    score=float(r.get("score") or 0.0),
                )
            )
        return results
