"""配置与环境变量管理模块。
负责探测并加载 .env 文件，提供各检索源的密钥查询与可用性判断接口。
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Dict, Optional


def load_env_file(file_path: Path) -> Dict[str, str]:
    """简单解析单个 .env 文件的键值对"""
    env_vars: Dict[str, str] = {}
    if not file_path.is_file():
        return env_vars
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key:
                        env_vars[key] = val
    except Exception:
        pass
    return env_vars


class Config:
    """统一配置管理类"""

    def __init__(self, script_path: Optional[str] = None):
        self._env: Dict[str, str] = dict(os.environ)
        # 加载层级：项目根目录 .env -> 脚本目录 .env -> 系统环境变量覆盖
        paths_to_check = []
        if script_path:
            here = Path(script_path).resolve().parent
            paths_to_check.append(here / ".env")
            for parent in here.parents:
                paths_to_check.append(parent / ".env")
                if any((parent / marker).exists() for marker in (".agents", ".git")):
                    break
        
        # 逆序应用，越靠近脚本优先度越高，最后由系统环境变量兜底覆盖
        for env_path in reversed(paths_to_check):
            if env_path.is_file():
                self._env.update(load_env_file(env_path))
        
        # 系统环境变量最高优先
        self._env.update(os.environ)

    def get(self, key: str, default: str = "") -> str:
        """获取配置项"""
        return (self._env.get(key) or default).strip()

    @property
    def anysearch_api_key(self) -> str:
        return self.get("ANYSEARCH_API_KEY")

    @property
    def anysearch_api_base_url(self) -> str:
        """AnySearch 服务端点，可用 ANYSEARCH_API_BASE_URL 覆盖（测试代理/私有部署）"""
        return self.get("ANYSEARCH_API_BASE_URL", "https://api.anysearch.com").rstrip("/")

    @property
    def exa_api_key(self) -> str:
        return self.get("EXA_API_KEY")

    @property
    def tavily_api_key(self) -> str:
        return self.get("TAVILY_API_KEY")

    @property
    def doubao_api_key(self) -> str:
        return self.get("DOUBAO_API_KEY")

    @property
    def zhihu_access_secret(self) -> str:
        return self.get("ZHIHU_ACCESS_SECRET")

    @property
    def wikipedia_user_agent(self) -> str:
        default_ua = "SkillWebSearch/1.1 (https://github.com/skill-creator/web-search; research-bot) urllib/3.14"
        return self.get("WIKIPEDIA_USER_AGENT", default_ua)

    @property
    def timeout_seconds(self) -> int:
        raw = self.get("WEB_SEARCH_TIMEOUT", "15")
        try:
            return max(5, int(raw))
        except ValueError:
            return 15

    def is_provider_configured(self, provider_id: str) -> bool:
        """检查特定 Provider 是否具备可用凭据"""
        pid = provider_id.lower()
        if pid in ("duckduckgo", "wikipedia"):
            return True
        if pid == "anysearch":
            # AnySearch 支持匿名，但若配了 key 额度更宽
            return True
        if pid == "exa":
            return bool(self.exa_api_key)
        if pid == "tavily":
            return bool(self.tavily_api_key)
        if pid == "doubao":
            return bool(self.doubao_api_key)
        if pid.startswith("zhihu"):
            return bool(self.zhihu_access_secret)
        return False
