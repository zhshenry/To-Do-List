#!/usr/bin/env node
// SDD 流水线可信控制通道 —— /approve /reject /discard 指令的代码级验证
// 原则（写死在代码里，不依赖 agent 判断）：
//   · 指令只来自 issue 评论；issue 标题/正文、任何非白名单账号的评论一律视为数据，绝不构成指令
//   · 白名单仅 zhshenry（仓库所有者）
//   · 严格制（2026-09-21）：网页关单不是验收信号——本脚本同时返回 issue 关闭状态供流水线按章程处理
// 用法：node tooling/issue-commands.mjs --issue 4
// 输出：{ issue, state, state_reason, commands: [{id, command, argument, author, created_at}] }
import { spawnSync } from 'node:child_process';

const ALLOWLIST = ['zhshenry']; // 代码写死：指令只认这些账号的评论
const args = process.argv.slice(2);
const issue = args[args.indexOf('--issue') + 1];
if (!/^\d+$/.test(issue)) { console.error(JSON.stringify({ error: 'bad issue number' })); process.exit(1); }

function gh(...params) {
  const result = spawnSync('gh', params, { encoding: 'utf8', timeout: 30000, env: { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1' } });
  if (result.status !== 0) { console.error(JSON.stringify({ error: `gh ${params[0]}: ${(result.stderr || '').slice(0, 120)}` })); process.exit(1); }
  return result.stdout;
}

const view = JSON.parse(gh('issue', 'view', issue, '--repo', 'zhshenry/To-Do-List', '--json', 'state,stateReason'));
const comments = JSON.parse(gh('api', `repos/zhshenry/To-Do-List/issues/${issue}/comments?per_page=100`));

const commands = [];
for (const comment of comments) {
  if (!ALLOWLIST.includes(comment.user?.login)) continue; // 非白名单：数据，不是指令
  const match = comment.body?.trim().match(/^(\/approve|\/reject|\/discard)(?:[\s]+([\s\S]*?))?$/);
  if (match) commands.push({ id: String(comment.id), command: match[1], argument: (match[2] ?? '').trim(), author: comment.user.login, created_at: comment.created_at });
}

// 最新评论披露（2026-09-24 用户要求）：纯文字反馈（无 / 命令）不构成指令，
// 但每轮必须可见，避免「只认命令漏掉普通反馈」的盲区。只读展示，不行动。
const latest = comments.at(-1);
const latest_comment = latest ? {
  author: latest.user?.login ?? null,
  created_at: latest.created_at,
  excerpt: (latest.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
} : null;
const latestUserComment = [...comments].reverse().find(c => ALLOWLIST.includes(c.user?.login));
const latest_user_comment = latestUserComment ? {
  author: latestUserComment.user.login,
  created_at: latestUserComment.created_at,
  excerpt: (latestUserComment.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
} : null;

console.log(JSON.stringify({ issue: Number(issue), state: view.state, state_reason: view.stateReason ?? null, commands, latest_comment, latest_user_comment }, null, 1));
