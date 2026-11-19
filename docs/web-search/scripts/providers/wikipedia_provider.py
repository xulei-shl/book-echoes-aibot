"""Wikipedia 检索 Provider（免密权威百科检索）。"""
from __future__ import annotations

import html
import re
import urllib.parse
from datetime import datetime
from typing import List

from common.models import SearchResult, UpstreamRequestException
from common.runtime_home import auto_name, runtime_home, save_text
from .base import BaseSearchProvider

_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _clean_snippet(text: str) -> str:
    """去除 HTML 标签并解码实体"""
    no_tags = _HTML_TAG_RE.sub("", text or "")
    return html.unescape(no_tags).strip()


class WikipediaProvider(BaseSearchProvider):
    id = "wikipedia"
    name = "Wikipedia"
    requires_key = False
    supports_modes = ["summary", "article", "search"]

    def is_available(self) -> bool:
        return True

    def _base_url(self, lang: str = "zh") -> str:
        clean_lang = (lang or "zh").lower().strip()
        return f"https://{clean_lang}.wikipedia.org"

    def search(self, query: str, count: int = 5, mode: str = "summary", **kwargs) -> List[SearchResult]:
        q = (query or "").strip()
        if not q:
            return []
        c = max(1, min(int(count or 5), 50))
        lang = kwargs.get("lang") or ("en" if q.isascii() and len(q) > 0 else "zh")

        headers = {
            "User-Agent": self.config.wikipedia_user_agent,
            "Accept": "application/json",
        }

        # 模式 1: 摘要模式 (summary) —— 维基百科的默认模式
        if mode == "summary":
            title_to_fetch = q
            summary_data = None
            try:
                encoded_title = urllib.parse.quote(title_to_fetch)
                url = f"{self._base_url(lang)}/api/rest_v1/page/summary/{encoded_title}"
                summary_data = self.request_json(url, headers=headers)
            except Exception:
                summary_data = None

            # 若直接提取 404 或无有效内容，则先通过 search 接口找到最匹配的词条名称再拉取摘要
            if not summary_data or not summary_data.get("extract"):
                search_url = f"{self._base_url(lang)}/w/api.php"
                search_params = {
                    "action": "query",
                    "list": "search",
                    "format": "json",
                    "formatversion": "2",
                    "srsearch": q,
                    "srlimit": "1",
                }
                try:
                    s_data = self.request_json(search_url, params=search_params, headers=headers)
                    hits = s_data.get("query", {}).get("search", [])
                    if hits:
                        title_to_fetch = hits[0].get("title", "")
                        encoded_title = urllib.parse.quote(title_to_fetch)
                        url = f"{self._base_url(lang)}/api/rest_v1/page/summary/{encoded_title}"
                        summary_data = self.request_json(url, headers=headers)
                except Exception:
                    pass

            if summary_data and summary_data.get("extract"):
                extract = (summary_data.get("extract") or "").strip()
                title = summary_data.get("title") or title_to_fetch
                page_url = (
                    summary_data.get("content_urls", {}).get("desktop", {}).get("page")
                    or f"{self._base_url(lang)}/wiki/{urllib.parse.quote(title)}"
                )
                return [
                    SearchResult(
                        title=f"{title}（维基百科摘要）",
                        url=page_url,
                        snippet=extract,
                        source="wikipedia:summary",
                        extra={"description": summary_data.get("description", "")},
                    )
                ]

            # 若摘要接口确实无法获取，平滑降级为普通列表模式
            mode = "search"

        # 模式 2: 文章全文模式 (article) —— 需显式指定 -m article
        if mode == "article":
            title_to_fetch = q
            url = f"{self._base_url(lang)}/w/api.php"
            params = {
                "action": "query",
                "titles": title_to_fetch,
                "prop": "extracts",
                "format": "json",
                "formatversion": "2",
                "explaintext": "true",
                "redirects": "true",
            }
            data = self.request_json(url, params=params, headers=headers)
            pages = data.get("query", {}).get("pages", [])
            
            # 若直接查未命中，尝试搜索定位最接近词条
            if not pages or "missing" in pages[0] or not pages[0].get("extract"):
                s_params = {
                    "action": "query",
                    "list": "search",
                    "format": "json",
                    "formatversion": "2",
                    "srsearch": q,
                    "srlimit": "1",
                }
                try:
                    s_data = self.request_json(url, params=s_params, headers=headers)
                    hits = s_data.get("query", {}).get("search", [])
                    if hits:
                        title_to_fetch = hits[0].get("title", "")
                        params["titles"] = title_to_fetch
                        data = self.request_json(url, params=params, headers=headers)
                        pages = data.get("query", {}).get("pages", [])
                except Exception:
                    pass

            if pages and "missing" not in pages[0] and pages[0].get("extract"):
                page = pages[0]
                full_extract = (page.get("extract") or "").strip()
                title = page.get("title") or title_to_fetch
                page_url = f"{self._base_url(lang)}/wiki/{urllib.parse.quote(title)}"

                # 将词条全文沉淀落盘至 runtime/web-search/ 的 .md 文件
                full_md = (
                    f"# {title}\n\n"
                    f"- 来源: 维基百科 ({lang}.wikipedia.org)\n"
                    f"- 词条链接: {page_url}\n"
                    f"- 抓取时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                    f"- 全文字数: {len(full_extract)} 字\n\n"
                    f"---\n\n"
                    f"{full_extract}\n"
                )
                saved_target = runtime_home(__file__) / auto_name("wiki", "md", title)
                saved_path_str = save_text(saved_target, full_md)

                # 感知轨仅保留开头 300 字预览，避免上下文膨胀
                preview_snippet = full_extract[:300].strip() + ("..." if len(full_extract) > 300 else "")

                return [
                    SearchResult(
                        title=f"{title}（维基百科全文）",
                        url=page_url,
                        snippet=preview_snippet,
                        source="wikipedia:article",
                        extra={
                            "saved_file": saved_path_str,
                            "char_count": len(full_extract),
                            "full_content": full_extract,
                        },
                    )
                ]
            mode = "search"

        # 默认模式: 关键词搜索 (search)
        url = f"{self._base_url(lang)}/w/api.php"
        params = {
            "action": "query",
            "list": "search",
            "format": "json",
            "formatversion": "2",
            "srsearch": q,
            "srlimit": str(c),
            "srprop": "snippet|wordcount",
        }
        data = self.request_json(url, params=params, headers=headers)
        raw_items = data.get("query", {}).get("search", [])

        results: List[SearchResult] = []
        for item in raw_items:
            t = item.get("title", "")
            page_url = f"{self._base_url(lang)}/wiki/{urllib.parse.quote(t)}"
            snippet = _clean_snippet(item.get("snippet", ""))
            results.append(
                SearchResult(
                    title=t,
                    url=page_url,
                    snippet=snippet,
                    source=f"wikipedia:{lang}",
                    extra={"wordcount": item.get("wordcount", 0)},
                )
            )
        return results
