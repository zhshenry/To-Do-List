#!/usr/bin/env python3
"""
月度计划汇总生成器
从当月的每日计划中汇总生成月度计划表格
"""

import os
import re
import datetime
from typing import List, Dict, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass, field
from enum import Enum
from generate_board import DailyFocusBoard, WorkItem, WorkStatus, Priority, WorkType


@dataclass
class MonthlyWorkItem:
    """月度工作项汇总"""
    category: str
    name: str
    work_type: WorkType
    status: WorkStatus = WorkStatus.TODO
    progress_percent: int = 0
    progress_records: List[str] = field(default_factory=list)
    # 记录该事项在哪些天出现过
    appeared_dates: List[datetime.date] = field(default_factory=list)

    def merge_from(self, item: WorkItem, date: datetime.date):
        """从每日工作项合并更新"""
        if date not in self.appeared_dates:
            self.appeared_dates.append(date)

        # 取最高的进度百分比
        if item.progress_percent > self.progress_percent:
            self.progress_percent = item.progress_percent
            self.status = item.status

        # 合并进展记录（去重）
        for record in item.progress_records:
            record_str = f"{record.timestamp.strftime('%m-%d %H:%M')}: {record.content}"
            if record_str not in self.progress_records:
                self.progress_records.append(record_str)

    def get_status_display(self) -> str:
        """获取状态显示文本"""
        status_icons = {
            WorkStatus.TODO: "📋 待办",
            WorkStatus.IN_PROGRESS: "🔄 进行中",
            WorkStatus.COMPLETED: "✅ 已完成"
        }
        return status_icons.get(self.status, self.status.value)

    def get_type_display(self) -> str:
        """获取类型显示文本"""
        type_icons = {
            WorkType.TASK: "📝 任务",
            WorkType.MEETING: "📅 会议"
        }
        return type_icons.get(self.work_type, self.work_type.value)

    def get_progress_records_display(self) -> str:
        """获取合并后的进展记录显示文本"""
        if not self.progress_records:
            return ""
        return " | ".join(self.progress_records)


class MonthlyFocusBoard:
    """月度聚焦看板类"""

    def __init__(self, year: int, month: int, storage_path: Optional[str] = None):
        self.year = year
        self.month = month
        self.storage_path = storage_path
        self.work_items: Dict[str, MonthlyWorkItem] = {}  # key: category+name+type

    def get_month_str(self) -> str:
        """获取月份字符串，如 202604"""
        return f"{self.year:04d}{self.month:02d}"

    def get_filename(self) -> str:
        """获取文件名"""
        return f"monthly-focus-{self.get_month_str()}.md"

    def get_filepath(self) -> str:
        """获取完整文件路径"""
        if self.storage_path:
            month_dir = self.get_month_str()
            return os.path.join(self.storage_path, month_dir, self.get_filename())
        return self.get_filename()

    def collect_from_daily_boards(self):
        """从当月的每日看板收集数据"""
        if not self.storage_path:
            return

        month_dir = os.path.join(self.storage_path, self.get_month_str())
        if not os.path.exists(month_dir):
            return

        # 遍历当月所有 daily-focus 文件
        for filename in os.listdir(month_dir):
            if filename.startswith("daily-focus-") and filename.endswith(".md"):
                filepath = os.path.join(month_dir, filename)
                board = DailyFocusBoard.load_from_file(filepath, None)
                if board:
                    self._merge_daily_board(board)

    def _merge_daily_board(self, board: DailyFocusBoard):
        """合并一个每日看板的数据"""
        for item in board.work_items:
            key = f"{item.category or '未分类'}|{item.name}|{item.work_type.value}"
            if key not in self.work_items:
                self.work_items[key] = MonthlyWorkItem(
                    category=item.category or "未分类",
                    name=item.name,
                    work_type=item.work_type
                )
            self.work_items[key].merge_from(item, board.date)

    def generate_markdown(self) -> str:
        """生成Markdown格式的月度计划表格"""
        lines = []

        # 标题
        lines.append(f"# 📅 月度工作计划 - {self.year}年{self.month}月")
        lines.append("")

        # 说明
        lines.append("> 本表格由当月每日工作计划自动汇总生成，请勿直接编辑。")
        lines.append("")

        # 按分类分组
        items_by_category: Dict[str, List[MonthlyWorkItem]] = {}
        for item in self.work_items.values():
            cat = item.category or "未分类"
            if cat not in items_by_category:
                items_by_category[cat] = []
            items_by_category[cat].append(item)

        # 生成表格
        for category in sorted(items_by_category.keys()):
            lines.append(f"## {category}")
            lines.append("")

            # 表头
            lines.append("| 类型 | 事项名称 | 状态 | 进度 | 进展记录 |")
            lines.append("|------|---------|------|------|---------|")

            # 内容
            for item in sorted(items_by_category[category], key=lambda x: x.name):
                type_display = item.get_type_display()
                name = item.name.replace("|", "\\|")
                status = item.get_status_display()
                progress = f"{item.progress_percent}%"
                records = item.get_progress_records_display().replace("|", "\\|")
                lines.append(f"| {type_display} | {name} | {status} | {progress} | {records} |")

            lines.append("")

        # 统计信息
        lines.append("## 📊 月度统计")
        lines.append("")
        total = len(self.work_items)
        completed = len([i for i in self.work_items.values() if i.status == WorkStatus.COMPLETED])
        in_progress = len([i for i in self.work_items.values() if i.status == WorkStatus.IN_PROGRESS])
        todo = len([i for i in self.work_items.values() if i.status == WorkStatus.TODO])
        lines.append(f"- 总计：{total} 项")
        lines.append(f"- 已完成：{completed} 项 ✅")
        lines.append(f"- 进行中：{in_progress} 项 🔄")
        lines.append(f"- 待办：{todo} 项 📋")
        lines.append("")

        return "\n".join(lines)

    def save_to_file(self) -> str:
        """保存到文件"""
        filepath = self.get_filepath()
        file_dir = os.path.dirname(filepath)
        if file_dir:
            os.makedirs(file_dir, exist_ok=True)

        content = self.generate_markdown()
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        return filepath


def refresh_monthly_focus(date: datetime.date, storage_path: Optional[str] = None):
    """刷新月度计划（在保存每日计划时调用）"""
    monthly_board = MonthlyFocusBoard(date.year, date.month, storage_path)
    monthly_board.collect_from_daily_boards()
    return monthly_board.save_to_file()


def main():
    """示例用法"""
    from generate_board import DailyFocusBoard, Priority, WorkStatus, WorkType
    import tempfile

    # 创建一个临时目录用于测试
    with tempfile.TemporaryDirectory() as tmpdir:
        print(f"测试目录: {tmpdir}")

        # 创建几天的测试数据
        dates = [
            datetime.date(2026, 4, 1),
            datetime.date(2026, 4, 2),
            datetime.date(2026, 4, 3),
        ]

        for date in dates:
            board = DailyFocusBoard(date=date)

            task1 = board.add_task("完成项目报告", Priority.HIGH, category="项目A")
            task1.add_progress(f"{date} 开始写报告")
            if date >= dates[1]:
                task1.update_progress_percent(50)
            if date >= dates[2]:
                task1.update_status(WorkStatus.COMPLETED)
                task1.add_progress(f"{date} 完成了报告")

            task2 = board.add_task("整理文档", Priority.MEDIUM, category="文档管理")
            if date >= dates[1]:
                task2.update_progress_percent(30)

            meeting1 = board.add_meeting("产品评审会", Priority.HIGH, category="产品规划")
            if date == dates[0]:
                meeting1.add_progress("会议顺利完成，确定了产品方向")
                meeting1.update_status(WorkStatus.COMPLETED)

            board.save_to_file(storage_path=tmpdir)

        # 刷新月度计划
        monthly_file = refresh_monthly_focus(datetime.date(2026, 4, 15), tmpdir)
        print(f"月度计划已生成: {monthly_file}")

        # 显示生成的内容
        with open(monthly_file, 'r', encoding='utf-8') as f:
            print("\n" + "="*60)
            print(f.read())


if __name__ == "__main__":
    main()
