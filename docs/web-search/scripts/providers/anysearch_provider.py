"""AnySearch 统一检索 Provider（支持 Key 与匿名调用）。"""
from __future__ import annotations

import re
import time
from typing import Any, Dict, List

from common.models import SearchResult, UpstreamRequestException
from .base import BaseSearchProvider

ANYSEARCH_SEARCH_PATH = "/v1/search"

# 客户端标识：便于服务端区分调用来源与排查问题
CLIENT_HEADER = "web-search/1.0"

# 服务端单次硬上限为 10 条，超出会被静默截断，故在客户端先行收敛
MAX_RESULTS_CAP = 10

# 信封级限流（HTTP 200 + code=-1）的退避等待上限（秒），超过则直接降级到下一候选源
MAX_BACKOFF_SECONDS = 5.0
_RATE_LIMIT_RE = re.compile(r"retry after\s+(\d+(?:\.\d+)?)\s*second", re.IGNORECASE)


class AnySearchProvider(BaseSearchProvider):
    id = "anysearch"
    name = "AnySearch"
    requires_key = False  # 支持匿名
    supports_modes = ["web"]

    # 匿名额度耗尽时上游会返回 code=0 + 空结果，此时必须继续降级，
    # 否则该轨静默 0 条，会被误报为「未检索到相关内容」。
    empty_result_is_failure = True

    def is_available(self) -> bool:
        # 支持匿名按 IP 限流调用，始终可用
        return True

    def _headers(self) -> Dict[str, str]:
        headers = {"X-Anysearch-Client": CLIENT_HEADER}
        if self.config.anysearch_api_key:
            headers["Authorization"] = f"Bearer {self.config.anysearch_api_key}"
        return headers

    def _search_url(self) -> str:
        return f"{self.config.anysearch_api_base_url}{ANYSEARCH_SEARCH_PATH}"

    def _call(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """发起一次检索请求，对信封级限流做一次有上限的退避重试。"""
        headers = self._headers()
        url = self._search_url()
        data = self.request_json(url, method="POST", headers=headers, data=payload)
        code = data.get("code")
        if code is None or code == 0:
            return data

        message = data.get("message") or ""
        wait = _RATE_LIMIT_RE.search(message)
        if wait and float(wait.group(1)) <= MAX_BACKOFF_SECONDS:
            # 短暂的窗口内限流：原地退避后重试一次，避免直接掉到低质量兜底源
            time.sleep(float(wait.group(1)))
            data = self.request_json(url, method="POST", headers=headers, data=payload)
            code = data.get("code")
            if code is None or code == 0:
                return data
            message = data.get("message") or ""

        message = message or f"AnySearch 返回错误码 {code}"
        body = data.get("data") or {}
        request_id = body.get("request_id") or data.get("request_id") or ""
        if request_id:
            message = f"{message} (request_id={request_id})"
        raise UpstreamRequestException(message, provider=self.id)

    def search(self, query: str, count: int = 5, mode: str = "web", **kwargs) -> List[SearchResult]:
        q = (query or "").strip()
        if not q:
            return []
        c = max(1, min(int(count or 5), MAX_RESULTS_CAP))

        payload: Dict[str, Any] = {"query": q, "max_results": c}
        # 语区路由：双轨分别下发 intl/en 与 cn/zh-CN，使两轨命中不同索引而非同质结果
        zone = (kwargs.get("zone") or "").strip()
        if zone:
            payload["zone"] = zone
        language = (kwargs.get("language") or "").strip()
        if language:
            payload["language"] = language
        tag = kwargs.get("tag")
        if tag:
            payload["tag"] = tag

        data = self._call(payload)

        items = (data.get("data") or {}).get("results") or []
        results: List[SearchResult] = []
        for item in items:
            results.append(
                SearchResult(
                    title=item.get("title", ""),
                    url=item.get("url", ""),
                    snippet=item.get("snippet") or item.get("content") or "",
                    source="anysearch",
                )
            )
        return results
