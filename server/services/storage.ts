import fs from 'node:fs';
import path from 'node:path';
import type { AgentSkill } from '../../shared/types.ts';
import { SEED_SKILLS } from '../../src/data/seedSkills.ts';

const STORE_ROOT = path.resolve(process.cwd(), '.workshop-store');
const SKILLS_DIR = path.resolve(STORE_ROOT, 'skills');

function ensureStoreDirs() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function resolveSkillFilePath(skillId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,96}$/.test(skillId)) {
    throw new Error('Invalid skill ID format.');
  }
  const resolved = path.resolve(SKILLS_DIR, `${skillId}.json`);
  if (!resolved.startsWith(SKILLS_DIR + path.sep)) {
    throw new Error('Path traversal blocked.');
  }
  return resolved;
}

function normalizeSkill(raw: Partial<AgentSkill>): AgentSkill {
  return {
    id: raw.id || `skill-${Date.now()}`,
    name: raw.name || 'untitled-skill',
    title: raw.title || '未命名 Skill',
    description: raw.description || '',
    tier: raw.tier || 'domain',
    domain: raw.domain || 'general',
    owner: raw.owner || '@eng-team',
    version: raw.version || '0.1.0',
    updatedAt: raw.updatedAt || new Date().toISOString().slice(0, 10),
    spec: raw.spec || {
      goal: '',
      whenToTrigger: '',
      whenNotToTrigger: '',
      steps: '',
      tooling: '',
      verification: '',
      targetAgent: 'Claude Code / Cursor',
    },
    skillMd: raw.skillMd || '',
    auxFiles: Array.isArray(raw.auxFiles) ? raw.auxFiles : [],
    evalCases: Array.isArray(raw.evalCases) ? raw.evalCases : [],
    evalHistory: Array.isArray(raw.evalHistory) ? raw.evalHistory : [],
    suiteHistory: Array.isArray(raw.suiteHistory) ? raw.suiteHistory : [],
    revisions: Array.isArray(raw.revisions) ? raw.revisions : [],
    telemetry: raw.telemetry || {
      monthlyInvocations: 0,
      weeklyActiveUsers: 0,
      retentionRate: 0,
      coUseTopSkill: '—',
      avgCostUsd: 0.01,
      p50LatencyMs: 1000,
      errorRate: 0,
      ablationLiftPct: 0,
    },
  };
}

export function listSkills(): AgentSkill[] {
  ensureStoreDirs();
  const entries = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.json'));

  if (entries.length === 0) {
    // Bootstrap from seed skills on first run
    for (const seed of SEED_SKILLS) {
      saveSkill(seed);
    }
    return SEED_SKILLS.map((s) => normalizeSkill(s));
  }

  const skills: AgentSkill[] = [];
  for (const file of entries) {
    try {
      const fullPath = path.resolve(SKILLS_DIR, file);
      if (!fullPath.startsWith(SKILLS_DIR + path.sep)) continue;
      const parsed = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
      skills.push(normalizeSkill(parsed));
    } catch (err) {
      console.error(`Skipping corrupted skill file ${file}:`, err);
    }
  }

  return skills.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSkillById(skillId: string): AgentSkill | null {
  ensureStoreDirs();
  const filePath = resolveSkillFilePath(skillId);
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return normalizeSkill(parsed);
}

export function saveSkill(skill: AgentSkill): AgentSkill {
  ensureStoreDirs();
  const normalized = normalizeSkill(skill);
  const filePath = resolveSkillFilePath(normalized.id);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(normalized, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
  return normalized;
}

export function deleteSkillById(skillId: string): boolean {
  ensureStoreDirs();
  const filePath = resolveSkillFilePath(skillId);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}
