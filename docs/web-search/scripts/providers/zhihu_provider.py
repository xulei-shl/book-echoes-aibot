"""知乎检索 Provider（支持 global 全网搜索、zhihu 站内搜索、zhida 直答三模式）。"""
from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Any, Dict, List

from common.models import (
    CredentialMissingException,
    SearchResult,
    UpstreamRequestException,
)
from .base import BaseSearchProvider

ZHIHU_SEARCH_URL = "https://developer.zhihu.com/api/v1/content/zhihu_search"
GLOBAL_SEARCH_URL = "https://developer.zhihu.com/api/v1/content/global_search"
ZHIDA_CHAT_URL = "https://developer.zhihu.com/v1/chat/completions"

ZHIDA_MODELS = ("zhida-fast-1p5", "zhida-thinking-1p5", "zhida-agent")

_TAG_RE = re.compile(r"<\/?em>", re.IGNORECASE)


def _strip_em(text: str) -> str:
    return _TAG_RE.sub("", text or "").strip()


def _format_unix_ts(ts: Any) -> str:
    try:
        n = int(ts)
        if n > 0:
            return datetime.fromtimestamp(n).strftime("%Y-%m-%d %H:%M")
    except Exception:
        pass
    return ""


class ZhihuProvider(BaseSearchProvider):
    id = "zhihu"
    name = "知乎检索"
    requires_key = True
    supports_modes = ["global", "zhihu", "zhida"]

    def is_available(self) -> bool:
        return bool(self.config.zhihu_access_secret)

    def _auth_headers(self) -> Dict[str, str]:
        if not self.config.zhihu_access_secret:
            raise CredentialMissingException("缺少 ZHIHU_ACCESS_SECRET 配置", provider=self.id)
        now_ts = str(int(time.time()))
        return {
            "Authorization": f"Bearer {self.config.zhihu_access_secret}",
            "X-Request-Timestamp": now_ts,
        }

    def search(self, query: str, count: int = 5, mode: str = "global", **kwargs) -> List[SearchResult]:
        q = (query or "").strip()
        if not q:
            return []

        # 模式 1: 知乎直答 (zhida - LLM 大模型问答)
        if mode == "zhida":
            return self._search_zhida(q, **kwargs)

        # 模式 2: 知乎站内搜索 (zhihu)
        if mode == "zhihu":
            return self._search_zhihu_internal(q, count)

        # 模式 3: 全网搜索 (global - 默认通用搜索模式)
        return self._search_global(q, count, **kwargs)

    def _search_zhida(self, question: str, **kwargs) -> List[SearchResult]:
        model = kwargs.get("model") or "zhida-fast-1p5"
        if model not in ZHIDA_MODELS:
            model = "zhida-fast-1p5"

        headers = self._auth_headers()
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": question}],
            "stream": False,
        }

        data = self.request_json(ZHIDA_CHAT_URL, method="POST", headers=headers, data=payload)
        choices = data.get("choices", [])
        if not choices:
            raise UpstreamRequestException("知乎直答未返回有效回答 choices", provider=self.id)

        answer_content = choices[0].get("message", {}).get("content", "").strip()
        if not answer_content:
            raise UpstreamRequestException("知乎直答返回内容为空", provider=self.id)

        return [
            SearchResult(
                title=f"知乎直答（{model}）",
                url="https://zhida.zhihu.com",
                snippet=answer_content,
                source="zhihu:zhida",
                extra={"answer": answer_content, "model": model},
            )
        ]

    def _search_zhihu_internal(self, query: str, count: int) -> List[SearchResult]:
        c = max(1, min(int(count or 5), 10))
        headers = self._auth_headers()
        params = {"Query": query, "Count": str(c)}

        data = self.request_json(ZHIHU_SEARCH_URL, method="GET", headers=headers, params=params)
        code = data.get("Code")
        if code != 0:
            msg = data.get("Message") or f"知乎站内搜索失败（Code: {code}）"
            raise UpstreamRequestException(msg, provider=self.id)

        items = data.get("Data", {}).get("Items", [])
        results: List[SearchResult] = []
        for item in items:
            title = (item.get("Title") or "").strip()
            url = (item.get("Url") or "").strip()
            summary = _strip_em(item.get("ContentText") or "")
            author = item.get("AuthorName") or ""
            badge = item.get("AuthorBadgeText") or ""
            author_str = f"{author}（{badge}）" if badge and author else author
            pub_time = _format_unix_ts(item.get("EditTime"))

            results.append(
                SearchResult(
                    title=title,
                    url=url,
                    snippet=summary,
                    source="zhihu:site",
                    publish_time=pub_time,
                    author=author_str,
                    extra={
                        "content_type": item.get("ContentType", ""),
                        "voteup_count": item.get("VoteUpCount"),
                        "comment_count": item.get("CommentCount"),
                    },
                )
            )
        return results

    def _search_global(self, query: str, count: int, **kwargs) -> List[SearchResult]:
        c = max(1, min(int(count or 5), 20))
        headers = self._auth_headers()
        params = {"Query": query, "Count": str(c)}

        search_db = kwargs.get("search_db", "").strip()
        if search_db in ("realtime", "static"):
            params["SearchDB"] = search_db

        filter_exp = kwargs.get("filter", "").strip()
        if filter_exp:
            params["Filter"] = filter_exp

        data = self.request_json(GLOBAL_SEARCH_URL, method="GET", headers=headers, params=params)
        code = data.get("Code")
        if code != 0:
            msg = data.get("Message") or f"知乎全网搜索失败（Code: {code}）"
            raise UpstreamRequestException(msg, provider=self.id)

        items = data.get("Data", {}).get("Items", [])
        results: List[SearchResult] = []
        for item in items:
            title = (item.get("Title") or "").strip()
            url = (item.get("Url") or "").strip()
            summary = _strip_em(item.get("ContentText") or "")
            author = item.get("AuthorName") or ""
            pub_time = _format_unix_ts(item.get("EditTime"))

            results.append(
                SearchResult(
                    title=title,
                    url=url,
                    snippet=summary,
                    source="zhihu:global",
                    publish_time=pub_time,
                    author=author,
                    extra={
                        "voteup_count": item.get("VoteUpCount"),
                        "comment_count": item.get("CommentCount"),
                    },
                )
            )
        return results
