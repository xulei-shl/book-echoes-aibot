"""DuckDuckGo 检索 Provider（免密全网检索）。"""
from __future__ import annotations

import json
import shutil
import subprocess
from typing import List

from common.models import SearchResult, UpstreamRequestException
from .base import BaseSearchProvider

import warnings
warnings.filterwarnings("ignore", category=RuntimeWarning, message=".*duckduckgo_search.*")

# 尝试载入 python 库 ddgs 或 duckduckgo_search
_DDGS_CLASS = None
try:
    from ddgs import DDGS as _DDGS_CLASS  # noqa: N811
except ImportError:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            from duckduckgo_search import DDGS as _DDGS_CLASS  # noqa: N811
    except ImportError:
        _DDGS_CLASS = None


class DuckDuckGoProvider(BaseSearchProvider):
    id = "duckduckgo"
    name = "DuckDuckGo"
    requires_key = False
    supports_modes = ["web", "news"]

    def is_available(self) -> bool:
        """检查是否有可用 Python 库或 CLI"""
        if _DDGS_CLASS is not None:
            return True
        return bool(shutil.which("ddgs"))

    def search(self, query: str, count: int = 5, mode: str = "web", **kwargs) -> List[SearchResult]:
        q = (query or "").strip()
        if not q:
            return []
        c = max(1, min(int(count or 5), 20))

        # 1. 优先使用 Python 库
        if _DDGS_CLASS is not None:
            try:
                ddgs = _DDGS_CLASS(timeout=self.config.timeout_seconds)
                if mode == "news":
                    raw_items = list(ddgs.news(q, max_results=c))
                else:
                    raw_items = list(ddgs.text(q, max_results=c))

                results = []
                for item in raw_items:
                    results.append(
                        SearchResult(
                            title=item.get("title", ""),
                            url=item.get("href") or item.get("url") or "",
                            snippet=item.get("body") or item.get("snippet") or "",
                            source="duckduckgo",
                            publish_time=item.get("date", ""),
                        )
                    )
                return results
            except Exception as e:
                # 捕获异常后尝试 CLI 降级
                pass

        # 2. 回退到 CLI 调用
        if shutil.which("ddgs"):
            try:
                cmd = ["ddgs", "text", "-q", q, "-m", str(c), "-o", "json"]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=self.config.timeout_seconds)
                if proc.returncode == 0 and proc.stdout.strip():
                    raw_items = json.loads(proc.stdout)
                    results = []
                    for item in raw_items:
                        results.append(
                            SearchResult(
                                title=item.get("title", ""),
                                url=item.get("href") or item.get("url") or "",
                                snippet=item.get("body") or item.get("snippet") or "",
                                source="duckduckgo",
                            )
                        )
                    return results
            except Exception as e:
                raise UpstreamRequestException(f"DuckDuckGo CLI 执行失败: {e}", provider=self.id)

        raise UpstreamRequestException(
            "DuckDuckGo 不可用：未安装 ddgs / duckduckgo_search 库且未找到 ddgs 命令行工具",
            provider=self.id,
        )
