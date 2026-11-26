import { useMemo, useState } from 'react';
import {
  Sparkles,
  FileText,
  FileCode2,
  Plus,
  Trash2,
  Download,
  AlertCircle,
  Loader2,
  History,
  RotateCcw,
  Check,
} from 'lucide-react';
import type {
  AgentSkill,
  ModelOption,
  ReasoningProfile,
  SkillAuxFile,
  SkillFileKind,
  SkillRevision,
  SkillSpec,
  SkillTier,
} from '../types/skill';
import { computeProgressiveDisclosure } from '../utils/skillLinter';
import { exportSingleSkillZip } from '../utils/exportZip';
import { DiffViewer } from './DiffViewer';
import { ModelSelector } from './ModelSelector';

interface AuthorCompileViewProps {
  skill: AgentSkill;
  models: ModelOption[];
  onUpdateSkill: (updated: AgentSkill, immediate?: boolean) => void;
  onNavigateTab: (tab: 'linter' | 'eval') => void;
}

interface PendingCompile {
  name: string;
  title: string;
  description: string;
  skillMd: string;
  auxFiles: SkillAuxFile[];
  evalCases: AgentSkill['evalCases'];
  profile: ReasoningProfile;
}

export function AuthorCompileView({
  skill,
  models,
  onUpdateSkill,
  onNavigateTab,
}: AuthorCompileViewProps) {
  const [mode, setMode] = useState<'spec' | 'files' | 'revisions'>('spec');
  const [profile, setProfile] = useState<ReasoningProfile>('fast');
  const [selectedFileKey, setSelectedFileKey] = useState<'SKILL.md' | string>(
    'SKILL.md'
  );
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [pendingCompile, setPendingCompile] = useState<PendingCompile | null>(
    null
  );

  const [newFilePath, setNewFilePath] = useState('');
  const [newFileKind, setNewFileKind] = useState<SkillFileKind>('reference');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(
    null
  );

  const pd = useMemo(() => computeProgressiveDisclosure(skill), [skill]);

  const updateSpecField = (key: keyof SkillSpec, value: string) => {
    onUpdateSkill({
      ...skill,
      updatedAt: new Date().toISOString().slice(0, 10),
      spec: {
        ...skill.spec,
        [key]: value,
      },
    });
  };

  const handleCompileSpec = async () => {
    setCompiling(true);
    setCompileError(null);
    const isRecompile = skill.skillMd.trim().length > 40;
    try {
      const resp = await fetch('/api/skills/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: skill.id,
          name: skill.name,
          title: skill.title,
          tier: skill.tier,
          domain: skill.domain,
          owner: skill.owner,
          spec: skill.spec,
          profile,
          isRecompile,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '编译失败');
      }

      const compiledAux: SkillAuxFile[] = Array.isArray(data.auxFiles)
        ? data.auxFiles.map(
            (f: { path: string; kind: string; content: string }, idx: number) => ({
              id: `aux-${Date.now()}-${idx}`,
              path: f.path,
              kind:
                f.kind === 'script'
                  ? 'script'
                  : f.kind === 'asset'
                    ? 'asset'
                    : 'reference',
              content: f.content,
            })
          )
        : skill.auxFiles;

      const compiledEvals = Array.isArray(data.evalCases)
        ? data.evalCases.map(
            (
              c: {
                prompt: string;
                expectedBehavior: string;
                shouldTrigger: boolean;
                category: string;
              },
              idx: number
            ) => ({
              id: `ev-${Date.now()}-${idx}`,
              prompt: c.prompt,
              expectedBehavior: c.expectedBehavior,
              shouldTrigger: Boolean(c.shouldTrigger),
              category:
                c.category === 'negative'
                  ? ('negative' as const)
                  : ('positive' as const),
              lastResult: 'untested' as const,
            })
          )
        : skill.evalCases;

      const candidate: PendingCompile = {
        name: data.name || skill.name,
        title: data.title || skill.title,
        description: data.description || skill.description,
        skillMd: data.skillMd || skill.skillMd,
        auxFiles: compiledAux,
        evalCases: compiledEvals,
        profile,
      };

      // If existing SKILL.md has meaningful content, require Diff confirmation before overwriting
      if (isRecompile && candidate.skillMd !== skill.skillMd) {
        setPendingCompile(candidate);
      } else {
        applyCompiledResult(candidate, false);
      }
    } catch (err) {
      setCompileError(err instanceof Error ? err.message : '编译请求失败');
    } finally {
      setCompiling(false);
    }
  };

  const applyCompiledResult = (
    compiled: PendingCompile,
    isRecompile: boolean
  ) => {
    const rev: SkillRevision = {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
      source: isRecompile ? 'recompile' : 'compile',
      note: `${isRecompile ? '重编译' : '初次编译'} (${compiled.profile})`,
      skillMd: skill.skillMd,
    };

    onUpdateSkill(
      {
        ...skill,
        name: compiled.name,
        title: compiled.title,
        description: compiled.description,
        skillMd: compiled.skillMd,
        auxFiles: compiled.auxFiles,
        evalCases: compiled.evalCases,
        revisions: [rev, ...skill.revisions].slice(0, 20),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      true
    );
    setPendingCompile(null);
    setSelectedFileKey('SKILL.md');
  };

  const handleRollback = (rev: SkillRevision) => {
    const snapshot: SkillRevision = {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
      source: 'rollback',
      note: `回滚前备份（恢复至 ${rev.timestamp}）`,
      skillMd: skill.skillMd,
    };

    onUpdateSkill(
      {
        ...skill,
        skillMd: rev.skillMd,
        revisions: [snapshot, ...skill.revisions].slice(0, 20),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      true
    );
    setMode('spec');
  };

  const handleAddAuxFile = () => {
    const clean = newFilePath.trim().replace(/^\/+/, '');
    if (!clean) return;
    const defaultPrefix =
      newFileKind === 'script'
        ? 'scripts/'
        : newFileKind === 'asset'
          ? 'assets/'
          : 'references/';
    const finalPath = clean.includes('/') ? clean : `${defaultPrefix}${clean}`;
    const newFile: SkillAuxFile = {
      id: `aux-${Date.now()}`,
      path: finalPath,
      kind: newFileKind,
      content:
        newFileKind === 'script'
          ? '#!/usr/bin/env bash\nset -euo pipefail\n\n# 在此编写按需执行的辅助脚本\n'
          : `# ${finalPath}\n\n在此存放需要从 SKILL.md 剥离出来的详细参考手册或规范。\n`,
    };
    onUpdateSkill(
      {
        ...skill,
        auxFiles: [...skill.auxFiles, newFile],
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      true
    );
    setSelectedFileKey(newFile.id);
    setMode('files');
    setNewFilePath('');
    setShowNewFileInput(false);
  };

  const handleDeleteAuxFile = (id: string) => {
    onUpdateSkill(
      {
        ...skill,
        auxFiles: skill.auxFiles.filter((f) => f.id !== id),
      },
      true
    );
    if (selectedFileKey === id) {
      setSelectedFileKey('SKILL.md');
    }
  };

  const activeAuxFile = skill.auxFiles.find((f) => f.id === selectedFileKey);
  const selectedRevision =
    skill.revisions.find((r) => r.id === selectedRevisionId) ||
    skill.revisions[0] ||
    null;

  return (
    <div className="space-y-6">
      {/* Progressive Disclosure Meter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="grid grid-cols-3 gap-6 flex-1">
            <div>
              <div className="text-xs text-slate-500">Layer 1 · 常驻元数据</div>
              <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-slate-900">
                ~{pd.frontmatterTokensEst} tokens
              </div>
              <div className="text-xs text-slate-400">建议 ~100 tokens</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Layer 2 · SKILL.md 正文</div>
              <div
                className={`mt-1 text-sm font-semibold font-mono tabular-nums ${
                  pd.bodyLines > 500
                    ? 'text-red-600'
                    : pd.bodyLines > 380
                      ? 'text-amber-600'
                      : 'text-slate-900'
                }`}
              >
                {pd.bodyLines} / 500 行
              </div>
              <div className="mt-1 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    pd.bodyLines > 500
                      ? 'bg-red-600'
                      : pd.bodyLines > 380
                        ? 'bg-amber-500'
                        : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, (pd.bodyLines / 500) * 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Layer 3 · 按需加载资源</div>
              <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-slate-900">
                {pd.auxFilesCount} 个文件 · {(pd.auxTotalBytes / 1024).toFixed(1)} KB
              </div>
              <div className="text-xs text-slate-400">触发前不占用上下文</div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateTab('linter')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              前往 Linter 体检
            </button>
            <button
              type="button"
              onClick={() => exportSingleSkillZip(skill)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              导出 Skill (.zip)
            </button>
          </div>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('spec')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'spec'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Spec 编译 / 重编译
          </button>
          <button
            type="button"
            onClick={() => setMode('files')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'files'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            目录与多文件源码
          </button>
          <button
            type="button"
            onClick={() => setMode('revisions')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'revisions'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            修订历史 ({skill.revisions.length})
          </button>
        </div>

        <div className="text-xs text-slate-500">
          黄金评测用例：<span className="font-mono font-medium text-slate-800 tabular-nums">{skill.evalCases.length}</span> 条
          <button
            type="button"
            onClick={() => onNavigateTab('eval')}
            className="ml-2 text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
          >
            去运行批量回归
          </button>
        </div>
      </div>

      {compileError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{compileError}</span>
        </div>
      )}

      {/* Pending Recompile Diff Confirmation */}
      {pendingCompile && (
        <div className="bg-white border border-blue-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                重编译 Diff 预览（Profile: {pendingCompile.profile}）
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                请确认行级差异，确认应用后会自动保留上一版本快照至修订历史。
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setPendingCompile(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                放弃改动
              </button>
              <button
                type="button"
                onClick={() => applyCompiledResult(pendingCompile, true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                应用新编译结果
              </button>
            </div>
          </div>
          <DiffViewer
            before={skill.skillMd}
            after={pendingCompile.skillMd}
            title="编译前后 SKILL.md 差异对比"
          />
        </div>
      )}

      {mode === 'spec' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Structured Spec Form */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  结构化 Skill Spec 定义
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  切换推理档位后可基于同一 Spec 重新编译并对比 Diff
                </p>
              </div>
              <div className="flex items-start gap-2 shrink-0">
                <ModelSelector
                  models={models}
                  value={profile}
                  onChange={setProfile}
                  ariaLabel="选择编译模型"
                />
                <button
                  type="button"
                  onClick={handleCompileSpec}
                  disabled={compiling}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                >
                  {compiling ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      编译中...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      {skill.skillMd.trim().length > 40
                        ? '重编译 (Recompile)'
                        : '编译生成 SKILL.md'}
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Skill 英文标识 (kebab-case)
                </label>
                <input
                  type="text"
                  value={skill.name}
                  onChange={(e) =>
                    onUpdateSkill({ ...skill, name: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  中文显示标题
                </label>
                <input
                  type="text"
                  value={skill.title}
                  onChange={(e) =>
                    onUpdateSkill({ ...skill, title: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  市场层级
                </label>
                <select
                  value={skill.tier}
                  onChange={(e) =>
                    onUpdateSkill(
                      {
                        ...skill,
                        tier: e.target.value as SkillTier,
                      },
                      true
                    )
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                >
                  <option value="always-on">Always-on</option>
                  <option value="core">Core</option>
                  <option value="domain">Domain</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  所属域 (Domain)
                </label>
                <input
                  type="text"
                  value={skill.domain}
                  onChange={(e) =>
                    onUpdateSkill({ ...skill, domain: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Owner (CODEOWNERS)
                </label>
                <input
                  type="text"
                  value={skill.owner}
                  onChange={(e) =>
                    onUpdateSkill({ ...skill, owner: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                核心目标 (Goal)
              </label>
              <textarea
                rows={2}
                value={skill.spec.goal}
                onChange={(e) => updateSpecField('goal', e.target.value)}
                placeholder="例如：帮工程师自动分析微服务慢查询日志并生成索引优化建议"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  何时触发 (When to Trigger)
                </label>
                <textarea
                  rows={2}
                  value={skill.spec.whenToTrigger}
                  onChange={(e) =>
                    updateSpecField('whenToTrigger', e.target.value)
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  何时不要触发 (Negative Boundary)
                </label>
                <textarea
                  rows={2}
                  value={skill.spec.whenNotToTrigger}
                  onChange={(e) =>
                    updateSpecField('whenNotToTrigger', e.target.value)
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                标准化执行步骤 (Steps)
              </label>
              <textarea
                rows={4}
                value={skill.spec.steps}
                onChange={(e) => updateSpecField('steps', e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  依赖工具与参考资料 (Tooling)
                </label>
                <input
                  type="text"
                  value={skill.spec.tooling}
                  onChange={(e) => updateSpecField('tooling', e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  结果验证机制 (Verification)
                </label>
                <input
                  type="text"
                  value={skill.spec.verification}
                  onChange={(e) =>
                    updateSpecField('verification', e.target.value)
                  }
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          {/* Right: Live Compiled SKILL.md Preview & Edit */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-mono font-medium text-slate-800">
                  {skill.name}/SKILL.md
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                正文 {pd.bodyLines} 行
              </span>
            </div>
            <textarea
              rows={24}
              value={skill.skillMd}
              onChange={(e) =>
                onUpdateSkill({
                  ...skill,
                  skillMd: e.target.value,
                  updatedAt: new Date().toISOString().slice(0, 10),
                })
              }
              spellCheck={false}
              className="w-full p-4 text-xs font-mono leading-relaxed text-slate-800 bg-white focus:outline-none resize-y"
            />
          </div>
        </div>
      ) : mode === 'files' ? (
        /* Multi-file Directory Editor */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700">
                Skill 目录结构 ({skill.name}/)
              </h3>
              <button
                type="button"
                onClick={() => setShowNewFileInput((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                添加附属文件
              </button>
            </div>

            {showNewFileInput && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                <select
                  value={newFileKind}
                  onChange={(e) =>
                    setNewFileKind(e.target.value as SkillFileKind)
                  }
                  className="w-full px-2 py-1 text-xs bg-white border border-slate-200 rounded"
                >
                  <option value="reference">references/ (参考文档)</option>
                  <option value="script">scripts/ (可执行脚本)</option>
                  <option value="asset">assets/ (模板资源)</option>
                </select>
                <input
                  type="text"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="文件名，如 error_codes.md"
                  className="w-full px-2.5 py-1 text-xs font-mono bg-white border border-slate-200 rounded"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewFileInput(false)}
                    className="px-2 py-1 text-xs text-slate-600 cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleAddAuxFile}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded cursor-pointer"
                  >
                    创建
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setSelectedFileKey('SKILL.md')}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-mono rounded-md transition-colors cursor-pointer ${
                  selectedFileKey === 'SKILL.md'
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  <FileText className="w-3.5 h-3.5 shrink-0" />
                  SKILL.md
                </span>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {pd.bodyLines}L
                </span>
              </button>

              {skill.auxFiles.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                    selectedFileKey === file.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedFileKey(file.id)}
                    className="flex items-center gap-2 text-xs font-mono truncate flex-1 text-left cursor-pointer"
                  >
                    <FileCode2 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{file.path}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteAuxFile(file.id)}
                    className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    title="移除文件"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <span className="text-xs font-mono font-medium text-slate-800">
                {selectedFileKey === 'SKILL.md'
                  ? `${skill.name}/SKILL.md`
                  : `${skill.name}/${activeAuxFile?.path ?? ''}`}
              </span>
              <span className="text-xs text-slate-500">
                {selectedFileKey === 'SKILL.md'
                  ? 'Layer 2 核心指令（限 500 行内）'
                  : 'Layer 3 按需加载资源'}
              </span>
            </div>

            {selectedFileKey === 'SKILL.md' ? (
              <textarea
                rows={22}
                value={skill.skillMd}
                onChange={(e) =>
                  onUpdateSkill({
                    ...skill,
                    skillMd: e.target.value,
                    updatedAt: new Date().toISOString().slice(0, 10),
                  })
                }
                spellCheck={false}
                className="w-full p-4 text-xs font-mono leading-relaxed text-slate-800 focus:outline-none"
              />
            ) : activeAuxFile ? (
              <textarea
                rows={22}
                value={activeAuxFile.content}
                onChange={(e) =>
                  onUpdateSkill({
                    ...skill,
                    auxFiles: skill.auxFiles.map((f) =>
                      f.id === activeAuxFile.id
                        ? { ...f, content: e.target.value }
                        : f
                    ),
                    updatedAt: new Date().toISOString().slice(0, 10),
                  })
                }
                spellCheck={false}
                className="w-full p-4 text-xs font-mono leading-relaxed text-slate-800 focus:outline-none"
              />
            ) : null}
          </div>
        </div>
      ) : (
        /* Revision History & Rollback */
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          {skill.revisions.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              当前暂无修订快照。每当执行重编译、AI 语义优化或 Papercut 迭代并应用修改时，系统会自动保存历史快照以供 Diff 对比和一键回滚。
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-4 divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden">
                {skill.revisions.map((rev) => {
                  const active = selectedRevision?.id === rev.id;
                  return (
                    <button
                      key={rev.id}
                      type="button"
                      onClick={() => setSelectedRevisionId(rev.id)}
                      className={`w-full p-3 text-left transition-colors cursor-pointer ${
                        active ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-medium text-slate-900">
                        {rev.note}
                      </div>
                      <div className="mt-1 text-[11px] font-mono text-slate-500 tabular-nums">
                        {rev.timestamp} · {rev.source}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-8 space-y-3">
                {selectedRevision && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-600">
                        对比历史快照 ({selectedRevision.timestamp}) 与当前版本
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRollback(selectedRevision)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        回滚到此快照
                      </button>
                    </div>
                    <DiffViewer
                      before={selectedRevision.skillMd}
                      after={skill.skillMd}
                      title="历史快照 → 当前生效版本"
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
