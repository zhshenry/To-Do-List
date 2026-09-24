#!/usr/bin/env node
// SDD 流水线关卡引擎 v2 —— 确定性检查 + Jev 语义命题 → 决策枚举
// v2 变更（2026-09-21 严格制+哈希绑定版）：
//   · 决策绑定 spec_hash / base_sha / head_sha / policy_hash——合入前用 --verify 重验，状态变了结果作废
//   · accept 门证据由引擎自采（--worktree）：真实 diff / changed_files / diffstat，引擎自跑 npm test
//     ——agent 摘要（agent_summary）仅作辅助字段，Jev 的关键证据不经过 agent 加工
//   · 敏感文件 deny 按 git diff --name-only 代码判定；diff 超 max_diff_chars → 人工（不截断硬塞）
//   · 命题极性统一：概率越高越安全（无反向命题）
// 用法：
//   决策：node tooling/jev-gate.mjs --gate spec|accept --input <state.json> [--worktree <path>]
//   重验：node tooling/jev-gate.mjs --verify <decision.json> [--worktree <path>] [--input <state.json>]
// 输出：stdout JSON + 追加 docs/issues/jev-ledger.jsonl
// 铁律：无 key / 网络 / 非 2xx / 缺答案 / 概率越界 / 任何 git 异常 → 一律 HUMAN_REVIEW——绝不因故障放行。
import { readFileSync, appendFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const policyPath = path.join(here, 'jev-policy.json');
const policyRaw = readFileSync(policyPath, 'utf8');
const policy = JSON.parse(policyRaw);
const policyHash = createHash('sha256').update(policyRaw).digest('hex').slice(0, 16);
const sha256 = text => createHash('sha256').update(String(text)).digest('hex').slice(0, 16);

const args = process.argv.slice(2);
const argOf = name => args[args.indexOf(name) + 1];
const LEDGER = path.resolve(here, '../docs/issues/jev-ledger.jsonl');

function git(worktree, ...params) {
  const result = spawnSync('git', ['-C', worktree, ...params], { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(`git ${params[0]}: ${(result.stderr || '').slice(0, 120)}`);
  return result.stdout.trim();
}

// ── --verify 模式：重验既有决策的哈希绑定 ─────────────────
if (args.includes('--verify')) {
  const decision = JSON.parse(readFileSync(argOf('--verify'), 'utf8'));
  const worktree = args.includes('--worktree') ? argOf('--worktree') : null;
  const input = args.includes('--input') ? JSON.parse(readFileSync(argOf('--input'), 'utf8')) : null;
  const mismatches = [];
  const current = { policy_hash: policyHash };
  if (input?.spec !== undefined) current.spec_hash = sha256(input.spec);
  if (worktree) {
    try {
      current.base_sha = git(worktree, 'rev-parse', 'main');
      current.head_sha = git(worktree, 'rev-parse', 'HEAD');
    } catch (error) { console.log(JSON.stringify({ valid: false, mismatches: ['git_error'], error: String(error) })); process.exit(0); }
  }
  for (const key of ['spec_hash', 'base_sha', 'head_sha', 'policy_hash']) {
    if (decision[key] && current[key] && decision[key] !== current[key]) mismatches.push(key);
  }
  console.log(JSON.stringify({ valid: mismatches.length === 0, mismatches, recorded: decision.ts, decision: decision.decision }));
  process.exit(0);
}

// ── 决策模式 ─────────────────────────────────────────
const gate = argOf('--gate');
const worktree = args.includes('--worktree') ? argOf('--worktree') : null;
const input = JSON.parse(readFileSync(argOf('--input'), 'utf8'));
if (!['spec', 'accept'].includes(gate)) { console.error(JSON.stringify({ decision: 'HUMAN_REVIEW', reason: 'bad_gate' })); process.exit(1); }

function finish(decision, extra = {}) {
  const record = { ts: new Date().toISOString(), gate, issue: input.meta?.issue ?? null, decision, ...extra };
  appendFileSync(LEDGER, `${JSON.stringify(record)}\n`);
  console.log(JSON.stringify(record, null, 1));
  throw { __jev_finished: true }; // 截停后续守卫（v2 修复：延迟退出导致多守卫连续落账）
}

// ── 决策模式（全流程在 try 内：finish 以哨兵异常截停，尾部统一排空退出）──
try {
// ── 0) 身份类 deny 先行（UI 在 spec 门硬拒；accept 门的 UI 例外见快车道，采证据后判定）──
const det0 = input.deterministic ?? {};
if (gate === 'spec' && (det0.ui === true || input.meta?.ui === true)) finish('HUMAN_REVIEW', { reason: 'deny:ui', note: '涉及UI=是（档案声明）——spec 门硬政策：mockup-first 人工审批，不自动放行' });
if (!policy.deny.types_allowed.includes(input.meta?.type)) finish('HUMAN_REVIEW', { reason: 'deny:type', note: `类型「${input.meta?.type}」不在自动放行白名单（${policy.deny.types_allowed.join('/')}）` });
// ── 1) 引擎自采证据（accept 门必须给 --worktree）──────────
const machine = { changed_files: null, diffstat: null, diff: null, test_results: null, changelog_touched: null, base_sha: null, head_sha: null };
if (gate === 'accept') {
  if (!worktree) finish('HUMAN_REVIEW', { reason: 'no_worktree', note: 'accept 门必须提供 --worktree 以自采证据——不接受仅凭 agent 摘要验收' });
  try {
    machine.base_sha = git(worktree, 'rev-parse', 'main');
    machine.head_sha = git(worktree, 'rev-parse', 'HEAD');
    machine.changed_files = git(worktree, 'diff', '--name-only', 'main...HEAD').split('\n').filter(Boolean);
    machine.diffstat = git(worktree, 'diff', '--stat', 'main...HEAD');
    machine.diff = git(worktree, 'diff', 'main...HEAD');
    machine.changelog_touched = machine.changed_files.some(file => file === 'CHANGELOG.md');
  } catch (error) { finish('HUMAN_REVIEW', { reason: 'git_error', note: String(error).slice(0, 140) }); }
  if (machine.diff.length > policy.max_diff_chars) finish('HUMAN_REVIEW', { reason: 'evidence_too_large', note: `diff ${machine.diff.length} 字符超过上限 ${policy.max_diff_chars}——不截断硬塞，转人工` });
  // 引擎自跑测试（机器结果，不信任 agent 转述）
  machine.test_results = {};
  for (const command of policy.run_tests_in_engine) {
    const result = spawnSync(command, { cwd: worktree, shell: true, encoding: 'utf8', timeout: 300000 });
    machine.test_results[command] = result.status === 0 ? 'pass' : 'fail';
    if (result.status !== 0) finish('RETRY', { reason: `deterministic:engine_test:${command}`, note: `引擎自跑 ${command} 失败——直接回炉，不消耗 Jev` });
  }
}

// ── 2) 确定性硬规则 ────────────────────────────────────
const det = input.deterministic ?? {};
if (gate === 'accept') {
  for (const [key, label] of [['build', '构建'], ['smoke', '冒烟']]) {
    if (det[key] === 'fail') finish('RETRY', { reason: `deterministic:${key}`, note: `${label}未通过（agent 报告）——回炉` });
    if (det[key] !== 'pass') finish('HUMAN_REVIEW', { reason: `deterministic:${key}_unknown`, note: `${label}结果未知，人工核对` });
  }
  if (machine.changelog_touched === false) finish('RETRY', { reason: 'deterministic:changelog', note: 'CHANGELOG 未记录本变更（按实测 diff 判定）' });
  const sensitive = machine.changed_files.filter(file => policy.deny.sensitive_globs.some(glob => file === glob || file.startsWith(`${glob}/`)));
  if (sensitive.length) finish('HUMAN_REVIEW', { reason: 'deny:sensitive_files', note: `实测 diff 触碰敏感文件：${sensitive.join(', ')}——人工终审` });
}
if (gate === 'spec') {
  if (!input.meta?.body) finish('HUMAN_REVIEW', { reason: 'missing_issue_body', note: 'state.meta.body 缺失——命题 S1 依赖 issue 正文，按 fail-closed 转人工' });
  const specMentions = policy.deny.sensitive_globs.filter(glob => String(input.spec ?? '').includes(glob.split('/').pop()));
  if (specMentions.length) finish('HUMAN_REVIEW', { reason: 'deny:sensitive_files_declared', note: `spec 声明将触碰敏感文件：${specMentions.join(', ')}（最终以 accept 门实测为准）` });
}
// ── 2.5) 快车道资格判定（accept 门 UI 例外，v3 2026-09-23 用户批准）──
// 参数型优化满足全部机械条件时不 deny:ui，携引擎自核证据进 Jev；任一条件不满足 → 照旧人工。
let fastLane = null;
if (gate === 'accept' && (det.ui === true || input.meta?.ui === true)) {
  const fl = policy.fast_lane;
  const checks = {
    type: fl.types.includes(input.meta?.type),
    impact: input.meta?.impact === fl.impact,
    no_user_hold: !input.meta?.hold_human_accept,
    spec_numeric: String(input.spec ?? '').includes(fl.requires_spec_numeric_criteria),
    diff_files: machine.changed_files.length <= fl.max_changed_files,
    diff_insertions: machine.diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length <= fl.max_diff_insertions,
  };
  // 档案证据由引擎直读主仓 docs/issues/<archive>/（PNG 截图 + capture 断言脚本），不采信 agent 转述
  let archivePng = 0, archiveScripts = 0;
  if (input.meta?.archive) {
    try {
      const names = readdirSync(path.resolve(here, '../docs/issues', input.meta.archive));
      archivePng = names.filter(f => f.endsWith('.png')).length;
      archiveScripts = names.filter(f => /^capture.*\.mjs$/.test(f)).length;
    } catch { /* 目录不存在 → 计 0 */ }
  }
  checks.archive_evidence = fl.requires_archive_png_and_script ? (archivePng > 0 && archiveScripts > 0) : true;
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  if (failed.length) finish('HUMAN_REVIEW', { reason: 'deny:ui', note: `快车道条件不满足（${failed.join('、')}）——UI 仍人工验收` });
  fastLane = { numeric_criteria: true, archive_png: archivePng, archive_scripts: archiveScripts, diff_files: machine.changed_files.length, diff_insertions: machine.diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).length };
}
if (gate === 'spec' && (det.ui === true || input.meta?.ui === true)) finish('HUMAN_REVIEW', { reason: 'deny:ui', note: '涉及UI=是（档案声明）——spec 门硬政策：mockup-first 人工审批，不自动放行' });
if (!policy.deny.types_allowed.includes(input.meta?.type)) finish('HUMAN_REVIEW', { reason: 'deny:type', note: `类型「${input.meta?.type}」不在自动放行白名单（${policy.deny.types_allowed.join('/')}）` });

// ── 3) 调 Jev（语义命题；关键证据为机器自采物）────────────
const key = process.env.OPENROUTER_API_KEY;
if (!key) finish('HUMAN_REVIEW', { reason: 'no_key', note: 'OPENROUTER_API_KEY 未设置——fail-safe 人工' });

const props = policy.propositions.filter(p => p.gate === gate && (!p.types || p.types.includes(input.meta?.type)));
if (!props.length) finish('HUMAN_REVIEW', { reason: 'no_propositions', note: '该类型无适用命题' });
const questions = {};
for (const p of props) questions[p.id] = { type: 'noul', instructions: p.instructions };

const specHash = input.spec !== undefined ? sha256(input.spec) : null;
const state = {
  issue: input.meta,
  spec: input.spec ?? null,
  evidence: gate === 'accept'
    ? { diffstat: machine.diffstat, changed_files: machine.changed_files, diff: machine.diff, test_results: machine.test_results, fast_lane: fastLane, agent_summary: input.evidence?.summary ?? null }
    : null,
};

const t0 = Date.now();
let res, json;
try {
  res = await fetch('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: policy.model, state, questions }),
  });
  json = await res.json();
} catch (error) { finish('HUMAN_REVIEW', { reason: 'network', note: String(error).slice(0, 140) }); }
if (!res.ok) finish('HUMAN_REVIEW', { reason: `http_${res.status}`, note: JSON.stringify(json).slice(0, 180) });

// ── 4) 校验 + 路由（极性统一：概率越高越安全）────────────
const th = policy.thresholds[gate];
const probabilities = {};
const failedIds = [];
const reviewIds = [];
const actions = [];
for (const p of props) {
  const answer = json.answers?.[p.id];
  if (!answer || typeof answer.noul !== 'number' || answer.noul < 0 || answer.noul > 1) {
    finish('HUMAN_REVIEW', { reason: `bad_answer:${p.id}`, probabilities, note: '答案缺失或概率越界——按错误处理' });
  }
  probabilities[p.id] = Number(answer.noul.toFixed(3));
  if (answer.noul <= th.retry) { actions.push(p.on_bad); failedIds.push(p.id); }
  else if (answer.noul < th.auto) { actions.push('review'); reviewIds.push(p.id); }
}
const decision = actions.includes('human') ? 'HUMAN_REVIEW'
  : actions.includes('revise') ? 'REVISE'
  : actions.includes('retry') ? 'RETRY'
  : actions.includes('review') ? 'HUMAN_REVIEW'
  : gate === 'spec' ? 'AUTO_APPROVE' : 'AUTO_ACCEPT';
finish(decision, {
  failed_predicates: failedIds,
  review_predicates: reviewIds,
  probabilities,
  latency_ms: Date.now() - t0,
  cost: json.usage?.cost ?? null,
  spec_hash: specHash,
  base_sha: machine.base_sha,
  head_sha: machine.head_sha,
  policy_hash: policyHash,
  question_version: policy.question_version,
});
} catch (error) {
  if (error?.__jev_finished) {
    setTimeout(() => process.exit(0), 120); // stdout 刷净后排空退出，避免 Windows 退出码毛刺
  } else {
    console.error(error);
    process.exit(1);
  }
}
