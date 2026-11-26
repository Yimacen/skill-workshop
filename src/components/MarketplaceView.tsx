import { useMemo, useState } from 'react';
import {
  Download,
  FolderGit2,
  Plus,
  Search,
  Terminal,
  Copy,
  Check,
  Trash2,
} from 'lucide-react';
import type { AgentSkill, SkillTier } from '../types/skill';
import {
  computeProgressiveDisclosure,
  runSkillLinter,
} from '../utils/skillLinter';
import { exportMarketplaceRepoZip } from '../utils/exportZip';

interface MarketplaceViewProps {
  skills: AgentSkill[];
  activeSkillId: string;
  onSelectSkill: (skillId: string) => void;
  onOpenAuthor: (skillId?: string) => void;
  onCreateNewSkill: () => void;
  onDeleteSkill: (skillId: string) => void;
}

const TIER_LABELS: Record<'all' | SkillTier, string> = {
  all: '全部层级',
  'always-on': 'Always-on 全局层',
  core: 'Core 核心层',
  domain: 'Domain 业务域',
};

export function MarketplaceView({
  skills,
  activeSkillId,
  onSelectSkill,
  onOpenAuthor,
  onCreateNewSkill,
  onDeleteSkill,
}: MarketplaceViewProps) {
  const [tierFilter, setTierFilter] = useState<'all' | SkillTier>('all');
  const [query, setQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportingRepo, setExportingRepo] = useState(false);

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (tierFilter !== 'all' && s.tier !== tierFilter) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.domain.toLowerCase().includes(q) ||
        s.owner.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    });
  }, [skills, tierFilter, query]);

  const stats = useMemo(() => {
    const totalInvocations = skills.reduce(
      (sum, s) => sum + s.telemetry.monthlyInvocations,
      0
    );
    const healthyCount = skills.filter((s) => {
      const checks = runSkillLinter(s);
      return checks.every((c) => c.severity !== 'error');
    }).length;
    return {
      total: skills.length,
      alwaysOn: skills.filter((s) => s.tier === 'always-on').length,
      core: skills.filter((s) => s.tier === 'core').length,
      domain: skills.filter((s) => s.tier === 'domain').length,
      healthyCount,
      totalInvocations,
    };
  }, [skills]);

  const handleCopyCli = async (skill: AgentSkill) => {
    const cmd = `aifx skill add ${skill.tier}/${skill.name}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedId(skill.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleExportRepo = async () => {
    setExportingRepo(true);
    try {
      await exportMarketplaceRepoZip(skills);
    } finally {
      setExportingRepo(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">市场 Skill 总数</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.total}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            Always-on {stats.alwaysOn} · Core {stats.core} · Domain {stats.domain}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">Linter 合规通过</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.healthyCount} / {stats.total}
          </div>
          <div className="mt-1 text-xs text-emerald-700">
            均符合 500 行与 Frontmatter 规范
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-xs font-medium text-slate-500">月度累计调用</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.totalInvocations.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            覆盖 Claude Code · Cursor · Cloud Agent
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">Git Monorepo 导出</div>
            <div className="mt-1 text-xs text-slate-600">
              含 CODEOWNERS、CI Linter 与 sync 脚本
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportRepo}
            disabled={exportingRepo}
            className="mt-3 inline-flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exportingRepo ? '打包中...' : '导出 Git 仓库包 (.zip)'}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(['all', 'always-on', 'core', 'domain'] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setTierFilter(tier)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tierFilter === tier
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {TIER_LABELS[tier]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 Skill 名称、域或 Owner..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={onCreateNewSkill}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            新建 Skill
          </button>
        </div>
      </div>

      {/* Skill Directory Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filteredSkills.length === 0 ? (
          <div className="p-12 text-center">
            <FolderGit2 className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="mt-3 text-sm font-medium text-slate-900">
              未找到匹配的 Skill
            </div>
            <div className="mt-1 text-xs text-slate-500">
              尝试清空筛选条件，或使用 Spec 编译器创建一个新的 Skill。
            </div>
            <button
              type="button"
              onClick={onCreateNewSkill}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              新建 Skill
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Skill 标识与 Git 路径</th>
                  <th className="py-2.5 px-4">层级 / Owner</th>
                  <th className="py-2.5 px-4 text-right">正文行数</th>
                  <th className="py-2.5 px-4 text-right">L1 Tokens</th>
                  <th className="py-2.5 px-4">Linter 状态</th>
                  <th className="py-2.5 px-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSkills.map((skill) => {
                  const pd = computeProgressiveDisclosure(skill);
                  const lints = runSkillLinter(skill);
                  const errCount = lints.filter((l) => l.severity === 'error').length;
                  const warnCount = lints.filter((l) => l.severity === 'warning').length;
                  const isActive = skill.id === activeSkillId;
                  const gitPath =
                    skill.tier === 'always-on'
                      ? `always-on/${skill.name}`
                      : skill.tier === 'core'
                        ? `core/${skill.name}`
                        : `domains/${skill.domain}/${skill.name}`;

                  return (
                    <tr
                      key={skill.id}
                      onClick={() => onSelectSkill(skill.id)}
                      className={`transition-colors cursor-pointer ${
                        isActive ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">
                          {skill.title}
                        </div>
                        <div className="mt-0.5 text-xs font-mono text-slate-500">
                          {gitPath}/SKILL.md
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs text-slate-700">
                          <span>{skill.tier}</span>
                          <span className="mx-1.5 text-slate-300">·</span>
                          <span className="font-mono">{skill.owner}</span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400 tabular-nums">
                          v{skill.version} · {skill.auxFiles.length} 个附属文件
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums">
                        <span
                          className={
                            pd.bodyLines > 500
                              ? 'text-red-600 font-semibold'
                              : pd.bodyLines > 380
                                ? 'text-amber-600 font-medium'
                                : 'text-slate-700'
                          }
                        >
                          {pd.bodyLines} / 500
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 tabular-nums">
                        ~{pd.frontmatterTokensEst}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {errCount > 0 ? (
                          <span className="text-red-600 font-medium">
                            未通过 · {errCount} 错误
                          </span>
                        ) : warnCount > 0 ? (
                          <span className="text-amber-700 font-medium">
                            通过 · {warnCount} 警告
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">
                            健康 · 全部通过
                          </span>
                        )}
                      </td>
                      <td
                        className="py-3 px-4 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyCli(skill)}
                            title="复制 aifx 安装命令"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {copiedId === skill.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                已复制
                              </>
                            ) : (
                              <>
                                <Terminal className="w-3 h-3" />
                                aifx add
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenAuthor(skill.id)}
                            className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            打开编辑
                          </button>
                          {skills.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onDeleteSkill(skill.id)}
                              title="删除 Skill"
                              className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Active Skill CLI & Metadata Quick Inspect */}
      {skills.find((s) => s.id === activeSkillId) && (() => {
        const active = skills.find((s) => s.id === activeSkillId)!;
        const installCmd = `aifx skill add ${active.tier}/${active.name}`;
        return (
          <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 max-w-2xl">
              <div className="text-xs font-medium text-slate-500">
                当前选中 Skill · Layer 1 常驻触发描述
              </div>
              <div className="text-sm font-semibold text-slate-900">
                {active.title} ({active.name})
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {active.description}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="px-3 py-2 bg-slate-900 text-slate-100 rounded-md font-mono text-xs flex items-center gap-2">
                <span>$ {installCmd}</span>
                <button
                  type="button"
                  onClick={() => handleCopyCli(active)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                  aria-label="复制安装命令"
                >
                  {copiedId === active.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
