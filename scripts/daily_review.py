#!/usr/bin/env python3
"""
每日复盘总结生成器
帮助回顾一天的工作成果，整理进展，列出未完成的工作
"""

import datetime
from typing import List, Optional
from generate_board import DailyFocusBoard, WorkItem, WorkStatus, WorkType, Priority


class DailyReview:
    """每日复盘类"""

    def __init__(self, date: Optional[datetime.date] = None):
        self.date = date or datetime.date.today()
        self.completed_tasks: List[WorkItem] = []
        self.completed_meetings: List[WorkItem] = []
        self.in_progress_items: List[WorkItem] = []
        self.uncompleted_items: List[WorkItem] = []
        self.key_achievements: List[str] = []

    def _get_month_dir(self) -> str:
        """获取年月目录名称，如 202604"""
        return self.date.strftime("%Y%m")
    
    def load_from_board(self, board: DailyFocusBoard):
        """从看板加载数据"""
        self.date = board.date
        self.completed_tasks = [t for t in board.get_tasks() if t.status == WorkStatus.COMPLETED]
        self.completed_meetings = [m for m in board.get_meetings() if m.status == WorkStatus.COMPLETED]
        self.in_progress_items = board.get_by_status(WorkStatus.IN_PROGRESS)
        self.uncompleted_items = board.get_uncompleted_items()
    
    def add_key_achievement(self, achievement: str):
        """添加关键成果"""
        self.key_achievements.append(achievement)
    
    def generate_markdown(self) -> str:
        """生成复盘总结的Markdown"""
        lines = []

        # 标题
        lines.append(f"# 📝 每日复盘 - {self.date.strftime('%Y年%m月%d日 %A')}")
        lines.append("")

        # 今日完成
        lines.append("## ✅ 今日完成")
        lines.append("")

        # 优先级图标映射
        priority_icons = {
            Priority.HIGH: "🔴",
            Priority.MEDIUM: "🟡",
            Priority.LOW: "🟢"
        }

        # 完成的任务
        if self.completed_tasks:
            lines.append("### 📝 完成的任务")
            lines.append("")
            for task in self.completed_tasks:
                priority_icon = priority_icons[task.priority]
                category_badge = f" `{task.category}`" if task.category else ""
                lines.append(f"- ✅ {priority_icon} **{task.name}** - {task.get_progress_bar()}{category_badge}")
                if task.progress_records:
                    lines.append("  进展：")
                    for record in task.progress_records:
                        time_str = record.timestamp.strftime("%H:%M")
                        lines.append(f"  - ⏰ {time_str}: {record.content}")
            lines.append("")

        # 完成的会议
        if self.completed_meetings:
            lines.append("### 📅 完成的会议")
            lines.append("")
            for meeting in self.completed_meetings:
                priority_icon = priority_icons[meeting.priority]
                category_badge = f" `{meeting.category}`" if meeting.category else ""
                lines.append(f"- ✅ {priority_icon} **{meeting.name}** - {meeting.get_progress_bar()}{category_badge}")
                if meeting.progress_records:
                    lines.append("  进展：")
                    for record in meeting.progress_records:
                        time_str = record.timestamp.strftime("%H:%M")
                        lines.append(f"  - ⏰ {time_str}: {record.content}")
            lines.append("")

        # 进行中的工作
        if self.in_progress_items:
            lines.append("## 🔄 进行中的工作")
            lines.append("")
            for item in self.in_progress_items:
                type_icon = "📝" if item.work_type == WorkType.TASK else "📅"
                priority_icon = priority_icons[item.priority]
                category_badge = f" `{item.category}`" if item.category else ""
                lines.append(f"- {type_icon} {priority_icon} **{item.name}** - {item.get_progress_bar()}{category_badge}")
                if item.progress_records:
                    lines.append("  当前进展：")
                    for record in item.progress_records:
                        time_str = record.timestamp.strftime("%H:%M")
                        lines.append(f"  - ⏰ {time_str}: {record.content}")
            lines.append("")

        # 未完成的工作（待承接）
        if self.uncompleted_items:
            lines.append("## 📦 未完成的工作（待承接）")
            lines.append("")
            lines.append("> 以下工作将在下次开始工作时自动承接")
            lines.append("")
            for item in self.uncompleted_items:
                type_icon = "📝" if item.work_type == WorkType.TASK else "📅"
                priority_icon = priority_icons[item.priority]
                category_badge = f" `{item.category}`" if item.category else ""
                lines.append(f"- {type_icon} {priority_icon} **{item.name}** - {item.get_progress_bar()}{category_badge} ({item.status.value})")
            lines.append("")

        # 关键成果
        if self.key_achievements:
            lines.append("## 🏆 关键成果")
            lines.append("")
            for achievement in self.key_achievements:
                lines.append(f"- 🌟 {achievement}")
            lines.append("")

        # 今日统计
        lines.append("## 📊 今日统计")
        lines.append("")
        total_completed = len(self.completed_tasks) + len(self.completed_meetings)
        lines.append(f"- 完成任务数：{len(self.completed_tasks)} 个")
        lines.append(f"- 完成会议数：{len(self.completed_meetings)} 个")
        lines.append(f"- 总计完成：{total_completed} 项")
        lines.append(f"- 进行中：{len(self.in_progress_items)} 项")
        lines.append(f"- 待承接：{len(self.uncompleted_items)} 项")
        lines.append("")

        # 明日提示
        lines.append("---")
        lines.append("")
        lines.append("💡 **明天继续加油！**")
        lines.append("")
        lines.append("\"每一次复盘，都是为了更好地前进。\"")

        return "\n".join(lines)
    
    def save_to_file(self, filepath: Optional[str] = None, storage_path: Optional[str] = None) -> str:
        """保存到文件"""
        import os

        save_dir = storage_path

        if not filepath:
            filename = f"daily-review-{self.date.strftime('%Y%m%d')}.md"
            if save_dir:
                # 按年月分类保存
                month_dir = self._get_month_dir()
                full_save_dir = os.path.join(save_dir, month_dir)
                filepath = os.path.join(full_save_dir, filename)
            else:
                filepath = filename
        else:
            if save_dir and not os.path.isabs(filepath):
                filepath = os.path.join(save_dir, filepath)

        # 确保目录存在
        file_dir = os.path.dirname(filepath)
        if file_dir:
            os.makedirs(file_dir, exist_ok=True)

        content = self.generate_markdown()

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

        return filepath


def create_review_from_board(board: DailyFocusBoard) -> DailyReview:
    """从看板创建复盘"""
    review = DailyReview(date=board.date)
    review.load_from_board(board)
    return review


def main():
    """示例用法"""
    from generate_board import DailyFocusBoard, Priority, WorkStatus
    
    # 创建一个示例看板
    board = DailyFocusBoard()
    
    task1 = board.add_task("完成项目报告", Priority.HIGH)
    task1.add_progress("开始写报告")
    task1.add_progress("写完了初稿")
    task1.update_status(WorkStatus.COMPLETED)
    
    task2 = board.add_task("整理文档", Priority.MEDIUM)
    task2.update_status(WorkStatus.IN_PROGRESS)
    task2.add_progress("整理了一半")
    
    meeting1 = board.add_meeting("产品评审会", Priority.HIGH)
    meeting1.update_status(WorkStatus.COMPLETED)
    meeting1.add_progress("会议顺利完成，确定了产品方向")
    
    meeting2 = board.add_meeting("周会", Priority.MEDIUM)
    
    carried_task = board.add_task("继续做Q2规划", Priority.HIGH, is_carried_over=True)
    carried_task.update_status(WorkStatus.IN_PROGRESS)
    
    # 创建复盘
    review = create_review_from_board(board)
    review.add_key_achievement("完成了项目报告初稿")
    review.add_key_achievement("产品方向确定了")
    
    print(review.generate_markdown())
    # review.save_to_file()


if __name__ == "__main__":
    main()

