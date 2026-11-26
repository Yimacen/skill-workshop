import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Download,
  FlaskConical,
  FolderGit2,
  Hammer,
  KeyRound,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import type { WorkshopTab } from '../types/skill';

interface GuideViewProps {
  onNavigateTab: (tab: WorkshopTab) => void;
  onCreateNewSkill: () => void;
}

export function GuideView({ onNavigateTab, onCreateNewSkill }: GuideViewProps) {
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Intro Banner */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
              <BookOpen className="w-3.5 h-3.5" />
              <span>初学者 5 分钟上手手册</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              从零构建、体检并验证你的第一个 AI Agent Skill
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Skill Workshop 将 Uber 的企业级 Skill 工程流（Build · Run · Measure · Eval · Improve）简化为 5 个清晰步骤，帮助你写出规范、省 Token 且可验证有效的 <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">SKILL.md</code>。
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCreateNewSkill}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              立即新建第一个 Skill
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 3 Core Concepts */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">
          一、先看懂 3 个核心概念（避免踩坑）
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs leading-relaxed">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
            <div className="font-semibold text-slate-900">
              1. 三层渐进式加载
            </div>
            <p className="text-slate-600">
              Agent 启动时只读 <strong>Layer 1</strong>（名称 + 简短描述，约 100 tokens）；任务匹配后才读 <strong>Layer 2</strong>（SKILL.md 正文）；需要查表或跑脚本时才读 <strong>Layer 3</strong>（references/ 与 scripts/）。
            </p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
            <div className="font-semibold text-slate-900">
              2. 为什么正文限制 500 行？
            </div>
            <p className="text-slate-600">
              500 行限制的是主文件 <code className="font-mono">SKILL.md</code> 正文，而不是整个文件夹。正文越精简，模型越不容易遗漏步骤。大段文档请拆进 <code className="font-mono">references/</code>。
            </p>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
            <div className="font-semibold text-slate-900">
              3. 为什么要做消融实验？
            </div>
            <p className="text-slate-600">
              通过对比“无 Skill 裸模型”与“挂载 Skill 后”的回答，用 LLM 裁判和回归通过率证明你的 Skill 确实提升了规范度，而不是冗余废话。
            </p>
          </div>
        </div>
      </div>

      {/* Step-by-Step Workflow */}
      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        <div className="p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            二、标准 5 步操作流程
          </h2>
        </div>

        {/* Step 1 */}
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <KeyRound className="w-4 h-4 text-slate-500" />
              <span>步骤 1：模型准备（默认 Gemini，可选 DeepSeek 等模型）</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              系统默认可直接调用 <strong>Gemini 4 Hydrogen</strong>。若希望切换为 DeepSeek，请在平台右上角 <strong>Settings &gt; Secrets</strong> 中配置服务端环境变量 <code className="font-mono bg-slate-100 px-1 rounded">DEEPSEEK_API_KEY</code>；如需接入其他 OpenAI 兼容接口（Qwen / GLM / vLLM 等），配置 <code className="font-mono bg-slate-100 px-1 rounded">OPENAI_COMPAT_API_KEY</code>、<code className="font-mono bg-slate-100 px-1 rounded">OPENAI_COMPAT_BASE_URL</code> 与 <code className="font-mono bg-slate-100 px-1 rounded">OPENAI_COMPAT_MODEL</code>。
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 shrink-0">
            Settings &gt; Secrets
          </span>
        </div>

        {/* Step 2 */}
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FolderGit2 className="w-4 h-4 text-slate-500" />
              <span>步骤 2：在市场中挑选模板或新建 Skill</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              在「Skill 市场与仓库」中可以看到内置的 4 个示例（如 <code className="font-mono">git-commit-convention</code>、<code className="font-mono">ci-failure-triage</code>）。点击表格任意一行即可选中它，或点击 <strong>新建 Skill</strong> 从空白工作流开始。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('marketplace')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            前往市场浏览
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Step 3 */}
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Hammer className="w-4 h-4 text-slate-500" />
              <span>步骤 3：填写 Spec 并编译生成 SKILL.md 与测试集</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              新手无需手写繁琐格式，只需填写“核心目标”“何时触发”“禁止触发边界”“关键步骤”与“验证方式”，选择目标模型后点击 <strong>编译生成 / 重编译</strong>，即可产出标准的 <code className="font-mono">SKILL.md</code>、按需拆分文件及 3 条黄金评测用例。切换“目录与多文件源码”可手动增删 <code className="font-mono">references/</code> 或 <code className="font-mono">scripts/</code> 文件；“修订历史”支持随时对比 Diff 一键回滚。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('author')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            进入 Spec 编译器
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Step 4 */}
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              <span>步骤 4：运行 Skill Linter 体检与 Token 瘦身压缩</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              确认 8 项确定性规则（YAML 元数据、kebab-case 命名、500 行红线、编号步骤、自检步骤、密钥扫描等）全部无红色 Error。可通过 <strong>AI 语义审计与自动优化</strong> 补全流程漏洞，或点击 <strong>AI 一键 Token 瘦身</strong> 在不丢失关键步骤的前提下压缩上下文体积，预览 Diff 后应用。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('linter')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            去做 Linter 体检
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Step 5 */}
        <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FlaskConical className="w-4 h-4 text-slate-500" />
              <span>步骤 5：全量回归评测、双模型降本对比与 Papercut 迭代</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              点击 <strong>运行全量回归评测</strong> 验证路由命中率与消融得分；还可以使用 <strong>运行双模型降本对比</strong> 并发测试“高配基准模型 vs 低成本模型（如 Fast / DeepSeek Chat）”的质量留存与成本降幅。最后在页面下方填写 Papercut 反馈并应用修复补丁。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('eval')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
          >
            打开 Eval 实验室
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Export & Local Usage */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            三、做好之后，怎么在本地 Claude Code / Cursor 中用起来？
          </h2>
          <button
            type="button"
            onClick={() => onNavigateTab('telemetry')}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            查看 Git 治理文件与导出包
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 border border-slate-200 rounded-md space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>个人单 Skill 使用</span>
            </div>
            <p className="text-slate-600">
              在编辑器顶部点击 <strong>导出 Skill (.zip)</strong>，解压后将文件夹复制到本机 Agent 技能目录即可自动识别：
            </p>
            <pre className="p-2.5 bg-slate-900 text-slate-100 rounded font-mono text-[11px] overflow-x-auto">
{`# Claude Code
~/.claude/skills/<skill-name>/SKILL.md

# 通用标准 / Codex / Cursor
~/.agents/skills/<skill-name>/SKILL.md`}
            </pre>
          </div>

          <div className="p-4 border border-slate-200 rounded-md space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Terminal className="w-3.5 h-3.5 text-slate-500" />
              <span>团队 Git Monorepo 分发</span>
            </div>
            <p className="text-slate-600">
              点击 <strong>导出 Git 仓库包 (.zip)</strong>，内含分层目录、<code className="font-mono">CODEOWNERS</code>、<code className="font-mono">plugins.json</code>、同源 CI 门禁与本地软链脚本：
            </p>
            <pre className="p-2.5 bg-slate-900 text-slate-100 rounded font-mono text-[11px] overflow-x-auto">
{`# 拉取团队技能仓库后一键软链到所有本机工具
git clone <your-skills-repo> ~/.company-skills
cd ~/.company-skills && bash install.sh`}
            </pre>
          </div>
        </div>

        <div className="pt-2 flex items-start gap-2 text-xs text-slate-600">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            提示：你在工作台中的所有修改都会自动防抖保存至服务端工作区，项目根目录下的 <code className="font-mono bg-slate-100 px-1 rounded">USER_GUIDE.md</code> 也同步保存了完整的中文图文说明文档。
          </span>
        </div>
      </div>
    </div>
  );
}
