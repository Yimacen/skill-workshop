import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  Loader2,
  ArrowRight,
  Minimize2,
} from 'lucide-react';
import type {
  AgentSkill,
  ModelOption,
  ReasoningProfile,
  SkillAuxFile,
  SkillFileKind,
  SkillRevision,
} from '../types/skill';
import {
  computeProgressiveDisclosure,
  runSkillLinter,
} from '../utils/skillLinter';
import { DiffViewer } from './DiffViewer';
import { ModelSelector } from './ModelSelector';

interface LinterViewProps {
  skill: AgentSkill;
  models: ModelOption[];
  onUpdateSkill: (updated: AgentSkill, immediate?: boolean) => void;
}

interface AiFinding {
  severity: string;
  title: string;
  detail: string;
}

interface CompressReport {
  summary: string;
  tacticsUsed: string[];
  compressedSkillMd: string;
  suggestedAuxFiles: { path: string; kind: string; content: string }[];
  beforeTokens: number;
  afterTokens: number;
  beforeLines: number;
  afterLines: number;
  tokenSavedPct: number;
  linesSaved: number;
}

export function LinterView({ skill, models, onUpdateSkill }: LinterViewProps) {
  const [profile, setProfile] = useState<ReasoningProfile>('fast');
  const [aiLoading, setAiLoading] = useState(false);
  const [compressLoading, setCompressLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReport, setAiReport] = useState<{
    summary: string;
    findings: AiFinding[];
    improvedSkillMd: string;
  } | null>(null);
  const [compressReport, setCompressReport] = useState<CompressReport | null>(
    null
  );

  const checks = useMemo(() => runSkillLinter(skill), [skill]);
  const pd = useMemo(() => computeProgressiveDisclosure(skill), [skill]);
  const totalContextTokens = pd.frontmatterTokensEst + pd.bodyTokensEst;

  const errorCount = checks.filter((c) => c.severity === 'error').length;
  const warningCount = checks.filter((c) => c.severity === 'warning').length;
  const passCount = checks.filter((c) => c.severity === 'pass').length;

  const handleRunAiLint = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const resp = await fetch('/api/skills/lint-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: skill.id,
          skillName: skill.name,
          skillMd: skill.skillMd,
          auxFiles: skill.auxFiles.map((f) => ({ path: f.path })),
          profile,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '语义检查失败');
      }
      setAiReport(data);
      setCompressReport(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '语义检查请求失败');
    } finally {
      setAiLoading(false);
    }
  };

  const handleRunCompress = async () => {
    setCompressLoading(true);
    setAiError(null);
    try {
      const resp = await fetch('/api/skills/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: skill.id,
          skillName: skill.name,
          skillMd: skill.skillMd,
          auxFiles: skill.auxFiles.map((f) => ({ path: f.path })),
          targetReductionPct: 30,
          profile,
        }),
      });
      const data: CompressReport & { error?: string } = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Token 瘦身压缩失败');
      }
      setCompressReport(data);
      setAiReport(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Token 瘦身压缩失败');
    } finally {
      setCompressLoading(false);
    }
  };

  const handleApplyAiFix = () => {
    if (!aiReport?.improvedSkillMd) return;
    const rev: SkillRevision = {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
      source: 'ai-lint',
      note: 'AI 语义审计自动优化前快照',
      skillMd: skill.skillMd,
    };

    onUpdateSkill(
      {
        ...skill,
        skillMd: aiReport.improvedSkillMd,
        revisions: [rev, ...skill.revisions].slice(0, 20),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      true
    );
    setAiReport(null);
  };

  const handleApplyCompression = () => {
    if (!compressReport?.compressedSkillMd) return;
    const rev: SkillRevision = {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
      source: 'compress',
      note: `Token 瘦身压缩 (${compressReport.beforeTokens}t → ${compressReport.afterTokens}t, -${compressReport.tokenSavedPct}%)`,
      skillMd: skill.skillMd,
    };

    const mergedAux: SkillAuxFile[] = [...skill.auxFiles];
    for (const suggested of compressReport.suggestedAuxFiles || []) {
      if (!suggested.path?.trim() || !suggested.content?.trim()) continue;
      const normalizedKind: SkillFileKind =
        suggested.kind === 'script' || suggested.kind === 'asset'
          ? suggested.kind
          : 'reference';
      const existingIdx = mergedAux.findIndex((f) => f.path === suggested.path);
      if (existingIdx >= 0) {
        mergedAux[existingIdx] = {
          ...mergedAux[existingIdx],
          kind: normalizedKind,
          content: suggested.content,
        };
      } else {
        mergedAux.push({
          id: `aux-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          path: suggested.path,
          kind: normalizedKind,
          content: suggested.content,
        });
      }
    }

    onUpdateSkill(
      {
        ...skill,
        skillMd: compressReport.compressedSkillMd,
        auxFiles: mergedAux,
        revisions: [rev, ...skill.revisions].slice(0, 20),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      true
    );
    setCompressReport(null);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-slate-500">
            同源 CI 规则检查 · {skill.name}/SKILL.md
          </div>
          <div className="text-base font-semibold text-slate-900">
            {errorCount > 0
              ? `发现 ${errorCount} 个阻断错误，需修复后方可合并`
              : warningCount > 0
                ? `通过基础校验，存在 ${warningCount} 项优化建议`
                : '全部 8 项规范检查通过，达到发布标准'}
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            通过 {passCount} · 警告 {warningCount} · 错误 {errorCount} · 当前正文 {pd.bodyLines} / 500 行 · L1+L2 约 {totalContextTokens} tokens
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2 shrink-0">
          <ModelSelector
            models={models}
            value={profile}
            onChange={setProfile}
            ariaLabel="选择语义审计模型"
          />
          <button
            type="button"
            onClick={handleRunCompress}
            disabled={compressLoading || aiLoading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {compressLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Token 瘦身中...
              </>
            ) : (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                AI 一键 Token 瘦身
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleRunAiLint}
            disabled={aiLoading || compressLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
          >
            {aiLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                AI 深度审计中...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                运行 AI 语义审计与自动优化
              </>
            )}
          </button>
        </div>
      </div>

      {aiError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {aiError}
        </div>
      )}

      {compressReport && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Token 瘦身压缩方案与 Diff 预览
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                {compressReport.summary}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCompressReport(null)}
                className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                忽略
              </button>
              <button
                type="button"
                onClick={handleApplyCompression}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                确认应用瘦身（保留快照）
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3.5 text-xs">
            <div>
              <div className="text-slate-500">L1+L2 Tokens 变化</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {compressReport.beforeTokens} → {compressReport.afterTokens}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Token 压缩率</div>
              <div
                className={`mt-0.5 font-mono font-semibold tabular-nums ${
                  compressReport.tokenSavedPct > 0
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {compressReport.tokenSavedPct >= 0
                  ? `-${compressReport.tokenSavedPct}%`
                  : `+${Math.abs(compressReport.tokenSavedPct)}%`}
              </div>
            </div>
            <div>
              <div className="text-slate-500">正文行数变化</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {compressReport.beforeLines} → {compressReport.afterLines} 行
              </div>
            </div>
            <div>
              <div className="text-slate-500">建议拆出 Layer 3 文件</div>
              <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                {compressReport.suggestedAuxFiles.length} 个
              </div>
            </div>
          </div>

          {compressReport.tacticsUsed.length > 0 && (
            <div className="text-xs text-slate-600 space-y-1">
              <div className="font-medium text-slate-800">本次执行的瘦身策略：</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {compressReport.tacticsUsed.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          <DiffViewer
            before={skill.skillMd}
            after={compressReport.compressedSkillMd}
            title="Token 瘦身前后 Diff 预览（应用后建议去 Eval 实验室复测通过率）"
          />
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
        {checks.map((check) => (
          <div key={check.ruleId} className="p-4 flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {check.severity === 'error' ? (
                <XCircle className="w-4 h-4 text-red-600" />
              ) : check.severity === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-900">
                  {check.title}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {check.ruleId}
                </span>
                {check.line && (
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    · Line {check.line}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {check.detail}
              </p>
              {check.fixHint && (
                <p className="mt-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5">
                  修复建议：{check.fixHint}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {aiReport && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                AI 语义审计结果与行级 Diff 预览
              </h3>
              <p className="text-xs text-slate-600 mt-1">{aiReport.summary}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setAiReport(null)}
                className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
              >
                忽略
              </button>
              <button
                type="button"
                onClick={handleApplyAiFix}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                确认应用优化（保留快照）
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {aiReport.findings && aiReport.findings.length > 0 && (
            <div className="space-y-2">
              {aiReport.findings.map((f, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs"
                >
                  <div className="font-medium text-slate-900">
                    {f.severity === 'warning' ? '潜在风险' : '优化建议'} · {f.title}
                  </div>
                  <div className="mt-1 text-slate-600">{f.detail}</div>
                </div>
              ))}
            </div>
          )}

          <DiffViewer
            before={skill.skillMd}
            after={aiReport.improvedSkillMd}
            title="AI 语义优化 Diff 预览"
          />
        </div>
      )}
    </div>
  );
}
