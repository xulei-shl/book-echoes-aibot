"""主题档案卷宗 (Topic Dossier) 归档与生成器。
将单次检索的所有多源结果，按主题独立创建子文件夹，并生成 00_index.md、各分源 Markdown 及 results.json。
"""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from .models import SearchResponse, SearchResult
from .runtime_home import auto_name, runtime_home, save_json, save_text, slug


def _get_clean_source_id(source_str: str) -> str:
    """提取基础检索源标识，如 zhihu:global -> zhihu, wikipedia:summary -> wikipedia"""
    if not source_str:
        return "other"
    return source_str.split(":")[0].lower().strip()


def format_source_markdown(source_id: str, results: List[SearchResult], query: str) -> str:
    """为特定检索源格式化专属 Markdown 文件内容"""
    lines: List[str] = [
        f"# {source_id.upper()} 检索结果 · {query}",
        "",
        f"- 检索源: `{source_id}`",
        f"- 关键词: `{query}`",
        f"- 结果总数: {len(results)} 条",
        f"- 归档时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "---",
        "",
    ]

    for idx, item in enumerate(results, 1):
        title = (item.title or "未命名结果").strip()
        url = (item.url or "").strip()
        snippet = (item.snippet or "").strip()
        full_content = item.extra.get("full_content", "")

        if url:
            lines.append(f"## {idx}. [{title}]({url})")
        else:
            lines.append(f"## {idx}. {title}")

        lines.append("")

        # 详细元信息
        meta_items = [f"**来源**: `{item.source}`"]
        if item.author:
            meta_items.append(f"**作者**: {item.author}")
        if item.publish_time:
            meta_items.append(f"**时间**: {item.publish_time}")
        if item.extra.get("site_name"):
            meta_items.append(f"**站点**: {item.extra['site_name']}")
        if item.extra.get("voteup_count") is not None:
            meta_items.append(f"**赞同**: {item.extra['voteup_count']}")
        if item.score:
            meta_items.append(f"**得分**: {item.score:.3f}")

        lines.append(" · ".join(meta_items))
        lines.append("")

        # 内容正文（若有完整全文则优先输出完整全文，否则输出摘要片段）
        if full_content:
            lines.append("### 词条全文正文")
            lines.append("")
            lines.append(full_content.strip())
        elif snippet:
            lines.append("### 内容摘录")
            lines.append("")
            lines.append(snippet)

        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def format_dossier_index(
    response: SearchResponse,
    dossier_dir: Path,
    source_files: List[Dict[str, Any]],
) -> str:
    """生成主题档案卷宗的 00_index.md 导读全览页"""
    lines: List[str] = [
        f"# 主题检索档案全览 · {response.query}",
        "",
        f"- **主检索词**: `{response.query}`",
    ]
    if response.query_en and response.query_en != response.query:
        lines.append(f"- **英文检索词**: `{response.query_en}`")
    lines.append(f"- **执行模式**: `{response.track_mode}` (中英文双轨交叉 / 单源)")
    lines.append(f"- **涉及信源**: {', '.join(f'`{s}`' for s in response.sources_used) or '无'}")
    lines.append(f"- **总命中结果**: {len(response.results)} 条")
    lines.append(f"- **归档时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("")

    # 降级公示
    if response.fallbacks:
        lines.append("## ⚠️ 自动降级轨迹记录")
        lines.append("")
        for fb in response.fallbacks:
            lines.append(
                f"- 原选源 `{fb.original_source}` 失败（{fb.reason}） ➔ 自动降级至 `{fb.fallback_source}` 执行。"
            )
        lines.append("")
        lines.append("---")
        lines.append("")

    # 卷宗文件目录树与相对链接
    lines.append("## 📂 卷宗文件目录与导读")
    lines.append("")
    lines.append("以下为本次检索在当前文件夹下归档的完整文件列表，Agent 可根据需要点击相对路径或调用 `view_file`：")
    lines.append("")
    lines.append("- [📑 00_index.md](./00_index.md) (当前综合导读与交叉榜单)")
    for sf in source_files:
        lines.append(f"- [📄 {sf['filename']}](./{sf['filename']}) ({sf['source_name']} 详细结果，共 {sf['count']} 条)")
    lines.append("- [📊 results.json](./results.json) (完整结构化机器数据)")
    lines.append("")
    lines.append("---")
    lines.append("")

    # 直答回答结论（若有）
    if response.answer:
        lines.append("## 💡 直答结论")
        lines.append("")
        lines.append(response.answer.strip())
        lines.append("")
        lines.append("---")
        lines.append("")

    # 交叉混排 Top 精选榜单
    lines.append("## 🏆 交叉精选结果汇总")
    lines.append("")
    if not response.results:
        lines.append("> 抱歉，未检索到有效结果。")
    else:
        for idx, item in enumerate(response.results, 1):
            t = (item.title or "未命名结果").strip()
            u = (item.url or "").strip()
            snip = (item.snippet or "").strip()
            if len(snip) > 200:
                snip = snip[:200] + "..."

            if u:
                lines.append(f"### {idx}. [{t}]({u})")
            else:
                lines.append(f"### {idx}. {t}")

            if snip:
                lines.append("")
                lines.append(snip)

            meta = [f"来源: `{item.source}`"]
            if item.author:
                meta.append(f"作者: {item.author}")
            if item.publish_time:
                meta.append(f"时间: {item.publish_time}")
            lines.append("")
            lines.append(f"> {' · '.join(meta)}")
            lines.append("")
            lines.append("---")

    return "\n".join(lines)


def export_topic_dossier(
    skill_file: str,
    response: SearchResponse,
    custom_dir: str = "",
) -> Dict[str, Any]:
    """将检索结果打包为主题档案卷宗目录结构"""
    home = runtime_home(skill_file)
    query_slug = slug(response.query, limit=30)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    # 确定主题目录
    if custom_dir and custom_dir.strip():
        c_path = Path(custom_dir.strip())
        dossier_dir = c_path if c_path.is_absolute() else home / c_path
    else:
        dossier_dir = home / f"{ts}_{query_slug}"

    dossier_dir.mkdir(parents=True, exist_ok=True)

    # 1. 保存全量 JSON 数据
    json_path = dossier_dir / "results.json"
    save_json(json_path, response.to_dict())

    # 2. 按检索源分组结果
    grouped: Dict[str, List[SearchResult]] = {}
    for r in response.results:
        base_src = _get_clean_source_id(r.source)
        grouped.setdefault(base_src, []).append(r)

    source_files: List[Dict[str, Any]] = []
    # 按照序号保存各个检索源的 md 文件
    for seq, (src_id, items) in enumerate(sorted(grouped.items()), 1):
        filename = f"{seq:02d}_{src_id}.md"
        content = format_source_markdown(src_id, items, response.query)
        target_file = dossier_dir / filename
        save_text(target_file, content)
        source_files.append({
            "source": src_id,
            "source_name": src_id.upper(),
            "filename": filename,
            "path": str(target_file.resolve()),
            "count": len(items),
        })

    # 3. 生成 00_index.md 索引页
    index_content = format_dossier_index(response, dossier_dir, source_files)
    index_path = dossier_dir / "00_index.md"
    save_text(index_path, index_content)

    return {
        "dossier_dir": str(dossier_dir.resolve()),
        "dossier_name": dossier_dir.name,
        "index_file": str(index_path.resolve()),
        "json_file": str(json_path.resolve()),
        "source_files": source_files,
    }
