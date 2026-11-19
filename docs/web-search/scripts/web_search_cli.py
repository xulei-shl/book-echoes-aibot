"""WebSearch CLI 统一命令行门面调度器。
实现参数解析、中英双轨交叉调度、单源指定、降级容错以及 Markdown / 留存轨输出。
"""
from __future__ import annotations

import argparse
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Optional

# 将当前脚本目录加到 sys.path，保证独立运行
_SCRIPT_DIR = Path(__file__).resolve().parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from common.config import Config
from common.merger import cross_merge, format_markdown_output
from common.models import FallbackEvent, SearchResponse, SearchResult
from common.runtime_home import resolve_out_path, save_json
from providers.registry import ProviderRegistry


def run_doctor(registry: ProviderRegistry) -> int:
    """健康诊断：输出所有检索源的配置和可用性概览"""
    print("\n🔍 WebSearch 检索源健康诊断与凭据检测\n" + "=" * 55)
    print(f"{'检索源 ID':<15}{'名称':<14}{'密钥要求':<10}{'当前状态':<12}")
    print("-" * 55)

    all_providers = registry.list_providers()
    for prov in all_providers:
        req_key = "必需" if prov.requires_key else "免密"
        status = "✅ 就绪" if prov.is_available() else "❌ 未配置"
        print(f"{prov.id:<15}{prov.name:<14}{req_key:<10}{status:<12}")

    print("=" * 55)
    print("💡 凭据提示：需要配置密钥的源，可在脚本同级 .env 或系统环境变量中配置对应 Key。\n")
    return 0


def execute_search(args: argparse.Namespace) -> int:
    """执行检索主流程"""
    config = Config(str(_SCRIPT_DIR / "web_search_cli.py"))
    registry = ProviderRegistry(config)

    query = (args.query or "").strip()
    if not query:
        print("错误: 必须提供检索关键词 (-q / --query)", file=sys.stderr)
        return 1

    count = max(1, min(int(args.count or 5), 20))
    allow_fallback = not args.no_fallback
    specified_source = (args.source or "").strip().lower()
    mode = (args.mode or "").strip().lower()
    # 双轨语区路由：中文轨默认锁定境内中文索引，海外轨默认锁定国际英文索引
    chinese_zone = args.zone or "cn"
    chinese_language = args.language or "zh-CN"
    foreign_zone = args.zone or "intl"
    foreign_language = args.language or "en"

    response = SearchResponse(query=query)

    # -------------------------------------------------------------
    # 分支 1: 用户显式指定特定检索源（单轨执行）
    # -------------------------------------------------------------
    if specified_source:
        response.track_mode = "single"
        prov = registry.get_provider(specified_source)
        if not prov:
            print(f"错误: 不支持的检索源 '{specified_source}'", file=sys.stderr)
            return 1

        # 确定实际模式：知乎默认 global，维基百科默认 summary（摘要模式），其他默认 web
        actual_mode = mode or ("global" if specified_source == "zhihu" else "summary" if specified_source == "wikipedia" else "web")
        candidate_chain = [specified_source]
        if allow_fallback:
            # 单源降级链补充：若指定源失败，自动按中/外语种属性平滑兜底
            if specified_source in ("exa", "tavily", "anysearch", "duckduckgo"):
                for cid in registry.get_preferred_foreign_candidates():
                    if cid not in candidate_chain:
                        candidate_chain.append(cid)
            else:
                for cid in registry.get_preferred_chinese_candidates():
                    if cid not in candidate_chain:
                        candidate_chain.append(cid)

        try:
            results, fallbacks, final_src = registry.execute_with_fallback(
                candidate_ids=candidate_chain,
                query=query,
                count=count,
                mode=actual_mode,
                allow_fallback=allow_fallback,
                model=args.model,
                filter=args.filter,
                search_db=args.search_db,
                zone=args.zone,
                language=args.language,
            )
            response.results = results
            response.fallbacks = fallbacks
            response.sources_used = [final_src]

            # 若为直答模式，抓取回答内容
            if actual_mode == "zhida" and results and "answer" in results[0].extra:
                response.answer = results[0].extra["answer"]
        except Exception as e:
            print(f"检索失败: {e}", file=sys.stderr)
            return 1

    # -------------------------------------------------------------
    # 分支 2: 纯中文模式 (--chinese-only)
    # -------------------------------------------------------------
    elif args.chinese_only:
        response.track_mode = "single"
        candidates = registry.get_preferred_chinese_candidates()
        try:
            results, fallbacks, final_src = registry.execute_with_fallback(
                candidate_ids=candidates,
                query=query,
                count=count,
                mode="web",
                allow_fallback=allow_fallback,
                zone=chinese_zone,
                language=chinese_language,
            )
            response.results = results
            response.fallbacks = fallbacks
            response.sources_used = [final_src]
        except Exception as e:
            print(f"中文检索失败: {e}", file=sys.stderr)
            return 1

    # -------------------------------------------------------------
    # 分支 3: 默认双轨交叉检索（硬性规则生效）
    # -------------------------------------------------------------
    else:
        response.track_mode = "dual"
        query_en = (args.query_en or "").strip() or query
        response.query_en = query_en

        foreign_candidates = registry.get_preferred_foreign_candidates()
        chinese_candidates = registry.get_preferred_chinese_candidates()

        track_results: List[List[SearchResult]] = [[], []]
        all_fallbacks: List[FallbackEvent] = []
        sources_used: List[str] = []

        # 并行执行海外轨与中文轨
        def _run_foreign():
            return registry.execute_with_fallback(
                candidate_ids=foreign_candidates,
                query=query_en,
                count=count,
                mode="web",
                allow_fallback=allow_fallback,
                zone=foreign_zone,
                language=foreign_language,
            )

        def _run_chinese():
            return registry.execute_with_fallback(
                candidate_ids=chinese_candidates,
                query=query,
                count=count,
                mode="web",
                allow_fallback=allow_fallback,
                zone=chinese_zone,
                language=chinese_language,
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            future_foreign = executor.submit(_run_foreign)
            future_chinese = executor.submit(_run_chinese)

            try:
                f_res, f_fb, f_src = future_foreign.result()
                track_results[0] = f_res
                all_fallbacks.extend(f_fb)
                sources_used.append(f_src)
            except Exception as e:
                all_fallbacks.append(
                    FallbackEvent(
                        original_source="foreign_track",
                        fallback_source="none",
                        reason=f"海外轨全部失败: {e}",
                        query=query_en,
                    )
                )

            try:
                c_res, c_fb, c_src = future_chinese.result()
                track_results[1] = c_res
                all_fallbacks.extend(c_fb)
                sources_used.append(c_src)
            except Exception as e:
                all_fallbacks.append(
                    FallbackEvent(
                        original_source="chinese_track",
                        fallback_source="none",
                        reason=f"中文轨全部失败: {e}",
                        query=query,
                    )
                )

        # 交叉合并海外轨和中文轨结果
        merged = cross_merge(track_results[0], track_results[1])
        response.results = merged
        response.fallbacks = all_fallbacks
        response.sources_used = sources_used

    # -------------------------------------------------------------
    # 留存轨处理：-o / --out 主题档案卷宗 (Topic Dossier) 归档
    # -------------------------------------------------------------
    if args.out is not None:
        from common.dossier import export_topic_dossier
        dossier_meta = export_topic_dossier(
            skill_file=str(_SCRIPT_DIR / "web_search_cli.py"),
            response=response,
            custom_dir=args.out.strip() if args.out else "",
        )
        response.saved_file = dossier_meta["index_file"]
        response.dossier_dir = dossier_meta["dossier_dir"]
        response.dossier_files = dossier_meta["source_files"]

    # -------------------------------------------------------------
    # 感知轨输出：渲染高密度 Markdown 文本到 stdout
    # -------------------------------------------------------------
    md_output = format_markdown_output(response)
    print(md_output)
    return 0


def main():
    parser = argparse.ArgumentParser(
        prog="web_search_cli.py",
        description="通用模块化网络检索 CLI，支持多源热插拔、中英文双轨交叉合并及自动平滑降级。",
    )

    # 诊断子命令
    subparsers = parser.add_subparsers(dest="command")
    doctor_parser = subparsers.add_parser("doctor", help="诊断所有检索源状态与凭据配置")

    # 默认搜索参数（挂在顶层解析器上）
    parser.add_argument("-q", "--query", type=str, help="检索主关键词（中文或通用）")
    parser.add_argument("--query-en", type=str, default="", help="英文检索关键词（双轨模式下供海外源使用）")
    parser.add_argument(
        "-s",
        "--source",
        type=str,
        default="",
        help="显式指定单一检索源: duckduckgo / wikipedia / anysearch / doubao / exa / tavily / zhihu",
    )
    parser.add_argument(
        "-m",
        "--mode",
        type=str,
        default="",
        help="子模式 (知乎: global/zhihu/zhida; 维基百科: search/summary/article)",
    )
    parser.add_argument("-n", "--count", type=int, default=5, help="检索结果数量上限 (1-20，默认 5)")
    parser.add_argument("--no-fallback", action="store_true", help="严格模式：禁用自动错误平滑降级")
    parser.add_argument("--chinese-only", action="store_true", help="跳过海外轨，仅在中文源中检索")
    parser.add_argument(
        "--zone",
        type=str,
        default="",
        help="语区偏好 (cn/intl)：双轨下海外轨默认 intl、中文轨默认 cn",
    )
    parser.add_argument(
        "--language",
        type=str,
        default="",
        help="结果语种偏好 (如 zh-CN/en)：双轨下海外轨默认 en、中文轨默认 zh-CN",
    )
    parser.add_argument("-o", "--out", nargs="?", const="", default=None, help="留存轨：将完整结构化 JSON 数据保存到文件")

    # 源特定高级参数
    parser.add_argument("--model", type=str, default="zhida-fast-1p5", help="知乎直答模型档位")
    parser.add_argument("--filter", type=str, default="", help="知乎全网搜索高级 Filter 语法")
    parser.add_argument("--search-db", type=str, default="all", help="知乎全网搜索索引库 (all/realtime/static)")

    args = parser.parse_args()

    config = Config(str(_SCRIPT_DIR / "web_search_cli.py"))
    registry = ProviderRegistry(config)

    if args.command == "doctor":
        sys.exit(run_doctor(registry))

    if not args.query:
        parser.print_help()
        sys.exit(1)

    sys.exit(execute_search(args))


if __name__ == "__main__":
    main()
