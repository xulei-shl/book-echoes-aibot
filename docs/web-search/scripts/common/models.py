"""WebSearch 通用数据模型模块。
包含检索项 (SearchResult)、检索响应 (SearchResponse) 以及异常定义。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


class WebSearchException(Exception):
    """网络检索异常基类"""
    def __init__(self, message: str, provider: str = "", status_code: int = 0):
        super().__init__(message)
        self.provider = provider
        self.status_code = status_code


class CredentialMissingException(WebSearchException):
    """凭据未配置异常"""
    pass


class UpstreamRequestException(WebSearchException):
    """上游 API 请求异常"""
    pass


@dataclass
class SearchResult:
    """标准检索结果项"""
    title: str
    url: str
    snippet: str
    source: str                          # 检索源标识，如 "exa", "doubao", "zhihu:global"
    score: float = 0.0                   # 相关度得分
    publish_time: str = ""               # 发布时间
    author: str = ""                     # 作者/发布者
    extra: Dict[str, Any] = field(default_factory=dict)  # 源特定附加数据

    def to_dict(self) -> Dict[str, Any]:
        """序列化为字典"""
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "source": self.source,
            "score": self.score,
            "publish_time": self.publish_time,
            "author": self.author,
            "extra": self.extra,
        }


@dataclass
class FallbackEvent:
    """降级事件记录"""
    original_source: str
    fallback_source: str
    reason: str
    query: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "original_source": self.original_source,
            "fallback_source": self.fallback_source,
            "reason": self.reason,
            "query": self.query,
        }


@dataclass
class SearchResponse:
    """检索综合响应数据包"""
    query: str
    query_en: str = ""
    track_mode: str = "dual"             # "dual" (中英双轨) 或 "single" (单轨)
    results: List[SearchResult] = field(default_factory=list)
    sources_used: List[str] = field(default_factory=list)
    fallbacks: List[FallbackEvent] = field(default_factory=list)
    answer: str = ""                     # 针对直答 (zhida) 或总结文本
    saved_file: Optional[str] = None     # 留存轨保存的文件路径
    dossier_dir: Optional[str] = None    # 主题档案卷宗目录路径
    dossier_files: List[Dict[str, Any]] = field(default_factory=list)  # 卷宗包含的文件清单

    def to_dict(self) -> Dict[str, Any]:
        return {
            "query": self.query,
            "query_en": self.query_en,
            "track_mode": self.track_mode,
            "sources_used": self.sources_used,
            "fallbacks": [f.to_dict() for f in self.fallbacks],
            "answer": self.answer,
            "saved_file": self.saved_file,
            "dossier_dir": self.dossier_dir,
            "dossier_files": self.dossier_files,
            "count": len(self.results),
            "results": [r.to_dict() for r in self.results],
        }
