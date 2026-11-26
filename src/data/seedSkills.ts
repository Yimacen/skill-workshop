import type { AgentSkill } from '../types/skill';

export const SEED_SKILLS: AgentSkill[] = [
  {
    id: 'skill-git-commit-convention',
    name: 'git-commit-convention',
    title: 'Git 提交规范与 PR 自检',
    description:
      'Enforces Conventional Commits, atomic diff sizing, and pre-push verification. Use when the user asks to commit changes, write a commit message, or prepare a pull request.',
    tier: 'always-on',
    domain: 'universal',
    owner: '@ai-platform-team',
    version: '2.4.0',
    updatedAt: '2026-11-20',
    spec: {
      goal: '确保所有本地或云端 Agent 提交的代码变更符合 Conventional Commits 规范，且在提交前完成差异核对与基础校验。',
      whenToTrigger: '用户要求 git commit、生成提交信息、拆分过大变更或创建 Pull Request 时触发。',
      whenNotToTrigger: '仅进行只读代码检索、日志分析或未修改任何工作区文件时不触发。',
      steps:
        '1. 运行 git status 与 git diff --staged 检查实际变更范围。\n2. 识别是否有敏感信息、调试日志或无关文件混入暂存区。\n3. 按 <type>(<scope>): <subject> 格式生成清晰中文或英文提交说明。\n4. 提交前确认相关 lint/test 命令执行通过。',
      tooling: 'git status, git diff, npm run lint',
      verification: '确认 git log -1 输出符合规范且工作区无遗留冲突或临时文件。',
      targetAgent: 'Claude Code / Codex / Cursor',
    },
    skillMd: `---
name: "git-commit-convention"
description: >
  Enforces Conventional Commits, atomic diff sizing, and pre-push verification.
  Use when the user asks to commit changes, write a commit message, or prepare
  a pull request. Do not use for read-only codebase Q&A.
---

# Git 提交规范与 PR 准备

执行代码提交或创建 PR 前，必须严格按以下顺序完成核对，确保每次提交具备原子性与可追溯性。

## 执行步骤

1. **检查暂存区与变更范围**
   运行 \`git status\` 与 \`git diff --staged\`，核对即将提交的文件列表。若单次变更跨度过大（超过 15 个文件且属于不同功能），先提示用户拆分为多次提交。

2. **清理调试残留与敏感文件**
   检查 diff 中是否意外包含 \`.env\`、硬编码密钥、临时 \`console.log\` 或未引用的测试产物。发现异常立即移除或提示处理。

3. **编写规范的 Commit Message**
   严格遵循 Conventional Commits 格式：
   - \`feat(scope): 简述新增功能\`
   - \`fix(scope): 简述修复的问题与根因\`
   - \`refactor(scope): 重构模块说明\`
   - \`docs / chore / test\`: 文档、构建或测试调整

4. **提交前验证 (Verification)**
   在执行 \`git commit\` 前，确认项目对应的轻量校验（如 \`lint\` 或受影响模块的单测）已通过；提交后运行 \`git status\` 确认工作区状态干净。
`,
    auxFiles: [],
    evalCases: [
      {
        id: 'ev-gc-1',
        prompt: '帮我把刚才修改的登录表单校验逻辑提交一下，写个规范的 commit message。',
        expectedBehavior: '先检查 git diff，排除敏感或无关文件，按 feat/fix(auth): ... 格式生成提交信息并提醒校验 lint。',
        shouldTrigger: true,
        category: 'positive',
        lastResult: 'pass',
      },
      {
        id: 'ev-gc-2',
        prompt: '帮我解释一下 src/server.ts 里认证中间件是怎么工作的？',
        expectedBehavior: '纯代码阅读理解场景，不应该触发 git-commit-convention。',
        shouldTrigger: false,
        category: 'negative',
        lastResult: 'pass',
      },
    ],
    evalHistory: [],
    suiteHistory: [],
    revisions: [],
    telemetry: {
      monthlyInvocations: 184200,
      weeklyActiveUsers: 4120,
      retentionRate: 91.4,
      coUseTopSkill: 'pr-security-review',
      avgCostUsd: 0.008,
      p50LatencyMs: 920,
      errorRate: 0.4,
      ablationLiftPct: 38.5,
    },
  },
  {
    id: 'skill-ci-failure-triage',
    name: 'ci-failure-triage',
    title: 'CI 失败日志分诊与自愈',
    description:
      'Diagnoses failing CI pipelines, distinguishes infrastructure flakes from deterministic code regressions, and proposes minimal fixes. Use when CI checks fail, a build breaks, or test logs need root-cause triage.',
    tier: 'core',
    domain: 'platform-ci',
    owner: '@ci-infra-team',
    version: '3.1.2',
    updatedAt: '2026-11-22',
    spec: {
      goal: '快速定位 CI 流水线失败的真正根因，区分环境抖动（Flake）与代码回归，并给出最小化修复方案。',
      whenToTrigger: 'CI 构建失败、单测报错、流水线超时或需要分析构建日志堆栈时触发。',
      whenNotToTrigger: '编写全新业务需求或做纯架构讨论时不触发。',
      steps:
        '1. 使用 scripts/parse_ci_log.sh 提取失败阶段与首个根因报错堆栈。\n2. 对照 references/ci_error_taxonomy.md 判断属于依赖拉取失败、环境 Flake 还是代码确定性回归。\n3. 若为代码回归，在本地复现对应单测并制定最小修改补丁。\n4. 运行受影响测试集验证通过后再输出根因报告。',
      tooling: 'scripts/parse_ci_log.sh, references/ci_error_taxonomy.md',
      verification: '必须在本地或沙箱中复跑失败用例确认通过，才能判定修复完成。',
      targetAgent: 'Claude Code / Cloud Balloon Agent',
    },
    skillMd: `---
name: "ci-failure-triage"
description: >
  Diagnoses failing CI pipelines, distinguishes infrastructure flakes from
  deterministic code regressions, and proposes minimal fixes. Use when CI
  checks fail, a build breaks, or test logs need root-cause triage.
---

# CI 失败日志分诊与自愈工作流

面向本地开发与云端自愈 Agent 的标准化 CI 排障流程。严禁在未定位根因前盲目重跑流水线。

## 执行步骤

1. **提取首个根因错误（禁止全量读取兆级日志）**
   优先调用辅助脚本 [scripts/parse_ci_log.sh](scripts/parse_ci_log.sh) 抽取失败 Job 的退出码与首个 \`ERROR / FAIL\` 上下文窗口，避免无意义上下文溢出。

2. **对照错误分类表定性问题**
   按需查阅 [references/ci_error_taxonomy.md](references/ci_error_taxonomy.md)，将故障归类为以下三者之一：
   - **基础设施抖动（Infra Flake）**：镜像拉取超时、Runner OOM、临时网络 502。
   - **依赖/锁文件漂移**：\`package-lock.json\` 或依赖版本冲突。
   - **代码确定性回归**：类型检查、Lint 或单元测试断言失败。

3. **执行最小化修复**
   - 若属于 Infra Flake：给出明确证据并建议单 Job 重试，同时记录 Flake 标记。
   - 若属于代码回归：定位到最小修改范围，禁止顺手重构无关业务模块。

4. **复跑验证 (Verification)**
   修复后必须执行对应失败用例的最小复现命令（例如 \`npx vitest run <file>\` 或 \`npm run lint\`），确认退出码为 \`0\` 后再输出总结报告：包含**根因分类、修改文件清单、复跑验证结果**。
`,
    auxFiles: [
      {
        id: 'aux-ci-ref',
        path: 'references/ci_error_taxonomy.md',
        kind: 'reference',
        content: `# CI 常见故障分类参考手册

## 1. Infra Flake 特征
- \`ETIMEDOUT\` / \`ECONNRESET\` 访问内部制品库超过 3 次重试
- Exit code \`137\`（容器触发 OOM Killer，需核对内存配额或并发 worker 数）
- Kubernetes Pod 调度抢占提示 \`Evicted\`

## 2. 依赖漂移特征
- \`ERR_PNPM_OUTDATED_LOCKFILE\` 或 \`npm ci\` 校验失败
- 提示未声明的 peerDependency

## 3. 代码回归特征
- TypeScript \`TS23xx\` 编译期类型不匹配
- 断言失败 \`AssertionError: expected ... to equal ...\`
`,
      },
      {
        id: 'aux-ci-script',
        path: 'scripts/parse_ci_log.sh',
        kind: 'script',
        content: `#!/usr/bin/env bash
set -euo pipefail
LOG_FILE="\${1:-ci.log}"
if [ ! -f "$LOG_FILE" ]; then
  echo "Log file not found: $LOG_FILE" >&2
  exit 1
fi
grep -nE -C 5 "ERROR|FAIL|ERR!|Exception|exit code [1-9]" "$LOG_FILE" | head -n 120
`,
      },
    ],
    evalCases: [
      {
        id: 'ev-ci-1',
        prompt: 'CI 在跑 integration-test 时报了 ECONNRESET 连接制品库超时，帮我看下是不是我代码改坏了？',
        expectedBehavior: '识别为 Infra Flake（网络/制品库超时），建议检查或重试而非盲目修改业务代码。',
        shouldTrigger: true,
        category: 'positive',
        lastResult: 'pass',
      },
      {
        id: 'ev-ci-2',
        prompt: 'TypeScript 编译报 TS2345，说 UserProfile 组件少传了 onSave 属性，怎么修？',
        expectedBehavior: '归类为代码确定性回归，定位具体调用方补充或调整 props，并要求复跑 tsc --noEmit 验证。',
        shouldTrigger: true,
        category: 'positive',
        lastResult: 'pass',
      },
      {
        id: 'ev-ci-3',
        prompt: '帮我写一个全新的用户积分兑换页面组件。',
        expectedBehavior: '常规新功能开发，不应触发 ci-failure-triage。',
        shouldTrigger: false,
        category: 'negative',
        lastResult: 'pass',
      },
    ],
    evalHistory: [],
    suiteHistory: [],
    revisions: [],
    telemetry: {
      monthlyInvocations: 146800,
      weeklyActiveUsers: 2890,
      retentionRate: 86.2,
      coUseTopSkill: 'git-commit-convention',
      avgCostUsd: 0.019,
      p50LatencyMs: 1450,
      errorRate: 1.8,
      ablationLiftPct: 54.0,
    },
  },
  {
    id: 'skill-pr-security-review',
    name: 'pr-security-review',
    title: 'PR 安全边界与凭据审查',
    description:
      'Audits pull requests for hardcoded secrets, SQL/command injection, SSRF, and missing server-side authorization checks. Use when reviewing a PR, auditing backend routes, or checking security before merge.',
    tier: 'core',
    domain: 'security',
    owner: '@appsec-team',
    version: '1.9.0',
    updatedAt: '2026-11-18',
    spec: {
      goal: '在 PR 合并前拦截高危安全隐患（密钥泄露、注入、越权、SSRF、不安全 DOM 渲染）。',
      whenToTrigger: '用户要求做 PR Review、安全审计、检查后端接口权限或合入前安全扫描时触发。',
      whenNotToTrigger: '仅调整 CSS 样式或纯静态文案修改时不触发。',
      steps:
        '1. 获取变更文件清单，区分前端展示层与后端接口/数据访问层。\n2. 扫描硬编码凭据与环境变量前缀暴露（如 VITE_ 暴露私钥）。\n3. 检查所有入参校验、SQL 参数化、路径穿越边界与鉴权校验。\n4. 按严重等级输出可落地的修复补丁与复核清单。',
      tooling: 'git diff, references/owasp_checklist.md',
      verification: '确认每条高危发现均附带精确文件行号与最小修复代码。',
      targetAgent: 'Claude Code / PR Reviewer Bot',
    },
    skillMd: `---
name: "pr-security-review"
description: >
  Audits pull requests for hardcoded secrets, SQL/command injection, SSRF, and
  missing server-side authorization checks. Use when reviewing a PR, auditing
  backend routes, or checking security before merge.
---

# PR 安全边界与凭据审查

针对代码变更执行轻量、高信噪比的安全审计，避免误报低价值风格问题。

## 审查步骤

1. **识别信任边界变更**
   重点定位新增或修改的 \`/api/*\` 路由、数据库查询、文件系统读写、外部 URL 请求与认证逻辑。

2. **凭据与密钥隔离检查**
   确认私钥、DB 密码、第三方 OAuth Secret 仅存在于服务端 \`process.env\`，未写入前端包或硬编码进源码。

3. **核心漏洞清单核对**
   按需参考 [references/owasp_checklist.md](references/owasp_checklist.md)，重点排查：
   - 拼接 SQL 或带 \`shell: true\` 的命令执行
   - 缺少资源归属校验（IDOR / 越权读写）
   - 未校验路径边界的文件读取（\`path.resolve\` 未检查前缀分隔符）
   - 使用 \`dangerouslySetInnerHTML\` 渲染不可信内容

4. **输出审查结论与验证**
   仅报告真实可达的风险点（附文件路径、风险说明与修复代码片段）；若无高危项，明确声明“已通过核心边界核对”。
`,
    auxFiles: [
      {
        id: 'aux-sec-ref',
        path: 'references/owasp_checklist.md',
        kind: 'reference',
        content: `# 后端与全栈安全审查要点

1. 路径安全：resolved.startsWith(baseDir + path.sep)
2. SSRF 防护：禁止请求 127.0.0.1 / 169.254.169.254 / 内网网段
3. 认证检查：所有变更型 POST/PUT/DELETE 路由必须校验当前会话与资源归属
`,
      },
    ],
    evalCases: [
      {
        id: 'ev-sec-1',
        prompt: '帮我 Review 一下这个新增的 /api/export 接口，里面接收 filename 参数直接读取本地文件返回。',
        expectedBehavior: '立即识别出路径穿越风险，要求用 path.resolve + baseDir + path.sep 校验边界。',
        shouldTrigger: true,
        category: 'positive',
        lastResult: 'pass',
      },
    ],
    evalHistory: [],
    suiteHistory: [],
    revisions: [],
    telemetry: {
      monthlyInvocations: 98400,
      weeklyActiveUsers: 1950,
      retentionRate: 83.7,
      coUseTopSkill: 'git-commit-convention',
      avgCostUsd: 0.015,
      p50LatencyMs: 1280,
      errorRate: 0.9,
      ablationLiftPct: 47.2,
    },
  },
  {
    id: 'skill-microservice-rpc-migration',
    name: 'microservice-rpc-migration',
    title: '微服务 RPC 接口升级迁移',
    description:
      'Guides step-by-step migration of legacy Thrift RPC endpoints to versioned gRPC schemas with backward compatibility. Use when migrating platform RPC services.',
    tier: 'domain',
    domain: 'platform-rpc',
    owner: '@rpc-core-team',
    version: '1.2.0',
    updatedAt: '2026-11-12',
    spec: {
      goal: '指导业务团队将旧版 Thrift 接口平滑迁移至带版本控制的 gRPC 契约，保证双写期向后兼容。',
      whenToTrigger: '需要将旧版 Thrift IDL 迁移为 Protobuf / gRPC，或升级跨服务 RPC 客户端时触发。',
      whenNotToTrigger: '修改前端页面或本地单机脚本时不触发。',
      steps:
        '1. 导出旧版 IDL 契约并映射到 Protobuf v3 字段编号。\n2. 生成双栈兼容适配器，保持旧字段保留位。\n3. 补充契约回归测试并按灰度比例切流。',
      tooling: 'buf lint, protoc',
      verification: '运行契约兼容性检查与双端集成测试。',
      targetAgent: 'Claude Code / Cursor',
    },
    skillMd: `---
name: "microservice-rpc-migration"
description: >
  Guides step-by-step migration of legacy Thrift RPC endpoints to versioned
  gRPC schemas with backward compatibility.
---

# 微服务 RPC 接口平滑迁移指南

当需要将存量服务接口从旧版 Thrift 迁移到新架构 gRPC 时，遵循以下流程保证零停机兼容：

1. 盘点现有调用方流量分布，锁定废弃字段与必填字段。
2. 编写对应 \`.proto\` 文件，严禁复用已删除字段的 tag 编号。
3. 构建双协议适配层并开启契约对比日志。
4. 运行 \`buf breaking\` 验证无破坏性变更后，按 5% -> 25% -> 100% 切流。
`,
    auxFiles: [],
    evalCases: [
      {
        id: 'ev-rpc-1',
        prompt: '我们要把订单服务的 OrderQuery.thrift 迁成 gRPC proto，要注意哪些兼容性步骤？',
        expectedBehavior: '给出字段编号保留、双协议适配、buf breaking 检查与灰度切流步骤。',
        shouldTrigger: true,
        category: 'positive',
        lastResult: 'untested',
      },
    ],
    evalHistory: [],
    suiteHistory: [],
    revisions: [],
    telemetry: {
      monthlyInvocations: 12400,
      weeklyActiveUsers: 310,
      retentionRate: 74.5,
      coUseTopSkill: 'ci-failure-triage',
      avgCostUsd: 0.021,
      p50LatencyMs: 1620,
      errorRate: 3.2,
      ablationLiftPct: 41.0,
    },
  },
];
