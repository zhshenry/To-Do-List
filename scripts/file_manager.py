#!/usr/bin/env python3
"""
文件管理器
管理 daily-focus 的文件，查找前一次记录，承接剩余工作
"""

import os
import re
import datetime
from typing import List, Optional, Tuple
from pathlib import Path
from generate_board import DailyFocusBoard, WorkItem, WorkStatus


class FileManager:
    """文件管理器类"""
    
    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = storage_path
    
    def _get_all_board_files(self) -> List[Tuple[str, str]]:
        """获取所有的看板文件，包括子目录中的文件
        Returns:
            List of (filepath, filename) tuples
        """
        if not self.storage_path:
            return []

        if not os.path.exists(self.storage_path):
            return []

        files = []
        # 递归查找所有子目录
        for root, _, filenames in os.walk(self.storage_path):
            for filename in filenames:
                if filename.startswith("daily-focus-") and filename.endswith(".md"):
                    filepath = os.path.join(root, filename)
                    files.append((filepath, filename))

        # 按文件名排序（日期从新到旧）
        files.sort(key=lambda x: x[1], reverse=True)
        return files

    def _extract_date_from_filename(self, filename: str) -> Optional[datetime.date]:
        """从文件名中提取日期"""
        # 格式: daily-focus-YYYYMMDD.md
        match = re.search(r'daily-focus-(\d{8})\.md', filename)
        if match:
            date_str = match.group(1)
            try:
                return datetime.datetime.strptime(date_str, "%Y%m%d").date()
            except ValueError:
                pass
        return None

    def get_latest_board_file(self) -> Optional[Tuple[str, str]]:
        """获取最近一次的看板文件
        Returns:
            (filepath, filename) tuple or None
        """
        files = self._get_all_board_files()
        if files:
            return files[0]
        return None

    def get_latest_board(self) -> Optional[DailyFocusBoard]:
        """获取最近一次的看板"""
        latest_file = self.get_latest_board_file()
        if latest_file:
            filepath, filename = latest_file
            # 从完整路径加载，不需要 storage_path
            return DailyFocusBoard.load_from_file(filepath, None)
        return None
    
    def get_uncompleted_items_from_latest(self) -> List[WorkItem]:
        """从最近一次的看板中获取未完成的工作项"""
        latest_board = self.get_latest_board()
        if latest_board:
            return latest_board.get_uncompleted_items()
        return []
    
    def carry_over_items_to_new_board(self, new_board: DailyFocusBoard,
                                     items_to_carry: List[WorkItem]) -> DailyFocusBoard:
        """将选定的工作项承接给新的看板"""
        for item in items_to_carry:
            if item.work_type == WorkItem.WorkType.TASK:
                new_task = new_board.add_task(
                    name=item.name,
                    priority=item.priority,
                    category=item.category,
                    is_carried_over=True
                )
                # 承接时保留进度百分比，但不超过99%（避免变成已完成）
                new_task.update_progress_percent(min(item.progress_percent, 99))
            else:
                new_meeting = new_board.add_meeting(
                    name=item.name,
                    priority=item.priority,
                    category=item.category,
                    is_carried_over=True
                )
                # 承接时保留进度百分比，但不超过99%
                new_meeting.update_progress_percent(min(item.progress_percent, 99))
        return new_board

    def get_board_for_date(self, date: datetime.date) -> Optional[DailyFocusBoard]:
        """获取指定日期的看板"""
        date_str = date.strftime("%Y%m%d")
        filename = f"daily-focus-{date_str}.md"
        month_dir = date.strftime("%Y%m")

        # 先在年月子目录中查找
        if self.storage_path:
            filepath = os.path.join(self.storage_path, month_dir, filename)
            if os.path.exists(filepath):
                return DailyFocusBoard.load_from_file(filepath, None)

            # 如果子目录没有，再在根目录查找（兼容旧文件）
            filepath = os.path.join(self.storage_path, filename)
            if os.path.exists(filepath):
                return DailyFocusBoard.load_from_file(filepath, None)
        else:
            # 没有配置存储路径，直接在当前目录查找
            if os.path.exists(filename):
                return DailyFocusBoard.load_from_file(filename, None)

        return None
    
    def create_or_get_today_board(self) -> DailyFocusBoard:
        """创建或获取今天的看板"""
        today = datetime.date.today()
        board = self.get_board_for_date(today)
        
        if board is None:
            board = DailyFocusBoard(date=today)
        
        return board
    
    def list_all_boards(self) -> List[Tuple[str, datetime.date]]:
        """列出所有看板文件及其日期
        Returns:
            List of (filepath, date) tuples
        """
        files = self._get_all_board_files()
        result = []
        for filepath, filename in files:
            date = self._extract_date_from_filename(filename)
            if date:
                result.append((filepath, date))
        return result


def main():
    """测试文件管理器"""
    # 这只是一个测试示例
    print("FileManager 测试")
    print("=" * 50)
    
    # 注意：需要先配置 storage_path 才能使用
    print("提示：请先配置存储目录后使用 FileManager")


if __name__ == "__main__":
    main()
