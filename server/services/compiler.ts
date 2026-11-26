import { Type } from '@google/genai';
import type { ReasoningProfile, SkillSpec } from '../../shared/types.ts';
import { computeProgressiveDisclosure } from '../../shared/skillLinter.ts';
import {
  callLlmJson,
  estimateCostUsd,
  resolveProfile,
} from './llmGateway.ts';
import { appendTelemetryEvent } from './telemetry.ts';

interface CompiledSkillResult {
  name: string;
  title: string;
  description: string;
  skillMd: string;
  auxFiles: { path: string; kind: string; content: string }[];
  evalCases: {
    prompt: string;
    expectedBehavior: string;
    shouldTrigger: boolean;
    category: string;
  }[];
}

export async function compileSkillFromSpec(params: {
  skillId?: string;
  name?: string;
  title?: string;
  tier?: string;
  domain?: string;
  owner?: string;
  spec: SkillSpec;
  profile?: ReasoningProfile;
  isRecompile?: boolean;
}) {
  const execSpec = resolveProfile(params.profile);
  const started = Date.now();

  const prompt = `你是 Uber AI Foundations 团队的 Skill Workshop 编译器。请根据用户提供的结构化 Spec，编译输出符合 Agent Skills 开放标准（agentskills.io）和 Uber 工程规范的 Skill 产物。

目标运行配置：${execSpec.label}（目标运行时：${params.spec.targetAgent || 'Claude Code / Cursor / Codex'}）

硬性工程约束：
1. skillMd 必须以标准 YAML Frontmatter 开头（--- 包裹），包含 name（必须是 lowercase-kebab-case，如 "${params.name || 'custom-agent-skill'}"）和 description（明确说明 What + When to trigger + When NOT to trigger，控制在 ~100-150 tokens 内）。
2. skillMd 正文必须严格少于 500 行（推荐 60~180 行），使用清晰的编号步骤（1. 2. 3.），每一步目标单一，且必须包含最终的“结果验证 / 自检（Verification）”步骤。
3. 遵循 Progressive Disclosure（渐进式披露）：如果 Spec 中包含大量参考手册、错误码表或脚本，请把详细资料拆到 auxFiles（如 references/*.md 或 scripts/*.sh），在 SKILL.md 正文里用 Markdown 相对路径链接引用。
4. 同时编译生成 3 个高质量的 golden evalCases：2 个正向必触发用例（positive，shouldTrigger: true），1 个边界负向不触发用例（negative，shouldTrigger: false）。

输入 Spec：
- Skill 英文标识: ${nameOrFallback(params.name)}
- 中文标题: ${params.title || '(请生成简明中文标题)'}
- 层级: ${params.tier || 'domain'}
- 所属域: ${params.domain || 'general'}
- 负责人: ${params.owner || '@eng-team'}
- 目标 (Goal): ${params.spec.goal}
- 触发时机 (When to trigger): ${params.spec.whenToTrigger || '根据目标自动判断'}
- 禁止触发边界 (When NOT to trigger): ${params.spec.whenNotToTrigger || '不相关通用问答时忽略'}
- 核心步骤 (Steps): ${params.spec.steps || '按规范逐步执行'}
- 依赖工具与参考 (Tooling): ${params.spec.tooling || '无特殊外部工具'}
- 验证方式 (Verification): ${params.spec.verification || '执行测试或自检核对结果'}`;

  try {
    const res = await callLlmJson<CompiledSkillResult>({
      profile: execSpec.profile,
      prompt,
      geminiSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          skillMd: { type: Type.STRING },
          auxFiles: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                path: { type: Type.STRING },
                kind: { type: Type.STRING },
                content: { type: Type.STRING },
              },
              required: ['path', 'kind', 'content'],
            },
          },
          evalCases: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING },
                expectedBehavior: { type: Type.STRING },
                shouldTrigger: { type: Type.BOOLEAN },
                category: { type: Type.STRING },
              },
              required: [
                'prompt',
                'expectedBehavior',
                'shouldTrigger',
                'category',
              ],
            },
          },
        },
        required: [
          'name',
          'title',
          'description',
          'skillMd',
          'auxFiles',
          'evalCases',
        ],
      },
      jsonExampleHint: `{
  "name": "example-skill",
  "title": "示例技能",
  "description": "What it does and when to use it.",
  "skillMd": "---\\nname: \\"example-skill\\"\\ndescription: >\\n  ...\\n---\\n\\n# 标题\\n\\n1. ...\\n",
  "auxFiles": [{ "path": "references/guide.md", "kind": "reference", "content": "..." }],
  "evalCases": [{ "prompt": "...", "expectedBehavior": "...", "shouldTrigger": true, "category": "positive" }]
}`,
    });

    appendTelemetryEvent({
      skillId: params.skillId || '',
      skillName: res.data.name || params.name || 'unknown',
      eventType: params.isRecompile ? 'recompile' : 'compile',
      profile: execSpec.profile,
      success: true,
      latencyMs: res.latencyMs,
      tokens: res.totalTokens,
      costUsd: estimateCostUsd(res.totalTokens, execSpec.profile),
      detail: `${params.isRecompile ? '重编译' : '编译'}完成 (${execSpec.label})`,
    });

    return res.data;
  } catch (err) {
    appendTelemetryEvent({
      skillId: params.skillId || '',
      skillName: params.name || 'unknown',
      eventType: params.isRecompile ? 'recompile' : 'compile',
      profile: execSpec.profile,
      success: false,
      latencyMs: Date.now() - started,
      tokens: 0,
      costUsd: 0,
      detail: err instanceof Error ? err.message : 'Compile failed',
    });
    throw err;
  }
}

function nameOrFallback(name?: string): string {
  return name && name.trim() ? name.trim() : '(请根据目标生成 kebab-case 名称)';
}

interface AiLintResult {
  summary: string;
  findings: { severity: string; title: string; detail: string }[];
  improvedSkillMd: string;
}

export async function lintSkillWithAi(params: {
  skillId?: string;
  skillName?: string;
  skillMd: string;
  auxFiles?: { path: string }[];
  profile?: ReasoningProfile;
}) {
  const execSpec = resolveProfile(params.profile);
  const prompt = `你是一名 Agent Skill 质量审查专家（Uber Skill Linter）。请从语义和工程可执行性角度审查以下 SKILL.md，并给出改进版 SKILL.md（保持 <500 行、Frontmatter 清晰、编号步骤明确、包含自检）。

当前 SKILL.md：
\`\`\`markdown
${params.skillMd}
\`\`\`

当前辅助文件列表：${
    Array.isArray(params.auxFiles) && params.auxFiles.length > 0
      ? params.auxFiles.map((f) => f.path).join(', ')
      : '无'
  }`;

  const res = await callLlmJson<AiLintResult>({
    profile: execSpec.profile,
    prompt,
    geminiSchema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        findings: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              severity: { type: Type.STRING },
              title: { type: Type.STRING },
              detail: { type: Type.STRING },
            },
            required: ['severity', 'title', 'detail'],
          },
        },
        improvedSkillMd: { type: Type.STRING },
      },
      required: ['summary', 'findings', 'improvedSkillMd'],
    },
    jsonExampleHint: `{
  "summary": "整体审查结论",
  "findings": [{ "severity": "warning", "title": "问题描述", "detail": "详细说明" }],
  "improvedSkillMd": "---\\nname: ...\\n---\\n..."
}`,
  });

  appendTelemetryEvent({
    skillId: params.skillId || '',
    skillName: params.skillName || 'unknown',
    eventType: 'lint_ai',
    profile: execSpec.profile,
    success: true,
    latencyMs: res.latencyMs,
    tokens: res.totalTokens,
    costUsd: estimateCostUsd(res.totalTokens, execSpec.profile),
    detail: `AI 语义审计 (${execSpec.label}) · ${res.data.findings?.length ?? 0} 条建议`,
  });

  return res.data;
}

interface ImproveResult {
  changelog: string;
  updatedSkillMd: string;
}

export async function improveSkillFromPapercuts(params: {
  skillId?: string;
  skillName?: string;
  skillMd: string;
  feedback?: string;
  failedCases?: unknown[];
  profile?: ReasoningProfile;
}) {
  const execSpec = resolveProfile(params.profile);
  const prompt = `你正在执行 Uber Skill Workshop 的“Improve（缺陷回流迭代）”步骤。
请结合生产环境收集到的 Papercut 缺陷反馈与未通过测试用例，精准修补当前 SKILL.md，同时保持正文精简（严格 <500 行）、Frontmatter 格式有效。

当前 SKILL.md：
\`\`\`markdown
${params.skillMd}
\`\`\`

用户/生产反馈（Papercut）：
${params.feedback || '无额外文本反馈'}

失败或待改进的测试场景：
${
  Array.isArray(params.failedCases) && params.failedCases.length > 0
    ? JSON.stringify(params.failedCases, null, 2)
    : '无'
}`;

  const res = await callLlmJson<ImproveResult>({
    profile: execSpec.profile,
    prompt,
    geminiSchema: {
      type: Type.OBJECT,
      properties: {
        changelog: { type: Type.STRING },
        updatedSkillMd: { type: Type.STRING },
      },
      required: ['changelog', 'updatedSkillMd'],
    },
    jsonExampleHint: `{
  "changelog": "本次修复内容简述",
  "updatedSkillMd": "---\\nname: ...\\n---\\n..."
}`,
  });

    appendTelemetryEvent({
    skillId: params.skillId || '',
    skillName: params.skillName || 'unknown',
    eventType: 'improve',
    profile: execSpec.profile,
    success: true,
    latencyMs: res.latencyMs,
    tokens: res.totalTokens,
    costUsd: estimateCostUsd(res.totalTokens, execSpec.profile),
    detail: `${execSpec.label}: ${res.data.changelog || 'Papercut 迭代优化'}`,
  });

  return res.data;
}

interface CompressSkillResult {
  summary: string;
  tacticsUsed: string[];
  compressedSkillMd: string;
  suggestedAuxFiles: { path: string; kind: string; content: string }[];
}

export async function compressSkillForTokens(params: {
  skillId?: string;
  skillName?: string;
  skillMd: string;
  auxFiles?: { path: string; kind?: string; content?: string }[];
  targetReductionPct?: number;
  profile?: ReasoningProfile;
}) {
  const execSpec = resolveProfile(params.profile);
  const targetPct = Math.min(60, Math.max(15, params.targetReductionPct || 30));

  const beforeMetrics = computeProgressiveDisclosure({
    skillMd: params.skillMd,
    auxFiles: [],
  });
  const beforeTotalTokens =
    beforeMetrics.frontmatterTokensEst + beforeMetrics.bodyTokensEst;

  const prompt = `你是 Uber AI Foundations 团队的 Token 成本压缩专家。请在不损失任何关键约束、核心执行步骤、负向边界条件和最终自检（Verification）的前提下，对以下 SKILL.md 进行极限瘦身压缩，目标降低约 ${targetPct}% 的上下文 Token 消耗：

压缩原则（Progressive Disclosure & Cost Optimization）：
1. 保留标准 YAML Frontmatter（name 字段保持不变；description 控制在 ~80-110 tokens，保留清晰的 What + When + When NOT 触发关键词）。
2. 保留所有编号步骤的核心动作与命令，删除重复解释、客套话、冗余段落和长篇背景描述。
3. 若正文中存在超过 25 行的参考表格、静态模板或大段脚本，将其抽离到 suggestedAuxFiles（如 references/*.md 或 scripts/*），正文只保留精简的一行相对路径链接。
4. 必须保留末尾的验证/自检（Verification）步骤。

当前 SKILL.md（共 ${beforeMetrics.bodyLines} 行正文，约 ${beforeTotalTokens} tokens）：
\`\`\`markdown
${params.skillMd}
\`\`\`

现有附属文件：${
    Array.isArray(params.auxFiles) && params.auxFiles.length > 0
      ? params.auxFiles.map((f) => f.path).join(', ')
      : '无'
  }`;

  const res = await callLlmJson<CompressSkillResult>({
    profile: execSpec.profile,
    prompt,
    geminiSchema: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        tacticsUsed: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        compressedSkillMd: { type: Type.STRING },
        suggestedAuxFiles: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              path: { type: Type.STRING },
              kind: { type: Type.STRING },
              content: { type: Type.STRING },
            },
            required: ['path', 'kind', 'content'],
          },
        },
      },
      required: [
        'summary',
        'tacticsUsed',
        'compressedSkillMd',
        'suggestedAuxFiles',
      ],
    },
    jsonExampleHint: `{
  "summary": "压缩总结",
  "tacticsUsed": ["精简描述至90 tokens", "合并冗余说明"],
  "compressedSkillMd": "---\\nname: ...\\n---\\n...",
  "suggestedAuxFiles": []
}`,
  });

  const compressedSkillMd = res.data.compressedSkillMd || params.skillMd;
  const afterMetrics = computeProgressiveDisclosure({
    skillMd: compressedSkillMd,
    auxFiles: [],
  });
  const afterTotalTokens =
    afterMetrics.frontmatterTokensEst + afterMetrics.bodyTokensEst;
  const tokenSavedPct =
    beforeTotalTokens > 0
      ? Math.round(((beforeTotalTokens - afterTotalTokens) / beforeTotalTokens) * 100)
      : 0;
  const linesSaved = beforeMetrics.bodyLines - afterMetrics.bodyLines;

  appendTelemetryEvent({
    skillId: params.skillId || '',
    skillName: params.skillName || 'unknown',
    eventType: 'compress',
    profile: execSpec.profile,
    success: true,
    latencyMs: res.latencyMs,
    tokens: res.totalTokens,
    costUsd: estimateCostUsd(res.totalTokens, execSpec.profile),
    detail: `Token 瘦身 (${execSpec.label}): ${beforeTotalTokens}t → ${afterTotalTokens}t (${tokenSavedPct >= 0 ? `-${tokenSavedPct}%` : `+${Math.abs(tokenSavedPct)}%`})`,
  });

  return {
    summary: res.data.summary,
    tacticsUsed: res.data.tacticsUsed || [],
    compressedSkillMd,
    suggestedAuxFiles: res.data.suggestedAuxFiles || [],
    beforeTokens: beforeTotalTokens,
    afterTokens: afterTotalTokens,
    beforeLines: beforeMetrics.bodyLines,
    afterLines: afterMetrics.bodyLines,
    tokenSavedPct,
    linesSaved,
  };
}
