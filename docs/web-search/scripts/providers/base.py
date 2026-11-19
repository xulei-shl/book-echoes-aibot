"""Provider 抽象基类与通用网络请求辅助。"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from common.config import Config
from common.models import (
    CredentialMissingException,
    SearchResult,
    UpstreamRequestException,
)


class BaseSearchProvider(ABC):
    """所有检索源的统一策略接口"""

    id: str = ""                         # 唯一标识，如 "exa", "zhihu", "duckduckgo"
    name: str = ""                       # 人类可读名称
    requires_key: bool = True            # 是否需要密钥
    supports_modes: List[str] = ["web"]  # 支持的子模式列表
    empty_result_is_failure: bool = False  # 空结果是否视为失败并继续降级

    def __init__(self, config: Config):
        self.config = config

    @abstractmethod
    def is_available(self) -> bool:
        """检查凭据或依赖是否完备"""
        pass

    @abstractmethod
    def search(self, query: str, count: int = 5, mode: str = "web", **kwargs) -> List[SearchResult]:
        """执行检索，返回统一 SearchResult 列表"""
        pass

    def request_json(
        self,
        url: str,
        method: str = "GET",
        headers: Optional[Dict[str, str]] = None,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        timeout: Optional[int] = None,
    ) -> Dict[str, Any]:
        """统一 HTTP 请求函数，带超时控制与标准异常封装"""
        t = timeout or self.config.timeout_seconds
        req_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json",
        }
        if headers:
            req_headers.update(headers)

        full_url = url
        if params:
            # 过滤空值
            valid_params = {k: v for k, v in params.items() if v is not None and v != ""}
            query_string = urllib.parse.urlencode(valid_params)
            sep = "&" if "?" in full_url else "?"
            full_url = f"{full_url}{sep}{query_string}"

        body_bytes = None
        if data is not None:
            body_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
            req_headers["Content-Type"] = "application/json"

        req = urllib.request.Request(full_url, data=body_bytes, headers=req_headers, method=method)

        max_attempts = 2
        for attempt in range(max_attempts):
            try:
                with urllib.request.urlopen(req, timeout=t) as resp:
                    resp_text = resp.read().decode("utf-8", errors="replace")
                    try:
                        return json.loads(resp_text)
                    except Exception:
                        raise UpstreamRequestException(
                            f"上游返回了无法解析的 JSON: {resp_text[:200]}",
                            provider=self.id,
                            status_code=resp.status,
                        )
            except urllib.error.HTTPError as e:
                err_body = ""
                try:
                    err_body = e.read().decode("utf-8", errors="replace")
                except Exception:
                    pass

                # 遭遇 429 限流时进行退避重试
                if e.code == 429 and attempt < max_attempts - 1:
                    import time
                    time.sleep(1.5 * (attempt + 1))
                    continue

                if e.code in (401, 403):
                    raise CredentialMissingException(
                        f"认证失败(HTTP {e.code}): 凭据无效或已过期。详情: {err_body[:200]}",
                        provider=self.id,
                        status_code=e.code,
                    )
                raise UpstreamRequestException(
                    f"请求失败(HTTP {e.code}): {err_body[:300] or e.reason}",
                    provider=self.id,
                    status_code=e.code,
                )
            except urllib.error.URLError as e:
                raise UpstreamRequestException(
                    f"网络连接失败: {e.reason}",
                    provider=self.id,
                )
            except Exception as e:
                raise UpstreamRequestException(
                    f"请求执行异常: {str(e)}",
                    provider=self.id,
                )
