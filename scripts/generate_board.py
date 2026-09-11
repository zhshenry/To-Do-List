#!/usr/bin/env python3
"""
每日工作看板生成器
支持任务和会议分类，记录进展，更新状态
"""

import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass, field
from enum import Enum
import os
import re
import json


class WorkStatus(Enum):
    """工作状态枚举"""
    TODO = "待办"
    IN_PROGRESS = "进行中"
    COMPLETED = "已完成"


class Priority(Enum):
    """优先级枚举"""
    HIGH = "高"
    MEDIUM = "中"
    LOW = "低"


class WorkType(Enum):
    """工作类型枚举"""
    TASK = "任务"
    MEETING = "会议"


@dataclass
class ProgressRecord:
    """进展记录"""
    timestamp: datetime.datetime
    content: str
    
    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "content": self.content
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "ProgressRecord":
        return cls(
            timestamp=datetime.datetime.fromisoformat(data["timestamp"]),
            content=data["content"]
        )


@dataclass
class WorkItem:
    """工作项（任务或会议）"""
    id: str
    name: str
    work_type: WorkType
    status: WorkStatus = WorkStatus.TODO
    priority: Priority = Priority.MEDIUM
    category: str = ""  # 分类项
    progress_percent: int = 0  # 进展百分比 0-100
    progress_records: List[ProgressRecord] = field(default_factory=list)
    is_carried_over: bool = False  # 是否是从之前承接的工作

    def __post_init__(self):
        """初始化后根据进度百分比自动设置状态"""
        self._sync_status_with_progress()

    def _sync_status_with_progress(self):
        """根据进度百分比同步状态"""
        if self.progress_percent <= 0:
            self.status = WorkStatus.TODO
            self.progress_percent = 0
        elif self.progress_percent >= 100:
            self.status = WorkStatus.COMPLETED
            self.progress_percent = 100
        else:
            self.status = WorkStatus.IN_PROGRESS

    def add_progress(self, content: str, timestamp: Optional[datetime.datetime] = None):
        """添加进展记录"""
        if timestamp is None:
            timestamp = datetime.datetime.now()
        self.progress_records.append(ProgressRecord(timestamp, content))

    def update_status(self, status: WorkStatus):
        """更新状态（同时更新进度百分比）"""
        self.status = status
        if status == WorkStatus.TODO:
            self.progress_percent = 0
        elif status == WorkStatus.COMPLETED:
            self.progress_percent = 100
        elif status == WorkStatus.IN_PROGRESS and self.progress_percent <= 0:
            self.progress_percent = 50  # 默认进行中为50%

    def update_progress_percent(self, percent: int):
        """更新进度百分比（0-100），自动同步状态"""
        self.progress_percent = max(0, min(100, percent))
        self._sync_status_with_progress()

    def get_progress_bar(self, width: int = 20) -> str:
        """生成进度条字符串"""
        filled = int(self.progress_percent / 100 * width)
        bar = "█" * filled + "░" * (width - filled)
        return f"{bar} {self.progress_percent}%"
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "work_type": self.work_type.value,
            "status": self.status.value,
            "priority": self.priority.value,
            "category": self.category,
            "progress_percent": self.progress_percent,
            "progress_records": [r.to_dict() for r in self.progress_records],
            "is_carried_over": self.is_carried_over
        }

    @classmethod
    def from_dict(cls, data: dict) -> "WorkItem":
        item = cls(
            id=data["id"],
            name=data["name"],
            work_type=WorkType(data["work_type"]),
            status=WorkStatus(data["status"]),
            priority=Priority(data["priority"]),
            category=data.get("category", ""),
            progress_percent=data.get("progress_percent", 0),
            progress_records=[ProgressRecord.from_dict(r) for r in data.get("progress_records", [])],
            is_carried_over=data.get("is_carried_over", False)
        )
        # 确保进度和状态同步
        item._sync_status_with_progress()
        return item


class DailyFocusBoard:
    """每日聚焦看板类"""
    
    STATUS_ICONS = {
        WorkStatus.TODO: "📋",
        WorkStatus.IN_PROGRESS: "🔄",
        WorkStatus.COMPLETED: "✅"
    }
    
    PRIORITY_ICONS = {
        Priority.HIGH: "🔴",
        Priority.MEDIUM: "🟡",
        Priority.LOW: "🟢"
    }
    
    TYPE_ICONS = {
        WorkType.TASK: "📝",
        WorkType.MEETING: "📅"
    }
    
    def __init__(self, date: Optional[datetime.date] = None):
        self.date = date or datetime.date.today()
        self.work_items: List[WorkItem] = []
        self._next_id = 1
    
    def _generate_id(self) -> str:
        """生成唯一ID"""
        work_id = f"{self._next_id:03d}"
        self._next_id += 1
        return work_id
    
    def add_task(self, name: str, priority: Priority = Priority.MEDIUM,
                 category: str = "",
                 is_carried_over: bool = False) -> WorkItem:
        """添加任务"""
        item = WorkItem(
            id=self._generate_id(),
            name=name,
            work_type=WorkType.TASK,
            priority=priority,
            category=category,
            is_carried_over=is_carried_over
        )
        self.work_items.append(item)
        return item

    def add_meeting(self, name: str, priority: Priority = Priority.MEDIUM,
                    category: str = "",
                    is_carried_over: bool = False) -> WorkItem:
        """添加会议"""
        item = WorkItem(
            id=self._generate_id(),
            name=name,
            work_type=WorkType.MEETING,
            priority=priority,
            category=category,
            is_carried_over=is_carried_over
        )
        self.work_items.append(item)
        return item
    
    def get_work_item(self, work_id: str) -> Optional[WorkItem]:
        """根据ID获取工作项"""
        for item in self.work_items:
            if item.id == work_id:
                return item
        return None
    
    def get_tasks(self) -> List[WorkItem]:
        """获取所有任务"""
        return [item for item in self.work_items if item.work_type == WorkType.TASK]
    
    def get_meetings(self) -> List[WorkItem]:
        """获取所有会议"""
        return [item for item in self.work_items if item.work_type == WorkType.MEETING]
    
    def get_by_status(self, status: WorkStatus) -> List[WorkItem]:
        """根据状态获取工作项"""
        return [item for item in self.work_items if item.status == status]
    
    def get_by_priority(self, priority: Priority) -> List[WorkItem]:
        """根据优先级获取工作项"""
        return [item for item in self.work_items if item.priority == priority]
    
    def get_carried_over_items(self) -> List[WorkItem]:
        """获取承接的工作项"""
        return [item for item in self.work_items if item.is_carried_over]
    
    def get_uncompleted_items(self) -> List[WorkItem]:
        """获取未完成的工作项"""
        return [item for item in self.work_items if item.status != WorkStatus.COMPLETED]
    
    def generate_markdown(self) -> str:
        """生成Markdown格式的看板"""
        lines = []

        # 标题
        lines.append(f"# 🎯 每日工作 - {self.date.strftime('%Y年%m月%d日 %A')}")
        lines.append("")

        # 承接的工作提示
        carried_over = self.get_carried_over_items()
        if carried_over:
            lines.append("## 📦 承接的工作")
            lines.append("")
            for item in carried_over:
                status_icon = self.STATUS_ICONS[item.status]
                priority_icon = self.PRIORITY_ICONS[item.priority]
                type_icon = self.TYPE_ICONS[item.work_type]
                lines.append(f"- {status_icon} {priority_icon} {type_icon} **{item.name}** - {item.get_progress_bar()} ({item.status.value})")
            lines.append("")

        # 任务列表
        tasks = self.get_tasks()
        if tasks:
            lines.append("## 📝 任务列表")
            lines.append("")
            for task in tasks:
                status_icon = self.STATUS_ICONS[task.status]
                priority_icon = self.PRIORITY_ICONS[task.priority]
                carried_badge = " 📦" if task.is_carried_over else ""
                category_badge = f" `{task.category}`" if task.category else ""

                lines.append(f"### {status_icon} {priority_icon} {task.name}{carried_badge}")
                lines.append("")
                lines.append(f"- **状态**: {status_icon} {task.status.value}")
                lines.append(f"- **进度**: {task.get_progress_bar()}")
                lines.append(f"- **优先级**: {priority_icon} {task.priority.value}")
                if task.category:
                    lines.append(f"- **分类**: {task.category}")

                # 显示进展记录
                if task.progress_records:
                    lines.append("- **进展记录**:")
                    for record in task.progress_records:
                        time_str = record.timestamp.strftime("%H:%M")
                        lines.append(f"  - ⏰ {time_str}: {record.content}")
                lines.append("")
                lines.append("---")
                lines.append("")

        # 会议列表
        meetings = self.get_meetings()
        if meetings:
            lines.append("## 📅 会议列表")
            lines.append("")
            for meeting in meetings:
                status_icon = self.STATUS_ICONS[meeting.status]
                priority_icon = self.PRIORITY_ICONS[meeting.priority]
                carried_badge = " 📦" if meeting.is_carried_over else ""
                category_badge = f" `{meeting.category}`" if meeting.category else ""

                lines.append(f"### {status_icon} {priority_icon} {meeting.name}{carried_badge}")
                lines.append("")
                lines.append(f"- **状态**: {status_icon} {meeting.status.value}")
                lines.append(f"- **进度**: {meeting.get_progress_bar()}")
                lines.append(f"- **优先级**: {priority_icon} {meeting.priority.value}")
                if meeting.category:
                    lines.append(f"- **分类**: {meeting.category}")

                # 显示进展记录
                if meeting.progress_records:
                    lines.append("- **进展记录**:")
                    for record in meeting.progress_records:
                        time_str = record.timestamp.strftime("%H:%M")
                        lines.append(f"  - ⏰ {time_str}: {record.content}")
                lines.append("")
                lines.append("---")
                lines.append("")

        # 统计信息
        lines.append("## 📊 今日统计")
        lines.append("")
        total = len(self.work_items)
        completed = len(self.get_by_status(WorkStatus.COMPLETED))
        in_progress = len(self.get_by_status(WorkStatus.IN_PROGRESS))
        todo = len(self.get_by_status(WorkStatus.TODO))
        lines.append(f"- 总计：{total} 项")
        lines.append(f"- 已完成：{completed} 项 ✅")
        lines.append(f"- 进行中：{in_progress} 项 🔄")
        lines.append(f"- 待办：{todo} 项 📋")
        lines.append("")

        # 提示
        lines.append("---")
        lines.append("")
        lines.append("💡 **提示**：使用进展记录功能来跟踪工作进度！")
        lines.append("")

        # 在文件末尾添加 JSON 数据注释（用于程序读取）
        import json
        json_data = json.dumps(self.to_dict(), ensure_ascii=False, separators=(',', ':'))
        lines.append(f"<!-- JSON_DATA: {json_data} -->")

        return "\n".join(lines)

    def _get_month_dir(self) -> str:
        """获取年月目录名称，如 202604"""
        return self.date.strftime("%Y%m")

    def to_dict(self) -> dict:
        """转换为字典（用于保存）"""
        return {
            "date": self.date.isoformat(),
            "work_items": [item.to_dict() for item in self.work_items],
            "_next_id": self._next_id
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "DailyFocusBoard":
        """从字典加载"""
        board = cls(date=datetime.date.fromisoformat(data["date"]))
        board.work_items = [WorkItem.from_dict(item) for item in data["work_items"]]
        board._next_id = data.get("_next_id", len(board.work_items) + 1)
        return board
    
    def save_to_file(self, filepath: Optional[str] = None, storage_path: Optional[str] = None) -> str:
        """保存到文件"""
        save_dir = storage_path

        if not filepath:
            filename = f"daily-focus-{self.date.strftime('%Y%m%d')}.md"
            if save_dir:
                # 按年月分类保存
                month_dir = self._get_month_dir()
                full_save_dir = os.path.join(save_dir, month_dir)
                filepath = os.path.join(full_save_dir, filename)
            else:
                filepath = filename
        else:
            # 如果用户提供了路径，并且有save_dir，也要确保在正确的目录下
            if save_dir and not os.path.isabs(filepath):
                filepath = os.path.join(save_dir, filepath)

        # 确保目录存在
        file_dir = os.path.dirname(filepath)
        if file_dir:
            os.makedirs(file_dir, exist_ok=True)

        # 保存Markdown（包含内嵌的JSON数据）
        markdown_content = self.generate_markdown()
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(markdown_content)

        # 刷新月度计划
        if save_dir:
            try:
                from monthly_focus import refresh_monthly_focus
                refresh_monthly_focus(self.date, save_dir)
            except Exception:
                # 月度计划刷新失败不影响每日计划的保存
                pass

        # 清理无用文件
        if save_dir:
            try:
                cleanup_useless_files(save_dir)
            except Exception:
                # 清理失败不影响保存
                pass

        return filepath

    @classmethod
    def load_from_file(cls, filepath: str, storage_path: Optional[str] = None) -> Optional["DailyFocusBoard"]:
        """从文件加载"""
        if storage_path and not os.path.isabs(filepath):
            filepath = os.path.join(storage_path, filepath)

        try:
            # 优先从 Markdown 文件中读取内嵌的 JSON 数据
            if os.path.exists(filepath):
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                # 查找 JSON_DATA 注释
                match = re.search(r'<!-- JSON_DATA: (.*?) -->', content)
                if match:
                    json_data = match.group(1)
                    data = json.loads(json_data)
                    # 加载成功后清理无用文件
                    if storage_path:
                        try:
                            cleanup_useless_files(storage_path)
                        except Exception:
                            pass
                    return cls.from_dict(data)
        except Exception:
            pass

        # 兼容旧格式：尝试从独立的 JSON 文件加载
        try:
            json_filepath = filepath.replace('.md', '.json')
            if os.path.exists(json_filepath):
                with open(json_filepath, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                return cls.from_dict(data)
        except Exception:
            pass

        return None


def cleanup_useless_files(storage_path: str):
    """清理存储目录中的无用文件：只保留需要的 .md 文件"""
    if not storage_path or not os.path.exists(storage_path):
        return

    # 允许的文件模式
    allowed_patterns = [
        re.compile(r'^daily-focus-\d{8}\.md$'),
        re.compile(r'^daily-review-\d{8}\.md$'),
        re.compile(r'^monthly-focus-\d{6}\.md$'),
    ]

    for root, _, filenames in os.walk(storage_path):
        for filename in filenames:
            # 检查是否符合允许的模式
            is_allowed = False
            for pattern in allowed_patterns:
                if pattern.match(filename):
                    is_allowed = True
                    break

            if not is_allowed:
                # 删除不允许的文件
                filepath = os.path.join(root, filename)
                try:
                    os.remove(filepath)
                except Exception:
                    pass


def main():
    """示例用法"""
    board = DailyFocusBoard()
    
    # 添加示例任务
    task1 = board.add_task("完成项目报告", Priority.HIGH)
    task1.add_progress("开始写报告")
    task1.add_progress("写完了初稿")
    
    task2 = board.add_task("整理文档", Priority.MEDIUM)
    
    # 添加示例会议
    meeting1 = board.add_meeting("产品评审会", Priority.HIGH)
    meeting1.update_status(WorkStatus.COMPLETED)
    meeting1.add_progress("会议顺利完成，确定了产品方向")
    
    meeting2 = board.add_meeting("周会", Priority.MEDIUM)
    
    # 添加一个承接的工作
    carried_task = board.add_task("继续做Q2规划", Priority.HIGH, is_carried_over=True)
    carried_task.update_status(WorkStatus.IN_PROGRESS)
    
    print(board.generate_markdown())
    # board.save_to_file()


if __name__ == "__main__":
    main()
