import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderGit2,
  Hammer,
  ShieldCheck,
  FlaskConical,
  BarChart3,
  Plus,
  Menu,
  X,
  BookOpen,
} from 'lucide-react';
import type { AgentSkill, ModelOption, WorkshopTab } from './types/skill';
import { SEED_SKILLS } from './data/seedSkills';
import { MarketplaceView } from './components/MarketplaceView';
import { AuthorCompileView } from './components/AuthorCompileView';
import { LinterView } from './components/LinterView';
import { EvalLabView } from './components/EvalLabView';
import { TelemetryGitView } from './components/TelemetryGitView';
import { GuideView } from './components/GuideView';
import { runSkillLinter } from './utils/skillLinter';

const NAV_ITEMS: { id: WorkshopTab; label: string; icon: typeof FolderGit2 }[] = [
  { id: 'marketplace', label: 'Skill 市场与仓库', icon: FolderGit2 },
  { id: 'author', label: 'Spec 编译与编辑', icon: Hammer },
  { id: 'linter', label: 'Skill Linter 体检', icon: ShieldCheck },
  { id: 'eval', label: 'Eval 消融实验室', icon: FlaskConical },
  { id: 'telemetry', label: '可观测与 Git 治理', icon: BarChart3 },
  { id: 'guide', label: '新手使用指南', icon: BookOpen },
];

export default function App() {
  const [skills, setSkills] = useState<AgentSkill[]>(SEED_SKILLS);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([
    {
      id: 'fast',
      provider: 'gemini',
      label: 'Gemini 4 Hydrogen · Fast (Low Thinking)',
      model: 'gemini-4-hydrogen',
      configured: true,
    },
    {
      id: 'deepseek-chat',
      provider: 'deepseek',
      label: 'DeepSeek Chat (V3)',
      model: 'deepseek-chat',
      configured: false,
      missingEnvHint: '请在 Secrets 中配置 DEEPSEEK_API_KEY',
    },
    {
      id: 'deepseek-reasoner',
      provider: 'deepseek',
      label: 'DeepSeek Reasoner (R1)',
      model: 'deepseek-reasoner',
      configured: false,
      missingEnvHint: '请在 Secrets 中配置 DEEPSEEK_API_KEY',
    },
  ]);
  const [activeSkillId, setActiveSkillId] = useState<string>(SEED_SKILLS[0].id);
  const [activeTab, setActiveTab] = useState<WorkshopTab>('marketplace');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loadingWorkspace, setLoadingWorkspace] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSkillsFromServer = async () => {
    try {
      const [skillsResp, modelsResp] = await Promise.all([
        fetch('/api/skills'),
        fetch('/api/models'),
      ]);
      if (skillsResp.ok) {
        const data = await skillsResp.json();
        if (Array.isArray(data.skills) && data.skills.length > 0) {
          setSkills(data.skills);
          setActiveSkillId((prev) =>
            data.skills.some((s: AgentSkill) => s.id === prev)
              ? prev
              : data.skills[0].id
          );
        }
      }
      if (modelsResp.ok) {
        const modelData = await modelsResp.json();
        if (Array.isArray(modelData.models) && modelData.models.length > 0) {
          setModelOptions(modelData.models);
        }
      }
    } catch {
      // keep fallback seed in memory if server unreachable
    } finally {
      setLoadingWorkspace(false);
    }
  };

  useEffect(() => {
    loadSkillsFromServer();
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const persistSingleSkill = async (skill: AgentSkill) => {
    setSaveState('saving');
    try {
      const resp = await fetch(`/api/skills/${encodeURIComponent(skill.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(skill),
      });
      if (!resp.ok) throw new Error('Save failed');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1400);
    } catch {
      setSaveState('error');
    }
  };

  const handleUpdateSkill = (updated: AgentSkill, immediate = false) => {
    setSkills((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (immediate) {
      persistSingleSkill(updated);
    } else {
      setSaveState('saving');
      debounceTimerRef.current = setTimeout(() => {
        persistSingleSkill(updated);
      }, 450);
    }
  };

  const activeSkill = useMemo(
    () => skills.find((s) => s.id === activeSkillId) || skills[0],
    [skills, activeSkillId]
  );

  const activeLintSummary = useMemo(() => {
    if (!activeSkill) return { errors: 0, warnings: 0 };
    const checks = runSkillLinter(activeSkill);
    return {
      errors: checks.filter((c) => c.severity === 'error').length,
      warnings: checks.filter((c) => c.severity === 'warning').length,
    };
  }, [activeSkill]);

  const handleCreateNewSkill = async () => {
    const num = skills.length + 1;
    const newSkill: AgentSkill = {
      id: `skill-custom-${Date.now()}`,
      name: `custom-workflow-${num}`,
      title: `新建自定义 Skill ${num}`,
      description:
        'Describe what this skill does and when an agent should trigger it.',
      tier: 'domain',
      domain: 'general',
      owner: '@eng-team',
      version: '0.1.0',
      updatedAt: new Date().toISOString().slice(0, 10),
      spec: {
        goal: '',
        whenToTrigger: '',
        whenNotToTrigger: '',
        steps:
          '1. 分析上下文与输入要求。\n2. 按规范执行核心操作。\n3. 运行验证命令确认结果正确。',
        tooling: '',
        verification: '核对最终输出是否符合预期并无错误。',
        targetAgent: 'Claude Code / Cursor / Codex',
      },
      skillMd: `---
name: "custom-workflow-${num}"
description: >
  Describe what this skill does and when an agent should trigger it.
---

# 新建自定义 Skill ${num}

## 执行步骤

1. 分析当前任务上下文与输入边界。
2. 按预期流程执行核心步骤。
3. 执行自检与验证，确认交付完整无误。
`,
      auxFiles: [],
      evalCases: [],
      evalHistory: [],
      suiteHistory: [],
      revisions: [],
      telemetry: {
        monthlyInvocations: 0,
        weeklyActiveUsers: 0,
        retentionRate: 0,
        coUseTopSkill: '—',
        avgCostUsd: 0.012,
        p50LatencyMs: 1100,
        errorRate: 0,
        ablationLiftPct: 0,
      },
    };

    setSkills((prev) => [newSkill, ...prev]);
    setActiveSkillId(newSkill.id);
    setActiveTab('author');
    await persistSingleSkill(newSkill);
  };

  const handleDeleteSkill = async (id: string) => {
    if (skills.length <= 1) return;
    const next = skills.filter((s) => s.id !== id);
    setSkills(next);
    if (activeSkillId === id) {
      setActiveSkillId(next[0].id);
    }
    try {
      await fetch(`/api/skills/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // ignore
    }
  };

  const currentNavLabel =
    NAV_ITEMS.find((item) => item.id === activeTab)?.label || '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
        <div className="h-14 px-5 flex items-center border-b border-slate-200">
          <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            Skill Workshop
          </span>
        </div>

        <div className="p-4 border-b border-slate-100">
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            当前工作区 Skill
          </label>
          <select
            value={activeSkill?.id || ''}
            onChange={(e) => setActiveSkillId(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:border-blue-600"
          >
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.tier})
              </option>
            ))}
          </select>
          <div className="mt-2 text-[11px] text-slate-500 truncate">
            {activeSkill?.title}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.id === 'linter' && activeLintSummary.errors > 0 && (
                  <span className="font-mono text-[11px] text-red-600 tabular-nums">
                    {activeLintSummary.errors}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <div className="font-medium text-slate-700">
            Build · Run · Measure · Eval · Improve
          </div>
          <div>开放标准 agentskills.io · 正文限 500 行</div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 bg-white h-full border-r border-slate-200 flex flex-col z-50">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200">
              <span className="text-base font-bold text-slate-900">
                Skill Workshop
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md cursor-pointer ${
                      activeTab === item.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-8 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
              aria-label="打开菜单"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="font-medium text-slate-500 whitespace-nowrap">
                Skill Workshop
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                {currentNavLabel}
              </span>
              {activeSkill &&
                activeTab !== 'marketplace' &&
                activeTab !== 'telemetry' && (
                  <>
                    <span className="text-slate-300 hidden sm:inline">/</span>
                    <span className="font-mono text-xs text-slate-600 truncate hidden sm:inline">
                      {activeSkill.name}
                    </span>
                  </>
                )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {saveState === 'saving' && (
              <span className="text-xs text-slate-400 whitespace-nowrap">
                保存中...
              </span>
            )}
            {saveState === 'saved' && (
              <span className="text-xs text-emerald-700 whitespace-nowrap">
                已保存至服务端
              </span>
            )}
            {saveState === 'error' && (
              <span className="text-xs text-red-600 whitespace-nowrap">
                保存失败
              </span>
            )}
            <button
              type="button"
              onClick={handleCreateNewSkill}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              新建 Skill
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {loadingWorkspace ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-4">
              <div className="h-5 w-48 bg-slate-100 rounded" />
              <div className="h-32 w-full bg-slate-50 rounded" />
            </div>
          ) : (
            <>
              {activeTab === 'marketplace' && (
                <MarketplaceView
                  skills={skills}
                  activeSkillId={activeSkill?.id || ''}
                  onSelectSkill={(id) => setActiveSkillId(id)}
                  onOpenAuthor={(id) => {
                    if (id) setActiveSkillId(id);
                    setActiveTab('author');
                  }}
                  onCreateNewSkill={handleCreateNewSkill}
                  onDeleteSkill={handleDeleteSkill}
                />
              )}

              {activeTab === 'author' && activeSkill && (
                <AuthorCompileView
                  skill={activeSkill}
                  models={modelOptions}
                  onUpdateSkill={handleUpdateSkill}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                />
              )}

              {activeTab === 'linter' && activeSkill && (
                <LinterView
                  skill={activeSkill}
                  models={modelOptions}
                  onUpdateSkill={handleUpdateSkill}
                />
              )}

              {activeTab === 'eval' && activeSkill && (
                <EvalLabView
                  skill={activeSkill}
                  allSkills={skills}
                  models={modelOptions}
                  onUpdateSkill={handleUpdateSkill}
                />
              )}

              {activeTab === 'telemetry' && (
                <TelemetryGitView skills={skills} />
              )}

              {activeTab === 'guide' && (
                <GuideView
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onCreateNewSkill={handleCreateNewSkill}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
