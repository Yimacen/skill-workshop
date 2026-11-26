import type {
  AgentSkill,
  LintCheckResult,
  ProgressiveDisclosureMetrics,
} from './types.ts';

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkMatches = text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || [];
  const cjkCount = cjkMatches.length;
  const nonCjkLength = text.length - cjkCount;
  return Math.ceil(cjkCount * 1.3 + nonCjkLength / 3.8);
}

export function parseSkillMarkdown(skillMd: string): {
  hasValidFrontmatter: boolean;
  frontmatterRaw: string;
  bodyRaw: string;
  parsedName: string;
  parsedDescription: string;
  frontmatterEndLine: number;
} {
  const normalized = skillMd.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  if (lines[0]?.trim() !== '---') {
    return {
      hasValidFrontmatter: false,
      frontmatterRaw: '',
      bodyRaw: normalized,
      parsedName: '',
      parsedDescription: '',
      frontmatterEndLine: 0,
    };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return {
      hasValidFrontmatter: false,
      frontmatterRaw: '',
      bodyRaw: normalized,
      parsedName: '',
      parsedDescription: '',
      frontmatterEndLine: 0,
    };
  }

  const frontmatterLines = lines.slice(1, endIdx);
  const frontmatterRaw = frontmatterLines.join('\n');
  const bodyRaw = lines.slice(endIdx + 1).join('\n');

  let parsedName = '';
  let parsedDescription = '';

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i];
    const nameMatch = line.match(/^name:\s*["']?([^"'\n]+)["']?\s*$/);
    if (nameMatch) {
      parsedName = nameMatch[1].trim();
      continue;
    }
    const descMatch = line.match(/^description:\s*(.*)$/);
    if (descMatch) {
      const val = descMatch[1].trim();
      if (val === '>' || val === '|') {
        const blockLines: string[] = [];
        for (let j = i + 1; j < frontmatterLines.length; j++) {
          if (/^\s+/.test(frontmatterLines[j])) {
            blockLines.push(frontmatterLines[j].trim());
            i = j;
          } else {
            break;
          }
        }
        parsedDescription = blockLines.join(' ');
      } else {
        parsedDescription = val.replace(/^["']|["']$/g, '');
      }
    }
  }

  return {
    hasValidFrontmatter: true,
    frontmatterRaw,
    bodyRaw,
    parsedName,
    parsedDescription,
    frontmatterEndLine: endIdx + 1,
  };
}

export function computeProgressiveDisclosure(
  skill: Pick<AgentSkill, 'skillMd' | 'auxFiles'>
): ProgressiveDisclosureMetrics {
  const parsed = parseSkillMarkdown(skill.skillMd);
  const frontmatterLines = parsed.hasValidFrontmatter
    ? parsed.frontmatterRaw.split('\n').length + 2
    : 0;
  const bodyLines = parsed.bodyRaw ? parsed.bodyRaw.split('\n').length : 0;
  const auxTotalBytes = (skill.auxFiles || []).reduce(
    (sum, f) => sum + new TextEncoder().encode(f.content).length,
    0
  );

  return {
    frontmatterLines,
    frontmatterTokensEst: estimateTokens(parsed.frontmatterRaw),
    bodyLines,
    bodyTokensEst: estimateTokens(parsed.bodyRaw),
    auxFilesCount: (skill.auxFiles || []).length,
    auxTotalBytes,
    hasValidFrontmatter: parsed.hasValidFrontmatter,
    parsedName: parsed.parsedName,
    parsedDescription: parsed.parsedDescription,
  };
}

export function runSkillLinter(
  skill: Pick<AgentSkill, 'name' | 'skillMd' | 'auxFiles'>
): LintCheckResult[] {
  const results: LintCheckResult[] = [];
  const parsed = parseSkillMarkdown(skill.skillMd);
  const metrics = computeProgressiveDisclosure(skill);

  if (!parsed.hasValidFrontmatter) {
    results.push({
      ruleId: 'frontmatter-required',
      title: 'YAML Frontmatter 元数据块',
      severity: 'error',
      detail:
        'SKILL.md 顶部缺少标准的 --- YAML Frontmatter --- 区块，Agent 无法在第一层发现该 Skill。',
      line: 1,
      fixHint: '在文件第 1 行添加 --- 区块，包含 name 和 description 字段。',
    });
  } else {
    results.push({
      ruleId: 'frontmatter-required',
      title: 'YAML Frontmatter 元数据块',
      severity: 'pass',
      detail: `已检测到有效 Frontmatter（共 ${metrics.frontmatterLines} 行，约 ${metrics.frontmatterTokensEst} tokens）。`,
    });
  }

  const nameToCheck = parsed.parsedName || skill.name;
  const isKebab = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(nameToCheck);
  if (!nameToCheck || !isKebab) {
    results.push({
      ruleId: 'name-kebab-case',
      title: 'Skill 命名规范 (lowercase-kebab-case)',
      severity: 'error',
      detail: `当前名称 "${nameToCheck || '空'}" 不符合小写连字符规范，部分 Agent 运行时会静默加载失败。`,
      line: 2,
      fixHint: '仅使用小写字母、数字和连字符，例如 ci-failure-triage。',
    });
  } else {
    results.push({
      ruleId: 'name-kebab-case',
      title: 'Skill 命名规范 (lowercase-kebab-case)',
      severity: 'pass',
      detail: `名称 "${nameToCheck}" 符合开放规范要求。`,
    });
  }

  const desc = parsed.parsedDescription;
  const hasTriggerHint =
    /when|use|触发|适用|场景|用于|whenever|if/i.test(desc) && desc.length >= 30;
  if (!desc) {
    results.push({
      ruleId: 'description-trigger',
      title: 'Layer 1 触发描述清晰度',
      severity: 'error',
      detail: 'Frontmatter 中缺少 description，Agent 无法判断何时调用该 Skill。',
      fixHint: '用 1~3 句话明确说明“做什么（What）”以及“何时触发（When）”。',
    });
  } else if (!hasTriggerHint) {
    results.push({
      ruleId: 'description-trigger',
      title: 'Layer 1 触发描述清晰度',
      severity: 'warning',
      detail:
        'description 偏简短或缺少明确的适用场景（When to use），容易导致误触发或漏触发。',
      fixHint: '补充 "Use when..." 或 "适用场景：..."，同时可写明不适用的边界。',
    });
  } else if (metrics.frontmatterTokensEst > 220) {
    results.push({
      ruleId: 'description-trigger',
      title: 'Layer 1 触发描述清晰度',
      severity: 'warning',
      detail: `Frontmatter 预估 ${metrics.frontmatterTokensEst} tokens，略高于推荐的 ~100 tokens 常驻预算。`,
      fixHint: '精简 description，把详细规则放到正文或 references/ 文件中。',
    });
  } else {
    results.push({
      ruleId: 'description-trigger',
      title: 'Layer 1 触发描述清晰度',
      severity: 'pass',
      detail: `触发条件明确，常驻预算约 ${metrics.frontmatterTokensEst} tokens。`,
    });
  }

  if (metrics.bodyLines > 500) {
    results.push({
      ruleId: 'body-500-line-limit',
      title: 'Layer 2 正文 500 行上限检查',
      severity: 'error',
      detail: `SKILL.md 正文当前为 ${metrics.bodyLines} 行，超出 500 行规范上限，会导致上下文膨胀与指令遗漏。`,
      line: parsed.frontmatterEndLine + 1,
      fixHint:
        '将长篇参考规范、错误码表或脚本拆出到 references/ 或 scripts/ 目录，正文只留核心流程与相对路径引用。',
    });
  } else if (metrics.bodyLines > 380) {
    results.push({
      ruleId: 'body-500-line-limit',
      title: 'Layer 2 正文 500 行上限检查',
      severity: 'warning',
      detail: `SKILL.md 正文当前 ${metrics.bodyLines} / 500 行，已接近上限阈值。`,
      fixHint: '建议检查是否有静态示例或长表格可迁移到 references/ 中。',
    });
  } else {
    results.push({
      ruleId: 'body-500-line-limit',
      title: 'Layer 2 正文 500 行上限检查',
      severity: 'pass',
      detail: `正文共 ${metrics.bodyLines} / 500 行（约 ${metrics.bodyTokensEst} tokens），符合渐进式披露规范。`,
    });
  }

  const codeBlockMatches = parsed.bodyRaw.match(/```[\s\S]*?```/g) || [];
  const largestCodeBlockLines = codeBlockMatches.reduce((max, block) => {
    const lineCount = block.split('\n').length;
    return Math.max(max, lineCount);
  }, 0);

  if (largestCodeBlockLines > 55) {
    results.push({
      ruleId: 'progressive-disclosure-split',
      title: '渐进式披露：大段代码/数据块拆分',
      severity: 'warning',
      detail: `正文中存在长达 ${largestCodeBlockLines} 行的内联代码块，建议剥离到 scripts/ 或 references/。`,
      fixHint:
        '把长脚本或模板放到 auxFiles 中，在 SKILL.md 里用 [scripts/xxx](scripts/xxx) 按需引用。',
    });
  } else {
    results.push({
      ruleId: 'progressive-disclosure-split',
      title: '渐进式披露：大段代码/数据块拆分',
      severity: 'pass',
      detail:
        skill.auxFiles.length > 0
          ? `已合理拆分 ${skill.auxFiles.length} 个按需加载文件，正文无大段冗余代码块。`
          : '正文结构紧凑，未发现大段内联代码块膨胀。',
    });
  }

  const hasNumberedSteps = /(^|\n)\s*(1\.|步骤\s*1|Step\s*1)/im.test(
    parsed.bodyRaw
  );
  if (!hasNumberedSteps) {
    results.push({
      ruleId: 'numbered-steps',
      title: '步骤编号与单一目标检查',
      severity: 'warning',
      detail:
        '正文中未检测到清晰的编号步骤（如 1. / 2. 或 Step 1），Agent 容易跳步或顺序混乱。',
      fixHint: '将核心执行流拆分为有明确编号的原子步骤。',
    });
  } else {
    results.push({
      ruleId: 'numbered-steps',
      title: '步骤编号与单一目标检查',
      severity: 'pass',
      detail: '执行流程包含清晰编号步骤，便于 Agent 逐步遵循。',
    });
  }

  const hasVerification =
    /verify|verification|validate|check|lint|test|验证|核对|自检|检查/i.test(
      parsed.bodyRaw
    );
  if (!hasVerification) {
    results.push({
      ruleId: 'self-verification',
      title: '结果自检机制 (Verification)',
      severity: 'warning',
      detail:
        '未检测到明确的自检或验证指令（如运行测试、核对输出格式），容易出现幻觉或半成品交付。',
      fixHint: '在流程末尾增加“验证与核对”步骤，说明如何确认任务真正成功。',
    });
  } else {
    results.push({
      ruleId: 'self-verification',
      title: '结果自检机制 (Verification)',
      severity: 'pass',
      detail: '已包含明确的验证/自检步骤要求。',
    });
  }

  const fullContent = [
    skill.skillMd,
    ...(skill.auxFiles || []).map((f) => f.content),
  ].join('\n');
  const secretPattern =
    /(AIza[0-9A-Za-z\-_]{20,}|sk-[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{20,}|-----BEGIN [A-Z ]+ PRIVATE KEY-----)/;
  if (secretPattern.test(fullContent)) {
    results.push({
      ruleId: 'secret-scan',
      title: '敏感凭据与密钥泄露扫描',
      severity: 'error',
      detail: '检测到疑似硬编码的 API Key 或私钥片段，严禁提交到共享 Skill 市场！',
      fixHint: '移除明文密钥，改用环境变量占位符（如 $API_TOKEN）。',
    });
  } else {
    results.push({
      ruleId: 'secret-scan',
      title: '敏感凭据与密钥泄露扫描',
      severity: 'pass',
      detail: '未检测到硬编码密钥、Token 或私钥。',
    });
  }

  return results;
}

export function generateCodeownersFile(skills: AgentSkill[]): string {
  const domainMap = new Map<string, Set<string>>();
  for (const s of skills) {
    if (s.tier === 'domain') {
      const owners = domainMap.get(s.domain) || new Set<string>();
      owners.add(s.owner || `@${s.domain}-leads`);
      domainMap.set(s.domain, owners);
    }
  }

  const lines = [
    '# Skill Marketplace CODEOWNERS (Generated by Skill Workshop)',
    '# 全局默认层与核心层需 AI 平台团队审批，业务域层由各团队自治合并',
    '',
    '/always-on/   @ai-platform-team',
    '/core/        @ai-platform-team @staff-reviewers',
    '/.github/     @ai-platform-team',
    '/scripts/     @ai-platform-team',
    '/plugins.json @ai-platform-team',
    '',
    '# 业务域自治目录 (Domain Tier)',
  ];

  for (const [domain, owners] of domainMap.entries()) {
    lines.push(`/domains/${domain}/   ${Array.from(owners).join(' ')}`);
  }

  return lines.join('\n') + '\n';
}

export function generatePluginsJson(skills: AgentSkill[]): string {
  const plugins = [
    {
      name: 'enterprise-baseline',
      description: 'Default always-on skills synced automatically for all engineers',
      skills: skills
        .filter((s) => s.tier === 'always-on')
        .map((s) => `always-on/${s.name}`),
    },
    {
      name: 'core-sdlc-pack',
      description: 'Platform-verified core SDLC skills (CI triage, PR security review)',
      skills: skills
        .filter((s) => s.tier === 'core')
        .map((s) => `core/${s.name}`),
    },
  ];

  const domains = Array.from(
    new Set(skills.filter((s) => s.tier === 'domain').map((s) => s.domain))
  );
  for (const dom of domains) {
    plugins.push({
      name: `domain-${dom}`,
      description: `Domain-autonomous skills for ${dom}`,
      skills: skills
        .filter((s) => s.tier === 'domain' && s.domain === dom)
        .map((s) => `domains/${dom}/${s.name}`),
    });
  }

  return JSON.stringify({ version: 1, plugins }, null, 2) + '\n';
}

export function generateCiRunnerScript(): string {
  return `#!/usr/bin/env node
// Unified CI Skill Linter matching Skill Workshop's 8 deterministic rules
import fs from 'node:fs';
import path from 'node:path';

function walkSkillFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSkillFiles(full, out);
    else if (entry.name === 'SKILL.md') out.push(full);
  }
  return out;
}

const files = walkSkillFiles(process.cwd());
let errors = 0;

for (const file of files) {
  const rel = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8').replace(/\\r\\n/g, '\\n');
  const lines = content.split('\\n');

  if (lines[0]?.trim() !== '---') {
    console.error(\`ERROR [\${rel}]: Missing YAML frontmatter\`);
    errors++;
    continue;
  }
  const endIdx = lines.slice(1).findIndex((l) => l.trim() === '---');
  if (endIdx === -1) {
    console.error(\`ERROR [\${rel}]: Unclosed YAML frontmatter\`);
    errors++;
    continue;
  }

  const fm = lines.slice(1, endIdx + 1).join('\\n');
  const body = lines.slice(endIdx + 2).join('\\n');
  const bodyLines = body ? body.split('\\n').length : 0;

  if (!/^name:\\s*["']?[a-z0-9]+(-[a-z0-9]+)*["']?\\s*$/m.test(fm)) {
    console.error(\`ERROR [\${rel}]: Invalid or missing lowercase-kebab-case name\`);
    errors++;
  }
  if (!/^description:/m.test(fm)) {
    console.error(\`ERROR [\${rel}]: Missing description in frontmatter\`);
    errors++;
  }
  if (bodyLines > 500) {
    console.error(\`ERROR [\${rel}]: Body exceeds 500-line limit (\${bodyLines} lines)\`);
    errors++;
  }
  if (/(AIza[0-9A-Za-z\\-_]{20,}|sk-[0-9A-Za-z]{20,}|ghp_[0-9A-Za-z]{20,})/.test(content)) {
    console.error(\`ERROR [\${rel}]: Potential hardcoded secret detected\`);
    errors++;
  }
  if (!/(^|\\n)\\s*(1\\.|步骤\\s*1|Step\\s*1)/im.test(body)) {
    console.warn(\`WARN  [\${rel}]: Missing numbered workflow steps\`);
  }
  if (!/verify|verification|validate|check|lint|test|验证|核对|自检|检查/i.test(body)) {
    console.warn(\`WARN  [\${rel}]: Missing verification step\`);
  }
}

console.log(\`Checked \${files.length} SKILL.md files with \${errors} blocking errors.\`);
process.exit(errors > 0 ? 1 : 0);
`;
}

export function generateCiWorkflowYaml(): string {
  return `name: Skill Marketplace CI Linter

on:
  pull_request:
    paths:
      - 'always-on/**'
      - 'core/**'
      - 'domains/**'
      - 'plugins.json'

jobs:
  lint-skills:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Run Unified Skill Linter
        run: node scripts/lint-skills.mjs
`;
}

export function generateSyncScript(skills: AgentSkill[]): string {
  const alwaysOnNames = skills
    .filter((s) => s.tier === 'always-on')
    .map((s) => `  "always-on/${s.name}"`);
  const coreNames = skills
    .filter((s) => s.tier === 'core')
    .map((s) => `  "core/${s.name}"`);

  return `#!/usr/bin/env bash
# 本地跨工具 Skill 同步脚本 (支持 Claude Code / Cursor / Codex / .agents)
set -euo pipefail

MARKETPLACE_DIR="\${SKILL_MARKETPLACE_DIR:-$HOME/.company-skills}"
TARGETS=("$HOME/.claude/skills" "$HOME/.agents/skills" "$HOME/.cursor/skills")

DEFAULT_SKILLS=(
${[...alwaysOnNames, ...coreNames].join('\n')}
)

for target in "\${TARGETS[@]}"; do
  mkdir -p "$target"
  for rel_path in "\${DEFAULT_SKILLS[@]}"; do
    skill_name=$(basename "$rel_path")
    src="$MARKETPLACE_DIR/$rel_path"
    if [ -d "$src" ]; then
      ln -sfn "$src" "$target/$skill_name"
    fi
  done
done

echo "Synced \${#DEFAULT_SKILLS[@]} skills across local AI agent tools."
`;
}
