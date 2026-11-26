import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { runSkillLinter, computeProgressiveDisclosure } from './shared/skillLinter.ts';
import {
  deleteSkillById,
  getSkillById,
  listSkills,
  saveSkill,
} from './server/services/storage.ts';
import { listRecentTelemetryEvents } from './server/services/telemetry.ts';
import {
  compileSkillFromSpec,
  compressSkillForTokens,
  improveSkillFromPapercuts,
  lintSkillWithAi,
} from './server/services/compiler.ts';
import { getModelCatalog } from './server/services/llmGateway.ts';
import {
  runBatchEvalSuite,
  runModelTierComparison,
  runSingleAblationEval,
  runTriggerRoutingEval,
} from './server/services/evaluator.ts';

dotenv.config();

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = 3000;

function handleApiError(
  res: express.Response,
  err: unknown,
  fallbackMessage: string
) {
  console.error(fallbackMessage, err);
  const message = err instanceof Error ? err.message : fallbackMessage;
  const status =
    message.includes('API_KEY') || message.includes('Secrets')
      ? 400
      : message.includes('Invalid skill ID')
        ? 400
        : 502;
  res.status(status).json({ error: message });
}

// Read-only model provider availability (never exposes API keys)
app.get('/api/models', (_req, res) => {
  try {
    return res.json({ models: getModelCatalog() });
  } catch (err) {
    return handleApiError(res, err, 'Failed to load model catalog.');
  }
});

// Per-skill REST storage endpoints (single source of truth)
app.get('/api/skills', (_req, res) => {
  try {
    const skills = listSkills();
    return res.json({ skills });
  } catch (err) {
    return handleApiError(res, err, 'Failed to list skills.');
  }
});

app.put('/api/skills/:id', (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || payload.id !== id) {
      return res.status(400).json({ error: 'Skill payload ID mismatch.' });
    }
    const saved = saveSkill(payload);
    return res.json({ skill: saved });
  } catch (err) {
    return handleApiError(res, err, 'Failed to save skill.');
  }
});

app.delete('/api/skills/:id', (req, res) => {
  try {
    const deleted = deleteSkillById(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Skill not found.' });
    }
    return res.json({ ok: true });
  } catch (err) {
    return handleApiError(res, err, 'Failed to delete skill.');
  }
});

// Unified server-side deterministic lint endpoint (shares exact shared/skillLinter.ts logic)
app.post('/api/skills/lint', (req, res) => {
  try {
    const { name, skillMd, auxFiles } = req.body ?? {};
    if (typeof skillMd !== 'string') {
      return res.status(400).json({ error: 'skillMd is required.' });
    }
    const input = {
      name: typeof name === 'string' ? name : '',
      skillMd,
      auxFiles: Array.isArray(auxFiles) ? auxFiles : [],
    };
    return res.json({
      checks: runSkillLinter(input),
      metrics: computeProgressiveDisclosure(input),
    });
  } catch (err) {
    return handleApiError(res, err, 'Failed to run deterministic linter.');
  }
});

// Real OpenTelemetry event stream endpoint
app.get('/api/telemetry', (req, res) => {
  try {
    const rawLimit = Number(req.query.limit ?? 40);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(200, Math.max(1, rawLimit))
      : 40;
    const events = listRecentTelemetryEvents(limit);
    const skills = listSkills();
    return res.json({ events, skills });
  } catch (err) {
    return handleApiError(res, err, 'Failed to read telemetry.');
  }
});

// Compile / Recompile Spec -> SKILL.md
app.post('/api/skills/compile', async (req, res) => {
  try {
    const { skillId, name, title, tier, domain, owner, spec, profile, isRecompile } =
      req.body ?? {};
    if (!spec || typeof spec.goal !== 'string' || !spec.goal.trim()) {
      return res.status(400).json({ error: '请填写完整的 Skill 目标（Goal）后再编译。' });
    }
    const result = await compileSkillFromSpec({
      skillId,
      name,
      title,
      tier,
      domain,
      owner,
      spec,
      profile,
      isRecompile: Boolean(isRecompile),
    });
    return res.json(result);
  } catch (err) {
    return handleApiError(res, err, 'Failed to compile skill from spec.');
  }
});

// AI Semantic Linter
app.post('/api/skills/lint-ai', async (req, res) => {
  try {
    const { skillId, skillName, skillMd, auxFiles, profile } = req.body ?? {};
    if (typeof skillMd !== 'string' || !skillMd.trim()) {
      return res.status(400).json({ error: 'skillMd content is required.' });
    }
    const result = await lintSkillWithAi({
      skillId,
      skillName,
      skillMd,
      auxFiles,
      profile,
    });
    return res.json(result);
  } catch (err) {
    return handleApiError(res, err, 'Failed to run AI semantic lint.');
  }
});

// Layer 1 Trigger Routing Eval
app.post('/api/skills/eval/trigger', async (req, res) => {
  try {
    const { skillId, targetSkillName, catalog, testCases, profile } =
      req.body ?? {};
    if (!targetSkillName || !Array.isArray(catalog) || !Array.isArray(testCases)) {
      return res.status(400).json({ error: 'Invalid trigger eval payload.' });
    }
    const result = await runTriggerRoutingEval({
      skillId,
      targetSkillName,
      catalog,
      testCases,
      profile,
    });
    return res.json(result);
  } catch (err) {
    return handleApiError(res, err, 'Failed to run trigger routing evaluation.');
  }
});

// Single Ablation Eval
app.post('/api/skills/eval/ablation', async (req, res) => {
  try {
    const {
      skillId,
      skillName,
      skillMd,
      auxFiles,
      prompt: testPrompt,
      expectedBehavior,
      profile,
    } = req.body ?? {};
    if (
      typeof skillMd !== 'string' ||
      typeof testPrompt !== 'string' ||
      !testPrompt.trim()
    ) {
      return res.status(400).json({ error: 'skillMd and testPrompt are required.' });
    }
    const result = await runSingleAblationEval({
      skillId,
      skillName,
      skillMd,
      auxFiles,
      prompt: testPrompt,
      expectedBehavior,
      profile,
    });
    return res.json(result);
  } catch (err) {
    return handleApiError(res, err, 'Failed to execute ablation evaluation.');
  }
});

// Full Batch Regression Suite Eval
app.post('/api/skills/eval/batch', async (req, res) => {
  try {
    const { skillId, skillName, skillMd, auxFiles, catalog, evalCases, profile } =
      req.body ?? {};
    if (
      !skillName ||
      typeof skillMd !== 'string' ||
      !Array.isArray(catalog) ||
      !Array.isArray(evalCases) ||
      evalCases.length === 0
    ) {
      return res.status(400).json({ error: '请确保当前 Skill 至少包含 1 条测试用例。' });
    }
    const result = await runBatchEvalSuite({
      skillId,
      skillName,
      skillMd,
      auxFiles,
      catalog,
      evalCases,
      profile,
    });
    return res.json(result);
  } catch (err) {
    return handleApiError(res, err, 'Failed to execute batch evaluation suite.');
  }
});

// Cost-aware Token Compression for SKILL.md
app.post('/api/skills/compress', async (req, res) => {
  try {
    const {
      skillId,
      skillName,
      skillMd,
      auxFiles,
      targetReductionPct,
      profile,
    } = req.body ?? {};
    if (typeof skillMd !== 'string' || !skillMd.trim()) {
      return res.status(400).json({ error: 'skillMd is required.' });
    }
    const result = await compressSkillForTokens({
      skillId,
      skillName,
      skillMd,
      auxFiles,
      targetReductionPct,
      profile,
    });
    return res.json(result);
  } catch (err) {
    return handleApiError(res, err, 'Failed to compress skill tokens.');
  }
});

// Dual-model Cost vs Quality Tier Comparison Eval
app.post('/api/skills/eval/compare-models', async (req, res) => {
  try {
    const {
      skillId,
      skillName,
      skillMd,
      auxFiles,
      catalog,
      evalCases,
      baselineProfile,
      candidateProfile,
    } = req.body ?? {};
    if (
      !skillName ||
      typeof skillMd !== 'string' ||
      !Array.isArray(catalog) ||
      !Array.isArray(evalCases) ||
      evalCases.length === 0
    ) {
      return res.status(400).json({ error: '请确保当前 Skill 至少包含 1 条测试用例。' });
    }
    const result = await runModelTierComparison({
      skillId,
      skillName,
      skillMd,
      auxFiles,
      catalog,
      evalCases,
      baselineProfile,
      candidateProfile,
    });
    return res.json(result);
  } catch (err) {
    return handleApiError(res, err, 'Failed to run model tier comparison.');
  }
});

// Closed-loop Papercut Improvement
app.post('/api/skills/improve', async (req, res) => {
  try {
    const { skillId, skillName, skillMd, feedback, failedCases, profile } =
      req.body ?? {};
    if (typeof skillMd !== 'string' || !skillMd.trim()) {
      return res.status(400).json({ error: 'skillMd is required.' });
    }
    const result = await improveSkillFromPapercuts({
      skillId,
      skillName,
      skillMd,
      feedback,
      failedCases,
      profile,
    });
    return res.json(result);
  } catch (err) {
    return handleApiError(res, err, 'Failed to generate skill improvement.');
  }
});

// Safe lookup check for single skill
app.get('/api/skills/:id', (req, res) => {
  try {
    const skill = getSkillById(req.params.id);
    if (!skill) return res.status(404).json({ error: 'Skill not found.' });
    return res.json({ skill });
  } catch (err) {
    return handleApiError(res, err, 'Failed to load skill.');
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Skill Workshop server running at http://localhost:${PORT}`);
  });
}

startServer();
