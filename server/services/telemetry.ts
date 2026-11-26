import fs from 'node:fs';
import path from 'node:path';
import type { TelemetryEvent } from '../../shared/types.ts';
import { getSkillById, saveSkill } from './storage.ts';

const STORE_ROOT = path.resolve(process.cwd(), '.workshop-store');
const TELEMETRY_LOG = path.resolve(STORE_ROOT, 'telemetry.jsonl');

function ensureDir() {
  fs.mkdirSync(STORE_ROOT, { recursive: true });
}

export function appendTelemetryEvent(
  eventInput: Omit<TelemetryEvent, 'id' | 'timestamp'>
): TelemetryEvent {
  ensureDir();
  const event: TelemetryEvent = {
    ...eventInput,
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync(TELEMETRY_LOG, JSON.stringify(event) + '\n', 'utf-8');

  // Update the corresponding skill's live aggregated telemetry if stored
  try {
    if (event.skillId && /^[a-zA-Z0-9_-]{1,96}$/.test(event.skillId)) {
      const skill = getSkillById(event.skillId);
      if (skill) {
        const prevCount = Math.max(1, skill.telemetry.monthlyInvocations);
        const nextCount = skill.telemetry.monthlyInvocations + 1;
        const blendedLatency = Math.round(
          (skill.telemetry.p50LatencyMs * Math.min(prevCount, 20) +
            event.latencyMs) /
            (Math.min(prevCount, 20) + 1)
        );
        const blendedCost = Number(
          (
            (skill.telemetry.avgCostUsd * Math.min(prevCount, 20) +
              event.costUsd) /
            (Math.min(prevCount, 20) + 1)
          ).toFixed(4)
        );
        const errorIncrement = event.success ? 0 : 100;
        const blendedErrorRate = Number(
          (
            (skill.telemetry.errorRate * Math.min(prevCount, 20) +
              errorIncrement) /
            (Math.min(prevCount, 20) + 1)
          ).toFixed(1)
        );

        saveSkill({
          ...skill,
          telemetry: {
            ...skill.telemetry,
            monthlyInvocations: nextCount,
            p50LatencyMs: blendedLatency,
            avgCostUsd: blendedCost,
            errorRate: blendedErrorRate,
          },
        });
      }
    }
  } catch (err) {
    console.error('Failed to update aggregated skill telemetry:', err);
  }

  return event;
}

export function listRecentTelemetryEvents(limit = 50): TelemetryEvent[] {
  ensureDir();
  if (!fs.existsSync(TELEMETRY_LOG)) return [];
  const raw = fs.readFileSync(TELEMETRY_LOG, 'utf-8');
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const recent: TelemetryEvent[] = [];
  for (let i = lines.length - 1; i >= 0 && recent.length < limit; i--) {
    try {
      recent.push(JSON.parse(lines[i]));
    } catch {
      // skip malformed line
    }
  }
  return recent;
}
