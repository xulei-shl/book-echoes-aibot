"""公共合并与输出组件 (Merger & Output Formatter)。
负责 URL 归一化、中英文双轨交叉合并 (Cross-merge)、结果去重及 Markdown 格式化渲染。
"""
from __future__ import annotations

import re
from itertools import zip_longest
from typing import List, Set
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from .models import SearchResponse, SearchResult

# 常见无意义的 URL 追踪参数名集合
_TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "spm", "from", "ref", "source", "fbclid", "gclid", "wd", "oq", "_hsenc"
}


def normalize_url(url: str) -> str:
    """归一化 URL，剥离锚点和追踪参数，以实现精准去重。"""
    if not url:
        return ""
    try:
        parsed = urlparse(url.strip())
        # 统一 scheme 为小写，netloc 为小写
        scheme = parsed.scheme.lower() or "https"
        netloc = parsed.netloc.lower()
        path = parsed.path.rstrip("/")
        
        # 过滤 tracking query 参数
        filtered_queries = []
        for k, v in parse_qsl(parsed.query, keep_blank_values=True):
            if k.lower() not in _TRACKING_PARAMS:
                filtered_queries.append((k, v))
        filtered_queries.sort()
        new_query = urlencode(filtered_queries)

        # 丢弃 fragment (#...)
        return urlunparse((scheme, netloc, path, parsed.params, new_query, ""))
    except Exception:
        return url.strip()


def deduplicate_results(results: List[SearchResult]) -> List[SearchResult]:
    """对检索结果列表进行去重（优先按规范化 URL，其次按清洗后的标题）。"""
    seen_urls: Set[str] = set()
    seen_titles: Set[str] = set()
    unique_list: List[SearchResult] = []

    for r in results:
        norm_url = normalize_url(r.url)
        clean_title = re.sub(r"[\s\W_]+", "", r.title.lower())

        if norm_url and norm_url in seen_urls:
            continue
        if clean_title and len(clean_title) > 4 and clean_title in seen_titles:
            continue

        if norm_url:
            seen_urls.add(norm_url)
        if clean_title:
            seen_titles.add(clean_title)

        unique_list.append(r)

    return unique_list


def cross_merge(list_a: List[SearchResult], list_b: List[SearchResult]) -> List[SearchResult]:
    """中英文双轨交叉合并算法 (Round-Robin Interleaving)。
    按 1:1 交替抽取，并执行统一去重。
    """
    interleaved: List[SearchResult] = []
    for item_a, item_b in zip_longest(list_a, list_b):
        if item_a is not None:
            interleaved.append(item_a)
        if item_b is not None:
            interleaved.append(item_b)
    return deduplicate_results(interleaved)


def format_markdown_output(response: SearchResponse) -> str:
    """渲染为供 Agent 和人类直接消费的高密度 Markdown 文本。"""
    lines: List[str] = []

    # 标题行
    if response.query_en and response.query != response.query_en:
        lines.append(f"# 网络检索 · {response.query} / {response.query_en}")
    else:
        lines.append(f"# 网络检索 · {response.query}")
    lines.append("")

    # 降级通知 (若发生过自动平滑降级，明确透明公示)
    if response.fallbacks:
        for fb in response.fallbacks:
            lines.append(
                f"> ⚠️ **【自动降级提示】** 原选源 `{fb.original_source}` 失败（{fb.reason}），已平滑降级至 `{fb.fallback_source}` 执行。"
            )
        lines.append("")

    # 直答/问答型回答正文 (如知乎直答)
    if response.answer:
        lines.append("## 直答结论")
        lines.append("")
        lines.append(response.answer.strip())
        lines.append("")
        lines.append("---")
        lines.append("")

    # 结果列表
    if not response.results and not response.answer:
        lines.append("> 抱歉，未检索到相关内容，请尝试更换关键词。")
        return "\n".join(lines)

    if response.results:
        for idx, item in enumerate(response.results, 1):
            t = (item.title or "未命名结果").strip()
            u = (item.url or "").strip()
            snippet = (item.snippet or "").strip()
            source = item.source or "未知源"

            # 标题与外链
            if u:
                lines.append(f"### {idx}. [{t}]({u})")
            else:
                lines.append(f"### {idx}. {t}")

            # 摘要内容（感知轨控制在 300 字符以内，防止上下文膨胀）
            if snippet:
                preview_snippet = snippet if len(snippet) <= 300 else snippet[:300] + "..."
                lines.append("")
                lines.append(preview_snippet)

            # 元信息行
            meta_parts: List[str] = [f"来源: {source}"]
            if item.author:
                meta_parts.append(f"作者: {item.author}")
            if item.publish_time:
                meta_parts.append(f"时间: {item.publish_time}")
            if item.extra.get("voteup_count") is not None:
                meta_parts.append(f"赞同: {item.extra['voteup_count']}")

            lines.append("")
            lines.append(f"> {' · '.join(meta_parts)}")

            # 若单项有关联的全文沉淀文件 (如维基百科全文 Markdown)
            if item.extra.get("saved_file"):
                saved_path = item.extra["saved_file"]
                char_cnt = item.extra.get("char_count", 0)
                lines.append("")
                lines.append(
                    f"> 📄 **【词条全文已归档】** 共 {char_cnt} 字，已落盘至: `{saved_path}`\n"
                    f"> 💡 提示：Agent 可按需使用 `view_file` 工具阅读指定章节，避免上下文超载。"
                )

            lines.append("")
            lines.append("---")

    # 底部留存信息与主题档案卷宗展示
    if response.dossier_dir:
        lines.append("")
        lines.append("> 📁 **【主题检索档案卷宗已沉淀】**")
        lines.append(f"> 目录路径: `{response.dossier_dir}`")
        lines.append("> ├── 📑 `00_index.md` (全览导读与交叉榜单)")
        for sf in response.dossier_files:
            lines.append(f"> ├── 📄 `{sf['filename']}` ({sf['source_name']} 检索详版，共 {sf['count']} 条)")
        lines.append("> └── 📊 `results.json` (机器全量结构化数据)")
        lines.append("> 💡 提示：Agent 可按需使用 `view_file` 工具阅读各源详细文件，避免上下文超载。")
    elif response.saved_file:
        lines.append("")
        lines.append(f"> 💾 全量结果已落盘沉淀至: `{response.saved_file}`")

    return "\n".join(lines)
