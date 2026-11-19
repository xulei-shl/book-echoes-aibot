"""豆包 (火山引擎联网搜索) Provider。"""
from __future__ import annotations

from typing import List

from common.models import (
    CredentialMissingException,
    SearchResult,
    UpstreamRequestException,
)
from .base import BaseSearchProvider

DOUBAO_SEARCH_URL = "https://open.feedcoopapi.com/search_api/web_search"


class DoubaoProvider(BaseSearchProvider):
    id = "doubao"
    name = "豆包搜索"
    requires_key = True
    supports_modes = ["web"]

    def is_available(self) -> bool:
        return bool(self.config.doubao_api_key)

    def search(self, query: str, count: int = 5, mode: str = "web", **kwargs) -> List[SearchResult]:
        if not self.config.doubao_api_key:
            raise CredentialMissingException("缺少 DOUBAO_API_KEY 配置", provider=self.id)

        q = (query or "").strip()
        if not q:
            return []
        c = max(1, min(int(count or 5), 50))

        headers = {
            "Authorization": f"Bearer {self.config.doubao_api_key}",
        }
        payload = {
            "Query": q,
            "SearchType": "web",
            "Count": c,
        }

        data = self.request_json(DOUBAO_SEARCH_URL, method="POST", headers=headers, data=payload)

        # 检查 ResponseMetadata.Error
        resp_meta = data.get("ResponseMetadata", {})
        err = resp_meta.get("Error")
        if err:
            err_code = err.get("Code", "")
            err_msg = err.get("Message", "")
            raise UpstreamRequestException(f"豆包搜索失败 ({err_code}): {err_msg}", provider=self.id)

        web_results = data.get("Result", {}).get("WebResults", [])
        results: List[SearchResult] = []
        for r in web_results:
            results.append(
                SearchResult(
                    title=r.get("Title", ""),
                    url=r.get("Url", ""),
                    snippet=r.get("Summary") or r.get("Snippet") or "",
                    source="doubao",
                    extra={"site_name": r.get("SiteName", "")},
                )
            )
        return results
