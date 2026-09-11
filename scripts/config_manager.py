#!/usr/bin/env python3
"""
配置管理器
管理用户配置，包括存储目录等
"""

import os
import json
from pathlib import Path


class ConfigManager:
    """配置管理器类"""
    
    def __init__(self):
        self.config_dir = self._get_config_dir()
        self.config_file = os.path.join(self.config_dir, "daily-focus-config.json")
        self.config = self._load_config()
    
    def _get_config_dir(self) -> str:
        """获取配置文件存储目录"""
        # 在用户目录下创建配置文件夹
        home = str(Path.home())
        config_dir = os.path.join(home, ".daily-focus")
        return config_dir
    
    def _load_config(self) -> dict:
        """加载配置"""
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                return {}
        return {}
    
    def _save_config(self):
        """保存配置"""
        # 确保目录存在
        os.makedirs(self.config_dir, exist_ok=True)
        
        with open(self.config_file, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, ensure_ascii=False, indent=2)
    
    def get_storage_path(self) -> str:
        """获取存储目录路径"""
        return self.config.get("storage_path", "")
    
    def set_storage_path(self, path: str):
        """设置存储目录路径"""
        # 规范化路径
        path = os.path.normpath(path)
        self.config["storage_path"] = path
        self._save_config()
    
    def has_storage_path(self) -> bool:
        """是否已配置存储目录"""
        return "storage_path" in self.config and self.config["storage_path"]
    
    def ensure_storage_dir(self):
        """确保存储目录存在"""
        path = self.get_storage_path()
        if path:
            os.makedirs(path, exist_ok=True)
            return path
        return None


# 全局配置管理器实例
_config_manager = None


def get_config_manager() -> ConfigManager:
    """获取全局配置管理器"""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager


def main():
    """测试配置管理器"""
    cm = ConfigManager()
    
    print(f"配置文件位置: {cm.config_file}")
    
    if cm.has_storage_path():
        print(f"当前存储目录: {cm.get_storage_path()}")
    else:
        print("未配置存储目录")
    
    # 测试设置
    # cm.set_storage_path(r"D:\WeCode\Every_Day_Focus")
    print(f"设置后存储目录: {cm.get_storage_path()}")


if __name__ == "__main__":
    main()
