"""Provider 注册中心与降级调度引擎 (Registry & Fallback Dispatcher)。"""
from __future__ import annotations

import logging
from typing import Dict, List, Optional, Tuple, Type

from common.config import Config
from common.models import (
    FallbackEvent,
    SearchResult,
    UpstreamRequestException,
    WebSearchException,
)
from .anysearch_provider import AnySearchProvider
from .base import BaseSearchProvider
from .doubao_provider import DoubaoProvider
from .duckduckgo_provider import DuckDuckGoProvider
from .exa_provider import ExaProvider
from .tavily_provider import TavilyProvider
from .wikipedia_provider import WikipediaProvider
from .zhihu_provider import ZhihuProvider

logger = logging.getLogger(__name__)

# 全连通跨源降级链基础优先级定义
DEFAULT_FOREIGN_CANDIDATES = ["exa", "tavily", "anysearch", "duckduckgo"]
DEFAULT_CHINESE_CANDIDATES = ["doubao", "zhihu", "anysearch", "duckduckgo", "wikipedia"]


class ProviderRegistry:
    """检索源注册中心与调用调度中心"""

    def __init__(self, config: Config):
        self.config = config
        self._providers: Dict[str, BaseSearchProvider] = {}
        self._register_defaults()

    def _register_defaults(self):
        """注册系统内置的 7 大检索源"""
        classes: List[Type[BaseSearchProvider]] = [
            DuckDuckGoProvider,
            WikipediaProvider,
            AnySearchProvider,
            DoubaoProvider,
            ExaProvider,
            TavilyProvider,
            ZhihuProvider,
        ]
        for cls in classes:
            instance = cls(self.config)
            self._providers[instance.id] = instance

    def get_provider(self, provider_id: str) -> Optional[BaseSearchProvider]:
        """根据标识获取 Provider 实例"""
        return self._providers.get((provider_id or "").lower().strip())

    def list_providers(self) -> List[BaseSearchProvider]:
        """列出所有已注册的 Provider"""
        return list(self._providers.values())

    def get_preferred_foreign_candidates(self) -> List[str]:
        """获取海外检索源候选链（已配 Key 优先，免密在后）"""
        available_with_keys = []
        available_free = []

        for pid in DEFAULT_FOREIGN_CANDIDATES:
            prov = self.get_provider(pid)
            if not prov:
                continue
            if prov.requires_key and prov.is_available():
                available_with_keys.append(pid)
            elif not prov.requires_key and prov.is_available():
                available_free.append(pid)

        # 候选链为：已配Key的海外源 -> 免密海外源 -> 其它可用源兜底
        chain = available_with_keys + available_free
        # 加上中文全网源作为终极跨语言兜底
        for fallback_id in ["doubao", "zhihu"]:
            prov = self.get_provider(fallback_id)
            if prov and prov.is_available() and fallback_id not in chain:
                chain.append(fallback_id)
        return chain

    def get_preferred_chinese_candidates(self) -> List[str]:
        """获取中文检索源候选链（已配 Key 优先，免密在后）"""
        available_with_keys = []
        available_free = []

        for pid in DEFAULT_CHINESE_CANDIDATES:
            prov = self.get_provider(pid)
            if not prov:
                continue
            if prov.requires_key and prov.is_available():
                available_with_keys.append(pid)
            elif not prov.requires_key and prov.is_available():
                available_free.append(pid)

        chain = available_with_keys + available_free
        # 加上海外源作为终极跨语言兜底
        for fallback_id in ["exa", "tavily"]:
            prov = self.get_provider(fallback_id)
            if prov and prov.is_available() and fallback_id not in chain:
                chain.append(fallback_id)
        return chain

    def execute_with_fallback(
        self,
        candidate_ids: List[str],
        query: str,
        count: int = 5,
        mode: str = "web",
        allow_fallback: bool = True,
        **kwargs,
    ) -> Tuple[List[SearchResult], List[FallbackEvent], str]:
        """沿候选链调度执行，遇到异常自动平滑降级至下一个可用源。

        Returns:
            (results, fallbacks, final_source_id)
        """
        if not candidate_ids:
            raise UpstreamRequestException("未指定可用的检索源候选列表")

        first_choice = candidate_ids[0]
        fallbacks: List[FallbackEvent] = []
        last_exception: Optional[Exception] = None

        for idx, pid in enumerate(candidate_ids):
            prov = self.get_provider(pid)
            if not prov:
                continue

            # 若不可用（未配 Key），且允许降级，则记录并跳过
            if not prov.is_available():
                if not allow_fallback and idx == 0:
                    raise WebSearchException(f"指定检索源 '{pid}' 尚未配置必需凭据", provider=pid, status_code=503)
                continue

            try:
                # 执行检索调用
                results = prov.search(query, count=count, mode=mode, **kwargs)
                # 部分源在额度/故障时会返回「成功但零结果」，若不在此处降级，
                # 调用方只会看到「未检索到相关内容」，掩盖真实的源故障
                if not results and getattr(prov, "empty_result_is_failure", False):
                    raise UpstreamRequestException("检索源返回空结果", provider=pid)
                final_source = pid if mode == "web" else f"{pid}:{mode}"
                return results, fallbacks, final_source
            except Exception as e:
                last_exception = e
                logger.warning(f"检索源 [{pid}] 执行异常: {e}")

                if not allow_fallback:
                    # 严格模式：直接抛出，不进行降级
                    raise e

                # 寻找下一候选源进行降级记录
                next_pid = candidate_ids[idx + 1] if idx + 1 < len(candidate_ids) else "none"
                fallbacks.append(
                    FallbackEvent(
                        original_source=pid,
                        fallback_source=next_pid,
                        reason=str(e),
                        query=query,
                    )
                )

        # 候选链全部尝试失败
        err_msg = f"所有候选检索源 ({', '.join(candidate_ids)}) 均执行失败。最终错误: {last_exception}"
        raise UpstreamRequestException(err_msg, provider=first_choice)
