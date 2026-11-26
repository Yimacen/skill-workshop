import { useEffect, useMemo, useState } from 'react';
import { Copy, Check, Download, RefreshCw } from 'lucide-react';
import type { AgentSkill, TelemetryEvent } from '../types/skill';
import {
  computeProgressiveDisclosure,
  generateCiRunnerScript,
  generateCiWorkflowYaml,
  generateCodeownersFile,
  generatePluginsJson,
  generateSyncScript,
  runSkillLinter,
} from '../utils/skillLinter';
import { exportMarketplaceRepoZip } from '../utils/exportZip';

interface TelemetryGitViewProps {
  skills: AgentSkill[];
}

export function TelemetryGitView({ skills }: TelemetryGitViewProps) {
  const [gitTab, setGitTab] = useState<
    'codeowners' | 'plugins' | 'ci' | 'runner' | 'sync'
  >('codeowners');
  const [copied, setCopied] = useState(false);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const loadTelemetry = async () => {
    setLoadingEvents(true);
    try {
      const resp = await fetch('/api/telemetry?limit=30');
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.events)) {
          setEvents(data.events);
        }
      }
    } catch {
      // ignore transient error
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadTelemetry();
  }, []);

  const codeownersContent = useMemo(
    () => generateCodeownersFile(skills),
    [skills]
  );
  const pluginsContent = useMemo(() => generatePluginsJson(skills), [skills]);
  const ciContent = useMemo(() => generateCiWorkflowYaml(), []);
  const runnerContent = useMemo(() => generateCiRunnerScript(), []);
  const syncContent = useMemo(() => generateSyncScript(skills), [skills]);

  const activeSnippet =
    gitTab === 'codeowners'
      ? codeownersContent
      : gitTab === 'plugins'
        ? pluginsContent
        : gitTab === 'ci'
          ? ciContent
          : gitTab === 'runner'
            ? runnerContent
            : syncContent;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const costBreakdown = useMemo(() => {
    const rows = skills.map((s) => {
      const pd = computeProgressiveDisclosure(s);
      const lints = runSkillLinter(s);
      const errCount = lints.filter((l) => l.severity === 'error').length;
      const monthlySpendUsd =
        s.telemetry.monthlyInvocations * s.telemetry.avgCostUsd;
      const contextTokens = pd.frontmatterTokensEst + pd.bodyTokensEst;

      const recommendations: string[] = [];
      if (monthlySpendUsd >= 50 && s.telemetry.avgCostUsd >= 0.01) {
        recommendations.push('高频高单价：建议在 Eval 实验室测试切换至 Fast / DeepSeek Chat');
      }
      if (contextTokens > 800 || pd.bodyLines > 220) {
        recommendations.push('上下文偏重：建议在 Linter 运行 AI 一键 Token 瘦身');
      }
      if (s.telemetry.ablationLiftPct < 15 && s.telemetry.monthlyInvocations > 0) {
        recommendations.push('消融增益偏低：排查是否冗余或误触发');
      }
      if (errCount > 0) {
        recommendations.push(`存在 ${errCount} 项 Linter 阻断项`);
      }

      return {
        skill: s,
        pd,
        contextTokens,
        monthlySpendUsd,
        recommendation:
          recommendations[0] || '成本与上下文效率处于健康区间',
        needsAttention: recommendations.length > 0,
      };
    });

    rows.sort((a, b) => b.monthlySpendUsd - a.monthlySpendUsd);

    const totalMonthlySpendUsd = rows.reduce(
      (sum, r) => sum + r.monthlySpendUsd,
      0
    );
    const totalInvocations = rows.reduce(
      (sum, r) => sum + r.skill.telemetry.monthlyInvocations,
      0
    );
    const weightedAvgCost =
      totalInvocations > 0 ? totalMonthlySpendUsd / totalInvocations : 0;
    const attentionCount = rows.filter((r) => r.needsAttention).length;

    return {
      rows,
      totalMonthlySpendUsd,
      totalInvocations,
      weightedAvgCost,
      attentionCount,
    };
  }, [skills]);

  return (
    <div className="space-y-6">
      {/* Section 0: Cost Governance & Six-Term Pareto Breakdown */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              月度总成本与六因子降本洞察（Cost Governance）
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              对照 Uber 成本方程（月总支出 = 调用量 × 单次成本），按花费由高到低定位高耗能 Skill 与优化动作
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {costBreakdown.attentionCount} 个 Skill 建议优化
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50/60">
          <div className="p-4">
            <div className="text-xs text-slate-500">预估月度总支出</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
              ${costBreakdown.totalMonthlySpendUsd.toFixed(2)}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">月度累计调用量</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
              {costBreakdown.totalInvocations.toLocaleString()}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">加权平均单次成本</div>
            <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
              ${costBreakdown.weightedAvgCost.toFixed(4)}
            </div>
          </div>
          <div className="p-4">
            <div className="text-xs text-slate-500">待降本优化 Skill</div>
            <div
              className={`mt-1 text-lg font-bold font-mono tabular-nums ${
                costBreakdown.attentionCount > 0
                  ? 'text-amber-700'
                  : 'text-emerald-700'
              }`}
            >
              {costBreakdown.attentionCount} / {skills.length}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/40 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 px-4">Skill 排序（按月总成本）</th>
                <th className="py-2.5 px-3 text-right">调用量 × 单价</th>
                <th className="py-2.5 px-3 text-right">月度总支出</th>
                <th className="py-2.5 px-3 w-36">支出占比</th>
                <th className="py-2.5 px-3 text-right">L1+L2 负载</th>
                <th className="py-2.5 px-4">降本诊断建议</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {costBreakdown.rows.map((item) => {
                const sharePct =
                  costBreakdown.totalMonthlySpendUsd > 0
                    ? Math.round(
                        (item.monthlySpendUsd /
                          costBreakdown.totalMonthlySpendUsd) *
                          100
                      )
                    : 0;
                return (
                  <tr key={item.skill.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {item.skill.name}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                      {item.skill.telemetry.monthlyInvocations.toLocaleString()} × $
                      {item.skill.telemetry.avgCostUsd.toFixed(4)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                      ${item.monthlySpendUsd.toFixed(2)}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full"
                            style={{ width: `${Math.min(100, sharePct)}%` }}
                          />
                        </div>
                        <span className="font-mono tabular-nums text-[11px] text-slate-600 w-8 text-right">
                          {sharePct}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                      {item.contextTokens}t · {item.pd.bodyLines}L
                    </td>
                    <td
                      className={`py-3 px-4 ${
                        item.needsAttention ? 'text-amber-700' : 'text-slate-600'
                      }`}
                    >
                      {item.recommendation}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 1: Complete 12-Metric Telemetry Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              12 项核心运营指标看板（Measure）
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              调用量、周活、留存、协同、单次与月度成本、延迟、错误率、消融增益、回归通过率、L1/L2 与 Linter 健康度
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            共 {skills.length} 个在库 Skill
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 px-4">Skill / 层级</th>
                <th className="py-2.5 px-2.5 text-right">调用量</th>
                <th className="py-2.5 px-2.5 text-right">周活</th>
                <th className="py-2.5 px-2.5 text-right">留存率</th>
                <th className="py-2.5 px-2.5">协同 Skill</th>
                <th className="py-2.5 px-2.5 text-right">单次成本</th>
                <th className="py-2.5 px-2.5 text-right">月度总成本</th>
                <th className="py-2.5 px-2.5 text-right">P50 延迟</th>
                <th className="py-2.5 px-2.5 text-right">错误率</th>
                <th className="py-2.5 px-2.5 text-right">消融增益</th>
                <th className="py-2.5 px-2.5 text-right">回归通过率</th>
                <th className="py-2.5 px-2.5 text-right">L1 / L2</th>
                <th className="py-2.5 px-4 text-right">Linter 健康</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {skills.map((s) => {
                const pd = computeProgressiveDisclosure(s);
                const lints = runSkillLinter(s);
                const errCount = lints.filter((l) => l.severity === 'error').length;
                const passCount = lints.filter((l) => l.severity === 'pass').length;
                const latestSuite = s.suiteHistory?.[0];
                const testedCases = s.evalCases.filter(
                  (c) => c.lastResult === 'pass' || c.lastResult === 'fail'
                );
                const casePassRate = latestSuite
                  ? `${latestSuite.overallPassRate}%`
                  : testedCases.length > 0
                    ? `${Math.round(
                        (testedCases.filter((c) => c.lastResult === 'pass').length /
                          testedCases.length) *
                          100
                      )}%`
                    : '—';
                const monthlySpend = s.telemetry.monthlyInvocations * s.telemetry.avgCostUsd;

                return (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{s.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {s.tier} · {s.owner}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-800">
                      {s.telemetry.monthlyInvocations.toLocaleString()}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      {s.telemetry.weeklyActiveUsers.toLocaleString()}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      {s.telemetry.retentionRate.toFixed(1)}%
                    </td>
                    <td className="py-3 px-2.5 font-mono text-[11px] text-slate-600">
                      {s.telemetry.coUseTopSkill}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      ${s.telemetry.avgCostUsd.toFixed(4)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-900 font-medium">
                      ${monthlySpend.toFixed(2)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-700">
                      {s.telemetry.p50LatencyMs}ms
                    </td>
                    <td
                      className={`py-3 px-2.5 text-right font-mono tabular-nums ${
                        s.telemetry.errorRate > 2.5
                          ? 'text-amber-700 font-medium'
                          : 'text-slate-700'
                      }`}
                    >
                      {s.telemetry.errorRate.toFixed(1)}%
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-emerald-700 font-medium">
                      +{s.telemetry.ablationLiftPct.toFixed(1)}%
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-800">
                      {casePassRate}
                    </td>
                    <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-600">
                      {pd.frontmatterTokensEst}t / {pd.bodyLines}L
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={
                          errCount > 0 ? 'text-red-600 font-medium' : 'text-emerald-700'
                        }
                      >
                        {passCount}/{lints.length}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Real OpenTelemetry Local Event Stream */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              OpenTelemetry 实时执行追踪事件流 (.workshop-store/telemetry.jsonl)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              每一次真实的 Spec 编译、AI 审计、路由评测与消融运行都会自动落盘并回写上方聚合指标
            </p>
          </div>
          <button
            type="button"
            onClick={loadTelemetry}
            disabled={loadingEvents}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingEvents ? 'animate-spin' : ''}`} />
            刷新事件流
          </button>
        </div>

        {events.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            暂无实时事件记录。前往“Spec 编译与编辑”、“Skill Linter”或“Eval 消融实验室”执行任意操作后，真实事件将出现在这里。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-medium text-slate-500">
                  <th className="py-2 px-4">时间</th>
                  <th className="py-2 px-3">Skill</th>
                  <th className="py-2 px-3">事件类型</th>
                  <th className="py-2 px-3">推理档位</th>
                  <th className="py-2 px-3 text-right">耗时</th>
                  <th className="py-2 px-3 text-right">Tokens</th>
                  <th className="py-2 px-3 text-right">预估成本</th>
                  <th className="py-2 px-4">详情</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                      {new Date(evt.timestamp).toLocaleTimeString('zh-CN', {
                        hour12: false,
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800">
                      {evt.skillName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">
                      {evt.eventType}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {evt.profile}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {evt.latencyMs}ms
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {evt.tokens.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      ${evt.costUsd.toFixed(5)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 truncate max-w-xs">
                      <span className={evt.success ? 'text-emerald-700 mr-1.5' : 'text-red-600 mr-1.5'}>
                        {evt.success ? 'OK' : 'ERR'}
                      </span>
                      {evt.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 3: Git Governance Templates (with plugins.json + unified CI runner) */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Git Monorepo 治理与同源 CI 脚本（实时生成）
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              包含 CODEOWNERS、plugins.json 插件包清单、同源 CI Linter 脚本及跨工具同步脚本
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  已复制
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  复制当前文件
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => exportMarketplaceRepoZip(skills)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              导出完整 Git 仓库包
            </button>
          </div>
        </div>

        <div className="px-5 pt-3 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center gap-2">
          {(
            [
              ['codeowners', 'CODEOWNERS'],
              ['plugins', 'plugins.json'],
              ['ci', '.github/workflows/skill-lint.yml'],
              ['runner', 'scripts/lint-skills.mjs'],
              ['sync', 'install.sh'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setGitTab(key)}
              className={`px-3 py-2 text-xs font-mono border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                gitTab === key
                  ? 'border-blue-600 text-blue-700 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <pre className="p-5 bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto leading-relaxed max-h-96 overflow-y-auto">
          {activeSnippet}
        </pre>
      </div>
    </div>
  );
}
