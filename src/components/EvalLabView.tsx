import { useState } from 'react';
import {
  Play,
  Plus,
  Sparkles,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  GitPullRequestArrow,
  Layers,
  Scale,
} from 'lucide-react';
import type {
  AgentSkill,
  BatchEvalSuiteRecord,
  EvalCase,
  EvalRunRecord,
  ModelComparisonReport,
  ModelOption,
  ReasoningProfile,
  SkillRevision,
} from '../types/skill';
import { DiffViewer } from './DiffViewer';
import { ModelSelector } from './ModelSelector';

interface EvalLabViewProps {
  skill: AgentSkill;
  allSkills: AgentSkill[];
  models: ModelOption[];
  onUpdateSkill: (updated: AgentSkill, immediate?: boolean) => void;
}

interface TriggerDecision {
  caseId: string;
  selectedSkill: string;
  reason: string;
}

export function EvalLabView({
  skill,
  allSkills,
  models,
  onUpdateSkill,
}: EvalLabViewProps) {
  const [profile, setProfile] = useState<ReasoningProfile>('fast');
  const [triggerRunning, setTriggerRunning] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [triggerDecisions, setTriggerDecisions] = useState<
    Record<string, TriggerDecision>
  >({});

  const [latestSuite, setLatestSuite] = useState<BatchEvalSuiteRecord | null>(
    skill.suiteHistory[0] || null
  );

  const [baselineTierProfile, setBaselineTierProfile] =
    useState<ReasoningProfile>('balanced');
  const [candidateTierProfile, setCandidateTierProfile] =
    useState<ReasoningProfile>('fast');
  const [comparingModels, setComparingModels] = useState(false);
  const [latestComparison, setLatestComparison] =
    useState<ModelComparisonReport | null>(
      skill.modelComparisonHistory?.[0] || null
    );

  const [ablationPrompt, setAblationPrompt] = useState(
    skill.evalCases.find((c) => c.shouldTrigger)?.prompt ||
      skill.evalCases[0]?.prompt ||
      ''
  );
  const [ablationExpected, setAblationExpected] = useState(
    skill.evalCases.find((c) => c.shouldTrigger)?.expectedBehavior || ''
  );
  const [ablationRunning, setAblationRunning] = useState(false);
  const [latestRun, setLatestRun] = useState<EvalRunRecord | null>(
    skill.evalHistory[0] || null
  );

  const [newCasePrompt, setNewCasePrompt] = useState('');
  const [newCaseExpected, setNewCaseExpected] = useState('');
  const [newCaseShouldTrigger, setNewCaseShouldTrigger] = useState(true);
  const [showAddCase, setShowAddCase] = useState(false);

  const [papercutFeedback, setPapercutFeedback] = useState('');
  const [improving, setImproving] = useState(false);
  const [improveResult, setImproveResult] = useState<{
    changelog: string;
    updatedSkillMd: string;
  } | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRunModelComparison = async () => {
    if (skill.evalCases.length === 0) return;
    setComparingModels(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/skills/eval/compare-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: skill.id,
          skillName: skill.name,
          skillMd: skill.skillMd,
          auxFiles: skill.auxFiles.map((f) => ({
            path: f.path,
            content: f.content,
          })),
          catalog: allSkills.map((s) => ({
            name: s.name,
            description: s.description,
          })),
          evalCases: skill.evalCases,
          baselineProfile: baselineTierProfile,
          candidateProfile: candidateTierProfile,
        }),
      });
      const data: ModelComparisonReport & { error?: string } = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '双模型降本对比失败');
      }
      setLatestComparison(data);
      onUpdateSkill(
        {
          ...skill,
          modelComparisonHistory: [
            data,
            ...(skill.modelComparisonHistory || []),
          ].slice(0, 8),
        },
        true
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '双模型降本对比失败');
    } finally {
      setComparingModels(false);
    }
  };

  const handleRunBatchSuite = async () => {
    if (skill.evalCases.length === 0) return;
    setBatchRunning(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/skills/eval/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: skill.id,
          skillName: skill.name,
          skillMd: skill.skillMd,
          auxFiles: skill.auxFiles.map((f) => ({
            path: f.path,
            content: f.content,
          })),
          catalog: allSkills.map((s) => ({
            name: s.name,
            description: s.description,
          })),
          evalCases: skill.evalCases,
          profile,
        }),
      });
      const data: BatchEvalSuiteRecord & { error?: string } = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '全量回归评测失败');
      }

      setLatestSuite(data);

      const outcomeMap = new Map(data.outcomes.map((o) => [o.caseId, o]));
      const updatedCases: EvalCase[] = skill.evalCases.map((c) => {
        const out = outcomeMap.get(c.id);
        if (!out) return c;
        const passed =
          out.triggerPassed &&
          (out.ablationVerdict === 'skipped' ||
            (out.ablationVerdict !== 'regressed' && out.outcomeScore >= 3));
        return { ...c, lastResult: passed ? 'pass' : 'fail' };
      });

      onUpdateSkill(
        {
          ...skill,
          evalCases: updatedCases,
          suiteHistory: [data, ...skill.suiteHistory].slice(0, 12),
        },
        true
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '全量回归评测失败');
    } finally {
      setBatchRunning(false);
    }
  };

  const handleRunTriggerEval = async () => {
    if (skill.evalCases.length === 0) return;
    setTriggerRunning(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/skills/eval/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: skill.id,
          targetSkillName: skill.name,
          catalog: allSkills.map((s) => ({
            name: s.name,
            description: s.description,
          })),
          testCases: skill.evalCases.map((c) => ({
            id: c.id,
            prompt: c.prompt,
          })),
          profile,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '触发路由测试失败');
      }

      const decisionMap: Record<string, TriggerDecision> = {};
      for (const d of data.decisions || []) {
        decisionMap[d.caseId] = d;
      }
      setTriggerDecisions(decisionMap);

      const updatedCases: EvalCase[] = skill.evalCases.map((c) => {
        const dec = decisionMap[c.id];
        if (!dec) return c;
        const didSelectTarget = dec.selectedSkill === skill.name;
        const passed = c.shouldTrigger ? didSelectTarget : !didSelectTarget;
        return { ...c, lastResult: passed ? 'pass' : 'fail' };
      });

      onUpdateSkill({ ...skill, evalCases: updatedCases }, true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '路由测试请求失败');
    } finally {
      setTriggerRunning(false);
    }
  };

  const handleRunAblation = async () => {
    if (!ablationPrompt.trim()) return;
    setAblationRunning(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/skills/eval/ablation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: skill.id,
          skillName: skill.name,
          skillMd: skill.skillMd,
          auxFiles: skill.auxFiles.map((f) => ({
            path: f.path,
            content: f.content,
          })),
          prompt: ablationPrompt,
          expectedBehavior: ablationExpected,
          profile,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '消融实验运行失败');
      }

      const record: EvalRunRecord = {
        id: `run-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
        profile: data.profile || profile,
        prompt: ablationPrompt,
        baselineOutput: data.baselineOutput,
        withSkillOutput: data.withSkillOutput,
        baselineTokens: data.baselineTokens,
        withSkillTokens: data.withSkillTokens,
        baselineLatencyMs: data.baselineLatencyMs,
        withSkillLatencyMs: data.withSkillLatencyMs,
        judgeVerdict: data.judgeVerdict,
        outcomeScore: data.outcomeScore,
        processScore: data.processScore,
        judgeSummary: data.judgeSummary,
      };

      setLatestRun(record);
      onUpdateSkill(
        {
          ...skill,
          evalHistory: [record, ...skill.evalHistory].slice(0, 10),
        },
        true
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '消融实验失败');
    } finally {
      setAblationRunning(false);
    }
  };

  const handleAddEvalCase = () => {
    if (!newCasePrompt.trim()) return;
    const item: EvalCase = {
      id: `ev-${Date.now()}`,
      prompt: newCasePrompt.trim(),
      expectedBehavior:
        newCaseExpected.trim() ||
        (newCaseShouldTrigger
          ? `应命中并遵循 ${skill.name}`
          : `不应误触发 ${skill.name}`),
      shouldTrigger: newCaseShouldTrigger,
      category: newCaseShouldTrigger ? 'positive' : 'negative',
      lastResult: 'untested',
    };
    onUpdateSkill(
      {
        ...skill,
        evalCases: [...skill.evalCases, item],
      },
      true
    );
    setNewCasePrompt('');
    setNewCaseExpected('');
    setShowAddCase(false);
  };

  const handleDeleteEvalCase = (id: string) => {
    onUpdateSkill(
      {
        ...skill,
        evalCases: skill.evalCases.filter((c) => c.id !== id),
      },
      true
    );
  };

  const handleSaveAsPapercut = () => {
    if (!ablationPrompt.trim()) return;
    const item: EvalCase = {
      id: `ev-papercut-${Date.now()}`,
      prompt: ablationPrompt.trim(),
      expectedBehavior:
        papercutFeedback.trim() ||
        ablationExpected.trim() ||
        '生产缺陷回归用例：需稳定按规范完成',
      shouldTrigger: true,
      category: 'papercut',
      lastResult: 'fail',
    };
    onUpdateSkill(
      {
        ...skill,
        evalCases: [...skill.evalCases, item],
      },
      true
    );
  };

  const handleImproveSkill = async () => {
    setImproving(true);
    setErrorMsg(null);
    try {
      const failedCases = skill.evalCases.filter(
        (c) => c.lastResult === 'fail' || c.category === 'papercut'
      );
      const resp = await fetch('/api/skills/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId: skill.id,
          skillName: skill.name,
          skillMd: skill.skillMd,
          feedback: papercutFeedback,
          failedCases,
          profile,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || '生成优化补丁失败');
      }
      setImproveResult(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '生成优化补丁失败');
    } finally {
      setImproving(false);
    }
  };

  const handleApplyImprovement = () => {
    if (!improveResult?.updatedSkillMd) return;
    const rev: SkillRevision = {
      id: `rev-${Date.now()}`,
      timestamp: new Date().toLocaleString('zh-CN', { hour12: false }),
      source: 'papercut',
      note: `Papercut 迭代优化: ${improveResult.changelog}`,
      skillMd: skill.skillMd,
    };

    onUpdateSkill(
      {
        ...skill,
        skillMd: improveResult.updatedSkillMd,
        revisions: [rev, ...skill.revisions].slice(0, 20),
        updatedAt: new Date().toISOString().slice(0, 10),
      },
      true
    );
    setImproveResult(null);
    setPapercutFeedback('');
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Top Suite Control & Batch Regression Summary */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              一键全量回归评测 (Batch Eval Suite)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              并发跑完当前 Skill 的全部 {skill.evalCases.length} 条黄金用例（Layer 1 路由 + 正向消融评分），对比改版前后通过率变化
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2 shrink-0">
            <ModelSelector
              models={models}
              value={profile}
              onChange={setProfile}
              ariaLabel="选择评测模型"
            />
            <button
              type="button"
              onClick={handleRunBatchSuite}
              disabled={batchRunning || skill.evalCases.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {batchRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  全量回归跑批中...
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  运行全量回归评测
                </>
              )}
            </button>
          </div>
        </div>

        {latestSuite && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3.5 text-xs">
              <div>
                <div className="text-slate-500">综合通过率</div>
                <div
                  className={`mt-0.5 text-base font-semibold font-mono tabular-nums ${
                    latestSuite.overallPassRate >= 80
                      ? 'text-emerald-700'
                      : 'text-amber-700'
                  }`}
                >
                  {latestSuite.overallPassRate}%
                </div>
              </div>
              <div>
                <div className="text-slate-500">Layer 1 路由命中</div>
                <div className="mt-0.5 text-base font-semibold font-mono tabular-nums text-slate-900">
                  {latestSuite.triggerPassCount} / {latestSuite.totalCases}
                </div>
              </div>
              <div>
                <div className="text-slate-500">消融正向增益</div>
                <div className="mt-0.5 text-base font-semibold font-mono tabular-nums text-slate-900">
                  {latestSuite.ablationImprovedCount} 条
                </div>
              </div>
              <div>
                <div className="text-slate-500">平均响应延迟</div>
                <div className="mt-0.5 text-base font-semibold font-mono tabular-nums text-slate-900">
                  {latestSuite.avgLatencyMs}ms
                </div>
              </div>
              <div>
                <div className="text-slate-500">平均 Token 增量</div>
                <div className="mt-0.5 text-base font-semibold font-mono tabular-nums text-slate-900">
                  +{latestSuite.avgTokenDelta}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-3">用例 Prompt</th>
                    <th className="py-2 px-3">L1 路由结果</th>
                    <th className="py-2 px-3">消融评判</th>
                    <th className="py-2 px-3 text-right">结果/流程分</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {latestSuite.outcomes.map((o) => (
                    <tr key={o.caseId}>
                      <td className="py-2.5 px-3 max-w-md">
                        <div className="font-medium text-slate-900 truncate">
                          {o.prompt}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {o.summary}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        <span
                          className={
                            o.triggerPassed ? 'text-emerald-700' : 'text-red-600'
                          }
                        >
                          {o.triggerPassed ? 'PASS' : 'FAIL'} ({o.selectedSkill})
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {o.ablationVerdict === 'skipped' ? (
                          <span className="text-slate-400">负向边界跳过</span>
                        ) : o.ablationVerdict === 'improved' ? (
                          <span className="text-emerald-700 font-medium">
                            Improved
                          </span>
                        ) : o.ablationVerdict === 'regressed' ? (
                          <span className="text-red-600 font-medium">
                            Regressed
                          </span>
                        ) : (
                          <span className="text-amber-700">Neutral</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {o.outcomeScore}/5 · {o.processScore}/5
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Dual-Model Cost vs Quality Tier Benchmark */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              双模型“降本不降质”对比评测 (Model Tiering Benchmark)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              用全量黄金用例并发对比高配基准模型与低成本候选模型，验证切换至更便宜模型是否会牺牲任务通过率
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>基准</span>
              <ModelSelector
                models={models}
                value={baselineTierProfile}
                onChange={setBaselineTierProfile}
                ariaLabel="选择基准高配模型"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <span>候选</span>
              <ModelSelector
                models={models}
                value={candidateTierProfile}
                onChange={setCandidateTierProfile}
                ariaLabel="选择低成本候选模型"
              />
            </div>
            <button
              type="button"
              onClick={handleRunModelComparison}
              disabled={comparingModels || skill.evalCases.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {comparingModels ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  双模型并发评测中...
                </>
              ) : (
                <>
                  <Scale className="w-3.5 h-3.5" />
                  运行双模型降本对比
                </>
              )}
            </button>
          </div>
        </div>

        {latestComparison && (
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span
                  className={`font-semibold mr-2 ${
                    latestComparison.recommendation === 'safe-to-downgrade'
                      ? 'text-emerald-700'
                      : latestComparison.recommendation === 'tradeoff-warning'
                        ? 'text-amber-700'
                        : 'text-red-600'
                  }`}
                >
                  {latestComparison.recommendation === 'safe-to-downgrade'
                    ? '可安全降本切换'
                    : latestComparison.recommendation === 'tradeoff-warning'
                      ? '存在质量权衡'
                      : '建议保留高配基准'}
                </span>
                <span>{latestComparison.summary}</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
                {latestComparison.timestamp}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-md p-3.5 text-xs">
              <div>
                <div className="text-slate-500">通过率对比（基准 → 候选）</div>
                <div className="mt-0.5 text-base font-semibold font-mono tabular-nums text-slate-900">
                  {latestComparison.baselinePassRate}% → {latestComparison.candidatePassRate}%
                </div>
              </div>
              <div>
                <div className="text-slate-500">预估执行成本降幅</div>
                <div
                  className={`mt-0.5 text-base font-semibold font-mono tabular-nums ${
                    latestComparison.costSavingsPct > 0
                      ? 'text-emerald-700'
                      : 'text-slate-700'
                  }`}
                >
                  {latestComparison.costSavingsPct >= 0
                    ? `-${latestComparison.costSavingsPct}%`
                    : `+${Math.abs(latestComparison.costSavingsPct)}%`}
                </div>
              </div>
              <div>
                <div className="text-slate-500">单轮技能总成本（$）</div>
                <div className="mt-0.5 text-sm font-semibold font-mono tabular-nums text-slate-900">
                  ${latestComparison.baselineCostUsd.toFixed(5)} → $
                  {latestComparison.candidateCostUsd.toFixed(5)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">平均延迟差</div>
                <div className="mt-0.5 text-base font-semibold font-mono tabular-nums text-slate-900">
                  {latestComparison.avgLatencyDeltaMs > 0
                    ? `+${latestComparison.avgLatencyDeltaMs}ms`
                    : `${latestComparison.avgLatencyDeltaMs}ms`}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2 px-3">用例 Prompt</th>
                    <th className="py-2 px-3">{latestComparison.baselineLabel}</th>
                    <th className="py-2 px-3">{latestComparison.candidateLabel}</th>
                    <th className="py-2 px-3 text-right">得分对比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {latestComparison.caseComparisons.map((row) => (
                    <tr key={row.caseId}>
                      <td className="py-2 px-3 max-w-md truncate font-medium text-slate-800">
                        {row.prompt}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        <span
                          className={
                            row.baselinePassed ? 'text-emerald-700' : 'text-red-600'
                          }
                        >
                          {row.baselinePassed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono">
                        <span
                          className={
                            row.candidatePassed ? 'text-emerald-700' : 'text-red-600'
                          }
                        >
                          {row.candidatePassed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {row.baselineScore}/5 vs {row.candidateScore}/5
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Section 1: Layer 1 Trigger Routing Test */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              1. 黄金测试集管理与 Layer 1 触发路由评测
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              验证 Agent 仅读取 {allSkills.length} 个 Skill 的 Frontmatter 摘要时，能否准确命中本 Skill
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowAddCase((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              添加测试用例
            </button>
            <button
              type="button"
              onClick={handleRunTriggerEval}
              disabled={triggerRunning || skill.evalCases.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {triggerRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  路由测试中...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  仅测 Layer 1 路由
                </>
              )}
            </button>
          </div>
        </div>

        {showAddCase && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  测试用户输入 (Prompt)
                </label>
                <input
                  type="text"
                  value={newCasePrompt}
                  onChange={(e) => setNewCasePrompt(e.target.value)}
                  placeholder="输入真实开发场景下的用户提问..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  期望路由结果
                </label>
                <select
                  value={newCaseShouldTrigger ? 'trigger' : 'ignore'}
                  onChange={(e) =>
                    setNewCaseShouldTrigger(e.target.value === 'trigger')
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="trigger">正向用例：必须触发本 Skill</option>
                  <option value="ignore">负向边界：不应该触发本 Skill</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                预期行为 / 评分准则
              </label>
              <input
                type="text"
                value={newCaseExpected}
                onChange={(e) => setNewCaseExpected(e.target.value)}
                placeholder="例如：应执行步骤 1~4 并给出校验命令"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddCase(false)}
                className="px-3 py-1 text-xs text-slate-600 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleAddEvalCase}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md cursor-pointer"
              >
                保存用例
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-md overflow-hidden">
          {skill.evalCases.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              暂无测试用例，请点击“添加测试用例”或回到 Spec 编译器自动生成。
            </div>
          ) : (
            skill.evalCases.map((c) => {
              const dec = triggerDecisions[c.id];
              return (
                <div
                  key={c.id}
                  className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/70"
                >
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-slate-500">
                        {c.category === 'papercut'
                          ? 'Papercut 回归'
                          : c.shouldTrigger
                            ? '正向触发'
                            : '负向边界'}
                      </span>
                      <span className="text-slate-300">·</span>
                      {c.lastResult === 'pass' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          通过
                        </span>
                      ) : c.lastResult === 'fail' ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          未通过
                        </span>
                      ) : (
                        <span className="text-slate-400">待测试</span>
                      )}
                    </div>
                    <div className="text-xs font-medium text-slate-900">
                      {c.prompt}
                    </div>
                    <div className="text-xs text-slate-500">
                      期望：{c.expectedBehavior}
                    </div>
                    {dec && (
                      <div className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-200 mt-1">
                        模型路由选择: {dec.selectedSkill} — {dec.reason}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setAblationPrompt(c.prompt);
                        setAblationExpected(c.expectedBehavior);
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                    >
                      填入消融对比
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEvalCase(c.id)}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                      title="删除用例"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Section 2: Single Ablation Testing */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            2. 单条深度消融对比（Baseline 裸模型 vs Treatment 挂载 Skill）
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            对照 Uber 消融实验室：直观看清挂载 Skill 后的完整响应差异与 Token 增量
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              评测输入 Prompt
            </label>
            <input
              type="text"
              value={ablationPrompt}
              onChange={(e) => setAblationPrompt(e.target.value)}
              placeholder="输入待测开发任务..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              裁判验收准则 (Rubric)
            </label>
            <input
              type="text"
              value={ablationExpected}
              onChange={(e) => setAblationExpected(e.target.value)}
              placeholder="预期遵循的步骤与输出要求..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="button"
              onClick={handleRunAblation}
              disabled={ablationRunning || !ablationPrompt.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              {ablationRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  对比中...
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  运行单条消融
                </>
              )}
            </button>
          </div>
        </div>

        {latestRun && (
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-md flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-700">
                  LLM Judge 结论 ({latestRun.profile})：
                  <span
                    className={`ml-1.5 font-semibold ${
                      latestRun.judgeVerdict === 'improved'
                        ? 'text-emerald-700'
                        : latestRun.judgeVerdict === 'regressed'
                          ? 'text-red-600'
                          : 'text-amber-700'
                    }`}
                  >
                    {latestRun.judgeVerdict === 'improved'
                      ? '显著正向增益 (Improved)'
                      : latestRun.judgeVerdict === 'regressed'
                        ? '效果退化 (Regressed)'
                        : '无明显差异 (Neutral / 可能冗余)'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">{latestRun.judgeSummary}</p>
              </div>

              <div className="flex items-center gap-5 shrink-0 font-mono text-xs tabular-nums">
                <div>
                  <div className="text-slate-400">结果分</div>
                  <div className="font-semibold text-slate-900">
                    {latestRun.outcomeScore} / 5
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">流程分</div>
                  <div className="font-semibold text-slate-900">
                    {latestRun.processScore} / 5
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Token 增量</div>
                  <div className="font-semibold text-slate-900">
                    +{Math.max(0, latestRun.withSkillTokens - latestRun.baselineTokens)}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">
                    Baseline（未挂载 Skill 裸模型）
                  </span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    {latestRun.baselineTokens} tokens · {latestRun.baselineLatencyMs}ms
                  </span>
                </div>
                <pre className="p-3.5 text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
                  {latestRun.baselineOutput}
                </pre>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                <div className="px-3.5 py-2 bg-blue-50/70 border-b border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-medium text-blue-900">
                    Treatment（已挂载 {skill.name}）
                  </span>
                  <span className="font-mono text-blue-700 tabular-nums">
                    {latestRun.withSkillTokens} tokens · {latestRun.withSkillLatencyMs}ms
                  </span>
                </div>
                <pre className="p-3.5 text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
                  {latestRun.withSkillOutput}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Closed-Loop Papercut Improvement with Diff Preview */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            3. Papercut 缺陷回流与迭代闭环 (Improve)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            把评测暴露的问题沉淀为回归用例，生成优化补丁并通过行级 Diff 预览确认后应用
          </p>
        </div>

        <textarea
          rows={2}
          value={papercutFeedback}
          onChange={(e) => setPapercutFeedback(e.target.value)}
          placeholder="记录本次运行发现的不足（例如：Agent 漏掉了最后一步验证命令，或对某类错误码误判）..."
          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
        />

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleSaveAsPapercut}
            disabled={!ablationPrompt.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <GitPullRequestArrow className="w-3.5 h-3.5" />
            回流为 Papercut 回归用例
          </button>
          <button
            type="button"
            onClick={handleImproveSkill}
            disabled={improving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors cursor-pointer disabled:opacity-60"
          >
            {improving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                生成优化补丁中...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                基于反馈生成优化版 SKILL.md
              </>
            )}
          </button>
        </div>

        {improveResult && (
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-900">
                变更说明：{improveResult.changelog}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setImproveResult(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                >
                  放弃
                </button>
                <button
                  type="button"
                  onClick={handleApplyImprovement}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md cursor-pointer"
                >
                  确认应用更新（保留快照）
                </button>
              </div>
            </div>
            <DiffViewer
              before={skill.skillMd}
              after={improveResult.updatedSkillMd}
              title="Papercut 修复补丁 Diff 预览"
            />
          </div>
        )}
      </div>
    </div>
  );
}
