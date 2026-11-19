"""runtime home —— web-search 技能结果文件的统一落点。
本模块自带，不依赖技能目录之外的任何文件，可随技能整体独立使用。

产出的文件一律归位到本技能的 runtime home：
    <项目根>/runtime/web-search/          找到项目根标记时
    <当前工作目录>/runtime/web-search/     找不到标记时（技能被独立分发到别处）

项目根标记（自脚本所在目录向上逐级查找，命中即止）：.agents、.opencode、.git。
目录由脚本自动创建，无需手工建。

落盘参数（-o / --out）语义如下：
| 调用方式            | 落点                                  |
| :------------------ | :------------------------------------ |
| 省略该参数          | 不落盘                                |
| --out（不给值）     | runtime/web-search/<脚本自动生成名>   |
| --out 结果.json     | runtime/web-search/结果.json          |
| --out /abs/a.json   | /abs/a.json（绝对路径原样保留）       |
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# Windows/Unix 文件名非法字符
_ILLEGAL = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

# 项目根标记：自近及远扫描祖先目录，命中任一即视为项目根
_ROOT_MARKERS = (".agents", ".opencode", ".git")


def skill_name(skill_file: str) -> str:
    """由脚本路径推导技能名：向上查找包含 SKILL.md 或父级为 skills 的目录，若无则回退为 web-search。"""
    here = Path(skill_file).resolve()
    for parent in here.parents:
        if (parent / "SKILL.md").exists():
            return parent.name
        if parent.parent.name == "skills":
            return parent.name
    return "web-search"


def project_root(skill_file: str) -> Path:
    """向上找项目根：第一个含 `_ROOT_MARKERS` 中任一标记的祖先。"""
    here = Path(skill_file).resolve()
    for parent in here.parents:
        if any((parent / marker).exists() for marker in _ROOT_MARKERS):
            return parent
    return Path.cwd()


def runtime_home(skill_file: str) -> Path:
    """本技能的 runtime home（不存在则创建）。"""
    home = project_root(skill_file) / "runtime" / skill_name(skill_file)
    home.mkdir(parents=True, exist_ok=True)
    return home


def slug(text: str, limit: int = 40) -> str:
    """把标题/查询词压成安全文件名片段，保留中文，去掉路径非法字符。"""
    cleaned = _ILLEGAL.sub("-", str(text)).strip(" .-")
    return cleaned[:limit] if cleaned else "search"


def auto_name(prefix: str, ext: str, key: str = "") -> str:
    """生成带时间戳和关键词片段的规范文件名。"""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    clean_ext = ext.lstrip(".")
    if key:
        return f"{prefix}_{ts}_{slug(key)}.{clean_ext}"
    return f"{prefix}_{ts}.{clean_ext}"


def resolve_out_path(skill_file: str, out_val: Optional[str], default_prefix: str = "search", key: str = "") -> Optional[Path]:
    """解析 -o / --out 参数的目标落盘绝对路径。"""
    if out_val is None:
        return None
    val = out_val.strip()
    if not val:
        filename = auto_name(default_prefix, "json", key)
        return runtime_home(skill_file) / filename
    p = Path(val)
    if p.is_absolute():
        p.parent.mkdir(parents=True, exist_ok=True)
        return p
    return runtime_home(skill_file) / val


def save_json(target_path: Path, data: Any) -> str:
    """保存结构化数据为 JSON 文件，返回绝对路径字符串。"""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return str(target_path.resolve())


def save_text(target_path: Path, content: str) -> str:
    """保存纯文本/Markdown 文件，返回绝对路径字符串。"""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with open(target_path, "w", encoding="utf-8") as f:
        f.write(content)
    return str(target_path.resolve())
