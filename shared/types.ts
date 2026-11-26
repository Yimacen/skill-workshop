export type SkillTier = 'always-on' | 'core' | 'domain';

export type SkillFileKind = 'reference' | 'script' | 'asset';

export type ReasoningProfile =
  | 'fast'
  | 'balanced'
  | 'deep'
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | 'openai-compatible';

export interface ModelOption {
  id: ReasoningProfile;
  provider: 'gemini' | 'deepseek' | 'openai-compatible';
  label: string;
  model: string;
  configured: boolean;
  missingEnvHint?: string;
}

export interface SkillAuxFile {
  id: string;
  path: string;
  kind: SkillFileKind;
  content: string;
}

export interface SkillSpec {
  goal: string;
  whenToTrigger: string;
  whenNotToTrigger: string;
  steps: string;
  tooling: string;
  verification: string;
  targetAgent: string;
}

export interface EvalCase {
  id: string;
  prompt: string;
  expectedBehavior: string;
  shouldTrigger: boolean;
  category: 'positive' | 'negative' | 'papercut';
  lastResult?: 'pass' | 'fail' | 'untested';
}

export interface EvalRunRecord {
  id: string;
  timestamp: string;
  profile: ReasoningProfile;
  prompt: string;
  baselineOutput: string;
  withSkillOutput: string;
  baselineTokens: number;
  withSkillTokens: number;
  baselineLatencyMs: number;
  withSkillLatencyMs: number;
  judgeVerdict: 'improved' | 'neutral' | 'regressed';
  outcomeScore: number;
  processScore: number;
  judgeSummary: string;
}

export interface BatchEvalCaseOutcome {
  caseId: string;
  prompt: string;
  category: string;
  shouldTrigger: boolean;
  selectedSkill: string;
  triggerPassed: boolean;
  ablationVerdict: 'improved' | 'neutral' | 'regressed' | 'skipped';
  outcomeScore: number;
  processScore: number;
  tokenDelta: number;
  latencyMs: number;
  summary: string;
}

export interface BatchEvalSuiteRecord {
  id: string;
  timestamp: string;
  profile: ReasoningProfile;
  totalCases: number;
  triggerPassCount: number;
  ablationImprovedCount: number;
  overallPassRate: number;
  avgLatencyMs: number;
  avgTokenDelta: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  outcomes: BatchEvalCaseOutcome[];
}

export interface ModelComparisonCaseOutcome {
  caseId: string;
  prompt: string;
  shouldTrigger: boolean;
  baselinePassed: boolean;
  candidatePassed: boolean;
  baselineScore: number;
  candidateScore: number;
  baselineTokens: number;
  candidateTokens: number;
  baselineLatencyMs: number;
  candidateLatencyMs: number;
}

export interface ModelComparisonReport {
  id: string;
  timestamp: string;
  baselineProfile: ReasoningProfile;
  candidateProfile: ReasoningProfile;
  baselineLabel: string;
  candidateLabel: string;
  totalCases: number;
  baselinePassRate: number;
  candidatePassRate: number;
  passRateDeltaPct: number;
  baselineTotalTokens: number;
  candidateTotalTokens: number;
  baselineCostUsd: number;
  candidateCostUsd: number;
  costSavingsPct: number;
  avgLatencyDeltaMs: number;
  recommendation: 'safe-to-downgrade' | 'tradeoff-warning' | 'keep-baseline';
  summary: string;
  caseComparisons: ModelComparisonCaseOutcome[];
}

export interface SkillRevision {
  id: string;
  timestamp: string;
  source:
    | 'manual'
    | 'compile'
    | 'recompile'
    | 'ai-lint'
    | 'compress'
    | 'papercut'
    | 'rollback';
  note: string;
  skillMd: string;
}

export interface SkillTelemetry {
  monthlyInvocations: number;
  weeklyActiveUsers: number;
  retentionRate: number;
  coUseTopSkill: string;
  avgCostUsd: number;
  p50LatencyMs: number;
  errorRate: number;
  ablationLiftPct: number;
}

export interface TelemetryEvent {
  id: string;
  timestamp: string;
  skillId: string;
  skillName: string;
  eventType:
    | 'compile'
    | 'recompile'
    | 'lint_ai'
    | 'compress'
    | 'eval_trigger'
    | 'eval_ablation'
    | 'eval_batch'
    | 'model_compare'
    | 'improve';
  profile: ReasoningProfile;
  success: boolean;
  latencyMs: number;
  tokens: number;
  costUsd: number;
  detail: string;
}

export interface AgentSkill {
  id: string;
  name: string;
  title: string;
  description: string;
  tier: SkillTier;
  domain: string;
  owner: string;
  version: string;
  updatedAt: string;
  spec: SkillSpec;
  skillMd: string;
  auxFiles: SkillAuxFile[];
  evalCases: EvalCase[];
  evalHistory: EvalRunRecord[];
  suiteHistory: BatchEvalSuiteRecord[];
  modelComparisonHistory?: ModelComparisonReport[];
  revisions: SkillRevision[];
  telemetry: SkillTelemetry;
}

export type LintSeverity = 'error' | 'warning' | 'pass';

export interface LintCheckResult {
  ruleId: string;
  title: string;
  severity: LintSeverity;
  detail: string;
  line?: number;
  fixHint?: string;
}

export interface ProgressiveDisclosureMetrics {
  frontmatterLines: number;
  frontmatterTokensEst: number;
  bodyLines: number;
  bodyTokensEst: number;
  auxFilesCount: number;
  auxTotalBytes: number;
  hasValidFrontmatter: boolean;
  parsedName: string;
  parsedDescription: string;
}

export type WorkshopTab =
  | 'guide'
  | 'marketplace'
  | 'author'
  | 'linter'
  | 'eval'
  | 'telemetry';
