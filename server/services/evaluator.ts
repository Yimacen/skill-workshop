import { Type } from '@google/genai';
import type {
  BatchEvalCaseOutcome,
  EvalCase,
  ReasoningProfile,
} from '../../shared/types.ts';
import {
  callLlmJson,
  callLlmText,
  estimateCostUsd,
  resolveProfile,
} from './llmGateway.ts';
import { appendTelemetryEvent } from './telemetry.ts';

interface TriggerRoutingResult {
  decisions: { caseId: string; selectedSkill: string; reason: string }[];
}

interface JudgeResult {
  judgeVerdict: 'improved' | 'neutral' | 'regressed';
  outcomeScore: number;
  processScore: number;
  judgeSummary: string;
}

export async function runTriggerRoutingEval(params: {
  skillId?: string;
  targetSkillName: string;
  catalog: { name: string; description: string }[];
  testCases: { id: string; prompt: string }[];
  profile?: ReasoningProfile;
  skipTelemetry?: boolean;
}) {
  const execSpec = resolveProfile(params.profile);

  const catalogText = params.catalog
    .map((item) => `- ${item.name}: ${item.description}`)
    .join('\n');

  const casesText = params.testCases
    .map((c, idx) => `[${idx}] (id=${c.id}): ${c.prompt}`)
    .join('\n');

  const prompt = `你正在模拟 AI Agent 的 Layer 1 渐进式披露路由阶段（只允许读取所有 Skill 的 name 和简短 description，不允许读取正文）。
请判断面对以下每个用户输入时，Agent 会选择加载哪个 Skill（如果都不匹配，返回 "none"）。

可用 Skill 目录（Layer 1 元数据）：
${catalogText}

待测试用户输入：
${casesText}`;

  const res = await callLlmJson<TriggerRoutingResult>({
    profile: execSpec.profile,
    prompt,
    geminiSchema: {
      type: Type.OBJECT,
      properties: {
        decisions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              caseId: { type: Type.STRING },
              selectedSkill: { type: Type.STRING },
              reason: { type: Type.STRING },
            },
            required: ['caseId', 'selectedSkill', 'reason'],
          },
        },
      },
      required: ['decisions'],
    },
    jsonExampleHint: `{
  "decisions": [{ "caseId": "ev-1", "selectedSkill": "skill-name-or-none", "reason": "简短理由" }]
}`,
  });

  if (!params.skipTelemetry) {
    appendTelemetryEvent({
      skillId: params.skillId || '',
      skillName: params.targetSkillName,
      eventType: 'eval_trigger',
      profile: execSpec.profile,
      success: true,
      latencyMs: res.latencyMs,
      tokens: res.totalTokens,
      costUsd: estimateCostUsd(res.totalTokens, execSpec.profile),
      detail: `Layer 1 路由评测 (${execSpec.label} · ${params.testCases.length} 条用例)`,
    });
  }

  return {
    ...res.data,
    _tokens: res.totalTokens,
  };
}

export async function runSingleAblationEval(params: {
  skillId?: string;
  skillName?: string;
  skillMd: string;
  auxFiles?: { path: string; content: string }[];
  prompt: string;
  expectedBehavior?: string;
  profile?: ReasoningProfile;
  skipTelemetry?: boolean;
}) {
  const execSpec = resolveProfile(params.profile);
  const started = Date.now();

  const auxContext =
    Array.isArray(params.auxFiles) && params.auxFiles.length > 0
      ? '\n\n可用附属参考资料：\n' +
        params.auxFiles
          .map((f) => `### ${f.path}\n${f.content}`)
          .join('\n\n')
      : '';

  const [baseline, withSkill] = await Promise.all([
    callLlmText({
      profile: execSpec.profile,
      systemInstruction: '你是一名通用软件工程 AI 助手，请直接回答用户的开发问题。',
      prompt: params.prompt,
    }),
    callLlmText({
      profile: execSpec.profile,
      systemInstruction: `你是一名严格遵循指定 Agent Skill 工作流的 AI 助手。请严格按以下 SKILL.md 中的步骤与验证规范执行并返回结果：\n\n${params.skillMd}${auxContext}`,
      prompt: params.prompt,
    }),
  ]);

  const judgePrompt = `你是 Uber Skill Workshop 的评估裁判（LLM Judge）。请对比“无 Skill 裸模型输出（Baseline）”与“挂载 Skill 后输出（Treatment）”，判断该 Skill 是否带来了真实可衡量的增益。

测试输入：${params.prompt}
预期行为准则：${params.expectedBehavior || '严格按 Skill 流程、验证要求并准确解决问题。'}

--- Baseline 输出（无 Skill） ---
${baseline.text}

--- Treatment 输出（挂载 Skill） ---
${withSkill.text}

请用 JSON 返回评分与简明中文评语：
- judgeVerdict: "improved"（明显更规范/准确）、"neutral"（无显著差异，Skill 可能冗余）、"regressed"（反而变差或过度啰嗦）
- outcomeScore: 1~5 整数（Treatment 任务完成度）
- processScore: 1~5 整数（Treatment 对流程与验证步骤的遵循度）
- judgeSummary: 2~3句中文对比结论`;

  const judgeRes = await callLlmJson<JudgeResult>({
    profile: execSpec.profile,
    prompt: judgePrompt,
    geminiSchema: {
      type: Type.OBJECT,
      properties: {
        judgeVerdict: { type: Type.STRING },
        outcomeScore: { type: Type.INTEGER },
        processScore: { type: Type.INTEGER },
        judgeSummary: { type: Type.STRING },
      },
      required: [
        'judgeVerdict',
        'outcomeScore',
        'processScore',
        'judgeSummary',
      ],
    },
    jsonExampleHint: `{
  "judgeVerdict": "improved",
  "outcomeScore": 5,
  "processScore": 5,
  "judgeSummary": "对比结论"
}`,
  });

  const judge = judgeRes.data;
  const totalTokens =
    baseline.totalTokens + withSkill.totalTokens + judgeRes.totalTokens;

  if (!params.skipTelemetry) {
    appendTelemetryEvent({
      skillId: params.skillId || '',
      skillName: params.skillName || 'unknown',
      eventType: 'eval_ablation',
      profile: execSpec.profile,
      success: judge.judgeVerdict !== 'regressed',
      latencyMs: Date.now() - started,
      tokens: totalTokens,
      costUsd: estimateCostUsd(totalTokens, execSpec.profile),
      detail: `${execSpec.label}: ${judge.judgeVerdict} (结果 ${judge.outcomeScore}/5 · 流程 ${judge.processScore}/5)`,
    });
  }

  return {
    profile: execSpec.profile,
    baselineOutput: baseline.text,
    withSkillOutput: withSkill.text,
    baselineLatencyMs: baseline.latencyMs,
    withSkillLatencyMs: withSkill.latencyMs,
    baselineTokens: baseline.totalTokens,
    withSkillTokens: withSkill.totalTokens,
    totalTokens,
    judgeVerdict: judge.judgeVerdict || 'neutral',
    outcomeScore: judge.outcomeScore || 4,
    processScore: judge.processScore || 4,
    judgeSummary: judge.judgeSummary || '',
  };
}

export async function runBatchEvalSuite(params: {
  skillId?: string;
  skillName: string;
  skillMd: string;
  auxFiles?: { path: string; content: string }[];
  catalog: { name: string; description: string }[];
  evalCases: EvalCase[];
  profile?: ReasoningProfile;
  skipTelemetry?: boolean;
}) {
  const execSpec = resolveProfile(params.profile);
  const started = Date.now();

  const triggerRes = await runTriggerRoutingEval({
    skillId: params.skillId,
    targetSkillName: params.skillName,
    catalog: params.catalog,
    testCases: params.evalCases.map((c) => ({ id: c.id, prompt: c.prompt })),
    profile: execSpec.profile,
    skipTelemetry: params.skipTelemetry,
  });

  const decisionMap = new Map<string, { selectedSkill: string; reason: string }>();
  for (const d of triggerRes.decisions || []) {
    decisionMap.set(d.caseId, d);
  }

  let runtimeTokensSum = triggerRes._tokens || 0;
  let evalTotalTokensSum = triggerRes._tokens || 0;

  const outcomes: BatchEvalCaseOutcome[] = await Promise.all(
    params.evalCases.map(async (c) => {
      const dec = decisionMap.get(c.id);
      const selectedSkill = dec?.selectedSkill || 'none';
      const didSelectTarget = selectedSkill === params.skillName;
      const triggerPassed = c.shouldTrigger ? didSelectTarget : !didSelectTarget;

      if (!c.shouldTrigger) {
        return {
          caseId: c.id,
          prompt: c.prompt,
          category: c.category,
          shouldTrigger: c.shouldTrigger,
          selectedSkill,
          triggerPassed,
          ablationVerdict: 'skipped' as const,
          outcomeScore: triggerPassed ? 5 : 1,
          processScore: triggerPassed ? 5 : 1,
          tokenDelta: 0,
          latencyMs: 0,
          summary: dec?.reason || '负向边界用例仅验证路由不误触发。',
        };
      }

      const ablation = await runSingleAblationEval({
        skillId: params.skillId,
        skillName: params.skillName,
        skillMd: params.skillMd,
        auxFiles: params.auxFiles,
        prompt: c.prompt,
        expectedBehavior: c.expectedBehavior,
        profile: execSpec.profile,
        skipTelemetry: true,
      });

      runtimeTokensSum += ablation.withSkillTokens;
      evalTotalTokensSum += ablation.totalTokens;

      return {
        caseId: c.id,
        prompt: c.prompt,
        category: c.category,
        shouldTrigger: c.shouldTrigger,
        selectedSkill,
        triggerPassed,
        ablationVerdict: ablation.judgeVerdict as
          | 'improved'
          | 'neutral'
          | 'regressed',
        outcomeScore: ablation.outcomeScore,
        processScore: ablation.processScore,
        tokenDelta: Math.max(0, ablation.withSkillTokens - ablation.baselineTokens),
        latencyMs: ablation.withSkillLatencyMs,
        summary: ablation.judgeSummary,
      };
    })
  );

  const totalCases = outcomes.length;
  const triggerPassCount = outcomes.filter((o) => o.triggerPassed).length;
  const positiveOutcomes = outcomes.filter((o) => o.ablationVerdict !== 'skipped');
  const ablationImprovedCount = positiveOutcomes.filter(
    (o) => o.ablationVerdict === 'improved'
  ).length;
  const overallPassCount = outcomes.filter((o) => {
    if (!o.triggerPassed) return false;
    if (o.ablationVerdict === 'skipped') return true;
    return o.ablationVerdict !== 'regressed' && o.outcomeScore >= 3;
  }).length;

  const overallPassRate =
    totalCases > 0 ? Math.round((overallPassCount / totalCases) * 100) : 0;

  const avgLatencyMs =
    positiveOutcomes.length > 0
      ? Math.round(
          positiveOutcomes.reduce((s, o) => s + o.latencyMs, 0) /
            positiveOutcomes.length
        )
      : 0;
  const avgTokenDelta =
    positiveOutcomes.length > 0
      ? Math.round(
          positiveOutcomes.reduce((s, o) => s + o.tokenDelta, 0) /
            positiveOutcomes.length
        )
      : 0;

  const totalSuiteLatency = Date.now() - started;
  const estimatedCostUsd = estimateCostUsd(runtimeTokensSum, execSpec.profile);

  if (!params.skipTelemetry) {
    appendTelemetryEvent({
      skillId: params.skillId || '',
      skillName: params.skillName,
      eventType: 'eval_batch',
      profile: execSpec.profile,
      success: overallPassRate >= 70,
      latencyMs: totalSuiteLatency,
      tokens: evalTotalTokensSum,
      costUsd: estimateCostUsd(evalTotalTokensSum, execSpec.profile),
      detail: `全量回归 (${execSpec.label}) · ${totalCases} 条用例通过率 ${overallPassRate}%`,
    });
  }

  return {
    id: `suite-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    profile: execSpec.profile,
    totalCases,
    triggerPassCount,
    ablationImprovedCount,
    overallPassRate,
    avgLatencyMs,
    avgTokenDelta,
    totalTokens: runtimeTokensSum,
    estimatedCostUsd,
    outcomes,
  };
}

export async function runModelTierComparison(params: {
  skillId?: string;
  skillName: string;
  skillMd: string;
  auxFiles?: { path: string; content: string }[];
  catalog: { name: string; description: string }[];
  evalCases: EvalCase[];
  baselineProfile: ReasoningProfile;
  candidateProfile: ReasoningProfile;
}) {
  const baselineSpec = resolveProfile(params.baselineProfile);
  const candidateSpec = resolveProfile(params.candidateProfile);
  const started = Date.now();

  const [baselineSuite, candidateSuite] = await Promise.all([
    runBatchEvalSuite({
      ...params,
      profile: baselineSpec.profile,
      skipTelemetry: true,
    }),
    runBatchEvalSuite({
      ...params,
      profile: candidateSpec.profile,
      skipTelemetry: true,
    }),
  ]);

  const baselineMap = new Map(baselineSuite.outcomes.map((o) => [o.caseId, o]));
  const candidateMap = new Map(candidateSuite.outcomes.map((o) => [o.caseId, o]));

  const caseComparisons = params.evalCases.map((c) => {
    const b = baselineMap.get(c.id);
    const cand = candidateMap.get(c.id);
    const bPassed = Boolean(
      b &&
        b.triggerPassed &&
        (b.ablationVerdict === 'skipped' ||
          (b.ablationVerdict !== 'regressed' && b.outcomeScore >= 3))
    );
    const cPassed = Boolean(
      cand &&
        cand.triggerPassed &&
        (cand.ablationVerdict === 'skipped' ||
          (cand.ablationVerdict !== 'regressed' && cand.outcomeScore >= 3))
    );

    return {
      caseId: c.id,
      prompt: c.prompt,
      shouldTrigger: c.shouldTrigger,
      baselinePassed: bPassed,
      candidatePassed: cPassed,
      baselineScore: b?.outcomeScore ?? 0,
      candidateScore: cand?.outcomeScore ?? 0,
      baselineTokens: b?.tokenDelta ?? 0,
      candidateTokens: cand?.tokenDelta ?? 0,
      baselineLatencyMs: b?.latencyMs ?? 0,
      candidateLatencyMs: cand?.latencyMs ?? 0,
    };
  });

  const baselineTotalTokens = baselineSuite.totalTokens ?? 0;
  const candidateTotalTokens = candidateSuite.totalTokens ?? 0;
  const baselineCostUsd = baselineSuite.estimatedCostUsd ?? 0;
  const candidateCostUsd = candidateSuite.estimatedCostUsd ?? 0;

  const costSavingsPct =
    baselineCostUsd > 0
      ? Math.round(((baselineCostUsd - candidateCostUsd) / baselineCostUsd) * 100)
      : 0;
  const passRateDeltaPct =
    candidateSuite.overallPassRate - baselineSuite.overallPassRate;
  const avgLatencyDeltaMs =
    candidateSuite.avgLatencyMs - baselineSuite.avgLatencyMs;

  let recommendation: 'safe-to-downgrade' | 'tradeoff-warning' | 'keep-baseline';
  let summary: string;

  if (passRateDeltaPct >= -5 && costSavingsPct > 0) {
    recommendation = 'safe-to-downgrade';
    summary = `推荐切换至 ${candidateSpec.label}：通过率保持 ${candidateSuite.overallPassRate}%（基准 ${baselineSuite.overallPassRate}%），单次技能执行预估降本 ${costSavingsPct}%。`;
  } else if (passRateDeltaPct >= -15 && costSavingsPct > 0) {
    recommendation = 'tradeoff-warning';
    summary = `谨慎权衡：${candidateSpec.label} 可降本 ${costSavingsPct}%，但通过率下降 ${Math.abs(passRateDeltaPct)}%（${baselineSuite.overallPassRate}% → ${candidateSuite.overallPassRate}%），建议先优化 Skill 步骤清晰度再降级。`;
  } else if (costSavingsPct <= 0 && passRateDeltaPct >= 0) {
    recommendation = 'safe-to-downgrade';
    summary = `候选模型 ${candidateSpec.label} 通过率 ${candidateSuite.overallPassRate}% 不低于基准，但当前价格档位未体现显著成本降幅（${costSavingsPct}%）。`;
  } else {
    recommendation = 'keep-baseline';
    summary = `建议保留基准模型 ${baselineSpec.label}：切换到 ${candidateSpec.label} 后通过率降至 ${candidateSuite.overallPassRate}%（降幅 ${Math.abs(passRateDeltaPct)}%），质量损失过大。`;
  }

  appendTelemetryEvent({
    skillId: params.skillId || '',
    skillName: params.skillName,
    eventType: 'model_compare',
    profile: candidateSpec.profile,
    success: recommendation !== 'keep-baseline',
    latencyMs: Date.now() - started,
    tokens: baselineTotalTokens + candidateTotalTokens,
    costUsd: Number((baselineCostUsd + candidateCostUsd).toFixed(5)),
    detail: `双模型对比: ${baselineSpec.label} (${baselineSuite.overallPassRate}%) vs ${candidateSpec.label} (${candidateSuite.overallPassRate}%) · 成本变化 ${costSavingsPct >= 0 ? `-${costSavingsPct}%` : `+${Math.abs(costSavingsPct)}%`}`,
  });

  return {
    id: `cmp-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    baselineProfile: baselineSpec.profile,
    candidateProfile: candidateSpec.profile,
    baselineLabel: baselineSpec.label,
    candidateLabel: candidateSpec.label,
    totalCases: params.evalCases.length,
    baselinePassRate: baselineSuite.overallPassRate,
    candidatePassRate: candidateSuite.overallPassRate,
    passRateDeltaPct,
    baselineTotalTokens,
    candidateTotalTokens,
    baselineCostUsd,
    candidateCostUsd,
    costSavingsPct,
    avgLatencyDeltaMs,
    recommendation,
    summary,
    caseComparisons,
  };
}
