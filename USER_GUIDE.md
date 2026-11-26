# Skill Workshop 新手操作指南

欢迎使用 **Skill Workshop**！这是一套借鉴 Uber 工程团队实践与 `agentskills.io` 开放标准打造的 **AI Agent Skill 创作、检查、评测与 Git 分发工作台**。

无论你是第一次接触 Agent Skill，还是准备在团队内推广标准化的工作流，都可以按以下 5 步快速上手。

---

## 一、 先懂 3 个核心概念（1 分钟看懂）

1. **什么是 Skill？**
   Skill 本质上是一个包含 `SKILL.md`（以及可选的 `references/`、`scripts/` 辅助文件）的文件夹，用来教 AI 编程助手（如 Claude Code、Cursor、Codex）按照团队标准执行特定任务，例如“规范写 Git Commit”“分析 CI 失败日志”“做 PR 安全审计”。
2. **什么是“三层渐进式披露（Progressive Disclosure）”？**
   为了不把几千行文档一次性塞进大模型上下文导致变慢、变贵、变笨，Skill 会分三层按需加载：
   * **Layer 1（常驻元数据）**：只加载 `SKILL.md` 顶部的 `name` 和 `description`（约 ~100 tokens），用来判断“这个任务要不要用这个 Skill”。
   * **Layer 2（触发加载正文）**：确认命中后，才加载 `SKILL.md` 正文（**建议严格控制在 500 行以内**）。
   * **Layer 3（按需读取附属资源）**：只有运行到某一步需要查参考手册或执行脚本时，才读取 `references/` 或 `scripts/` 里的文件。
3. **为什么要做消融实验（Ablation Test）？**
   大模型本身已经很聪明了，很多时候写了一堆 Prompt 反而让效果变差或浪费 Token。消融实验就是拿同一个问题，分别测一遍**“不挂 Skill 的裸模型”**和**“挂载 Skill 后的模型”**，用客观数据证明这个 Skill 真的有用。

---

## 二、 5 步快速上手全流程

### 第 1 步：配置大模型（可选 DeepSeek / Gemini / OpenAI 兼容模型）
系统默认已支持 **Gemini 4 Hydrogen**；如果你想用 **DeepSeek（`deepseek-chat` / `deepseek-reasoner`）** 或其他兼容模型，请在 **Settings > Secrets** 中添加服务端环境变量（无需也不应在页面中填写密钥）：
* **使用 DeepSeek**：添加 `DEEPSEEK_API_KEY`（可选 `DEEPSEEK_BASE_URL`，默认为 `https://api.deepseek.com`）。
* **使用通义千问 / 智谱 / Moonshot / vLLM 等 OpenAI 兼容接口**：添加 `OPENAI_COMPAT_API_KEY`、`OPENAI_COMPAT_BASE_URL` 和 `OPENAI_COMPAT_MODEL`。

### 第 2 步：在「Skill 市场与仓库」浏览或新建 Skill
1. 打开左侧 **Skill 市场与仓库**，可以看到系统内置的 4 个典型分层示例（`Always-on` 全局层、`Core` 核心层、`Domain` 业务域层）。
2. 点击任意一行即可切换当前正在调试的 Skill；点击右上角 **新建 Skill** 可以从零创建一条属于你的工作流。

### 第 3 步：在「Spec 编译与编辑」写出高质量 `SKILL.md`
初学者不需要一上来就手写格式严谨的 Markdown，推荐用左侧的 **Spec 编译器模式**：
1. 填写 **Skill 英文标识**（必须用小写字母和连字符，例如 `sql-slow-query-review`）和 **中文标题**。
2. 填写 **核心目标（Goal）**、**何时触发（When to Trigger）**、**何时不要触发（Negative Boundary）**、**核心步骤** 与 **验证方式**。
3. 在右上角选择你想使用的编译模型（例如 `Gemini 4 Hydrogen` 或 `DeepSeek Chat`），点击 **编译生成 SKILL.md**。
4. 编译器会自动生成符合 500 行规范的 `SKILL.md`，还会顺便帮你拆分长文档到 `references/`，并生成 **3 条黄金测试集（2 正例 + 1 负例）**！
5. 如果你对现有 Skill 修改了 Spec 或切换了模型，可以点击 **重编译（Recompile）**，系统会先弹出 **行级 Diff 对比** 让你确认差异，应用后自动把旧版本存进 **修订历史**，随时支持一键回滚。

> **初学者避坑提醒**：盯紧顶部的 **Layer 2 正文行数进度条**！如果超过 500 行，点击“目录与多文件源码”里的 **添加附属文件**，把长表格、错误码字典或脚本拆到 `references/` 或 `scripts/` 中，在 `SKILL.md` 里写一句 `[references/xxx.md](references/xxx.md)` 引用即可。

### 第 4 步：在「Skill Linter 体检」把关质量
切换到左侧 **Skill Linter 体检**，系统会自动实时跑完 8 项确定性检查：
* 是否有标准 YAML Frontmatter（`---` 包裹 `name` 和 `description`）
* 命名是否符合 `lowercase-kebab-case`
* 触发描述是否清楚、是否控制了常驻 Token 预算
* 正文是否超过 500 行、是否有超过 55 行的超长内联代码块
* 是否有清晰的编号步骤（1. 2. 3.）与末尾自检（Verification）
* 是否不小心把 API Key / 私钥写进了文件里

如果有红色报错或黄色警告，直接按提示修改，或者点击 **运行 AI 语义审计与自动优化**，查看 Diff 预览后一键应用优化。如果希望进一步降低上下文消耗，可点击 **AI 一键 Token 瘦身**，系统会在保留关键步骤和验证要求的前提下精简文字并把冗长内容拆入 `references/`。

### 第 5 步：在「Eval 消融实验室」验证效果、降本并闭环迭代
1. **跑一次全量回归评测（Batch Eval Suite）**：
   在 **Eval 消融实验室** 顶部选择模型（可切换对比 Gemini 或 DeepSeek），点击 **运行全量回归评测**。系统会：
   * 测试 Agent 在只看元数据摘要时，能不能在众多 Skill 里**准确选出（或不误选）当前 Skill**；
   * 自动跑完所有正向用例的 **裸模型 vs 挂载 Skill** 对比，给出综合通过率（如 `100%`）、平均延迟与 Token 增量。
2. **双模型“降本不降质”对比评测（Model Tiering）**：
   在同一页面可选择“基准高配模型（如 Balanced / DeepSeek Reasoner）”与“候选低成本模型（如 Fast / DeepSeek Chat）”，并发跑完同一套黄金测试集，直观看到通过率对比与预估成本降幅，安全决定是否降级到更便宜的模型。
3. **单条深度对比与 Papercut 迭代**：
   如果想细看某一个问题的前后输出差别，可以在下方运行 **单条消融对比**。如果发现模型漏掉了某一步或回答不够理想，在最下方 **Papercut 缺陷回流** 框里写下问题，点 **基于反馈生成优化版 SKILL.md**，预览 Diff 后确认应用，再重新跑一次回归测试验证通过率提升！
4. **查看「可观测与 Git 治理」中的月度总成本看板**：
   系统会基于 `月调用量 × 单次成本` 排序全库高消耗 Skill，并自动标注需要瘦身或测试切换低价模型的条目。

---

## 三、 如何把做好的 Skill 真正用到本地工具或团队 Git 仓库？

### 方式 1：个人本地快速使用
1. 在 **Spec 编译与编辑** 顶部点击 **导出 Skill (.zip)**，解压得到 `<skill-name>/` 文件夹。
2. 把这个文件夹放到你常用的 AI 工具目录下即可自动生效：
   * Claude Code：`~/.claude/skills/<skill-name>/`
   * 通用标准目录：`~/.agents/skills/<skill-name>/`
   * Cursor：`~/.cursor/skills/<skill-name>/`

### 方式 2：团队 Git Monorepo 标准化管理
1. 在 **Skill 市场与仓库** 或 **可观测与 Git 治理** 页面点击 **导出 Git 仓库包 (.zip)**。
2. 解压后里面已经为你准备好了完整的企业级目录结构：
   * `always-on/`、`core/`、`domains/`：三层治理目录
   * `CODEOWNERS`：自动按域分配 PR 审批人（全局/核心层由平台组审批，业务域由各业务团队自治）
   * `plugins.json`：插件包分组清单
   * `scripts/lint-skills.mjs` + `.github/workflows/skill-lint.yml`：与工作台完全同源的 CI 自动检查门禁
   * `install.sh`：团队成员拉取仓库后运行 `bash install.sh`，自动把全局与核心 Skill 软链接到本机的 Claude Code / Cursor / `.agents` 目录中。

---

## 四、 常见问题 (FAQ)

* **Q：为什么选择 DeepSeek 模型时提示“未配置 Secret”？**
  A：出于安全规范，所有密钥仅存储在服务端环境变量中。请在平台的 **Settings > Secrets** 面板中添加 `DEEPSEEK_API_KEY`，保存后刷新页面即可使用。
* **Q：Skill 正文一定要写成英文吗？**
  A：不需要。`SKILL.md` 的核心步骤和规则完全可以用中文编写；不过 `name` 字段必须是英文小写连字符（如 `ci-failure-triage`），`description` 建议保留简洁的中英文触发关键词，方便各种模型在 Layer 1 准确匹配。
* **Q：我的修改会丢失吗？**
  A：不会。你在工作台里的所有编辑都会自动防抖保存至服务端工作区（`.workshop-store/skills/`），同时每次编译或 AI 优化都会保留历史快照，支持随时回滚。
