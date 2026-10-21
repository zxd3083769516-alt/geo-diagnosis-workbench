'use client';
/* oxlint-disable jsx-a11y/control-has-associated-label -- table headers identify the editable task cells */

import { useState } from 'react';
import { ArrowLeft, Download, LoaderCircle, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { OptimizationPlan, PlanStatus } from '@/lib/optimization-plan';

type Props = {
  plan: OptimizationPlan | null;
  busy: boolean;
  stale: boolean;
  completed: number;
  expected: number;
  message: { type: 'success' | 'error'; text: string } | null;
  onGenerate: () => void;
  onSave: (plan: OptimizationPlan) => void;
  onBack: () => void;
  onExport: () => void;
};

const statusOptions: PlanStatus[] = ['待处理', '进行中', '已完成'];
const clone = (plan: OptimizationPlan) => JSON.parse(JSON.stringify(plan)) as OptimizationPlan;
const fieldClass = 'bg-white read-only:border-transparent read-only:bg-slate-50 read-only:shadow-none';

export function OptimizationPlanWorkspace({ plan, busy, stale, completed, expected, message, onGenerate, onSave, onBack, onExport }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OptimizationPlan | null>(plan ? clone(plan) : null);

  const current = editing ? draft : plan;
  const startEditing = () => { if (plan) { setDraft(clone(plan)); setEditing(true); } };
  const cancelEditing = () => { setDraft(plan ? clone(plan) : null); setEditing(false); };
  const save = () => {
    if (!draft) return;
    onSave({ ...draft, lastEditedAt: new Date().toISOString() });
    setEditing(false);
  };
  const regenerate = () => {
    if (plan?.lastEditedAt && !window.confirm('重新生成会替换当前人工修改的方案，确定继续吗？')) return;
    setEditing(false);
    onGenerate();
  };

  if (!current) {
    return <div className="grid min-h-[520px] place-items-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="max-w-xl"><h2 className="text-3xl font-semibold">生成初步GEO优化方案</h2><p className="mt-3 leading-7 text-slate-600">系统会依据当前诊断分数和已完成的真实AI回答，整理优先问题、内容任务、四周行动计划和复测标准。</p>{message && <p className={`mt-5 rounded-xl border p-3 text-sm ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-cyan-200 bg-cyan-50 text-cyan-900'}`}>{message.text}</p>}<div className="mt-7 flex justify-center gap-3"><Button variant="outline" onClick={onBack}><ArrowLeft />返回诊断</Button><Button disabled={busy || completed < 1} onClick={onGenerate} className="bg-cyan-500 text-[#082034] hover:bg-cyan-400">{busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{busy ? 'AI生成中…' : 'AI生成优化方案'}</Button></div></div></div>;
  }

  const readOnly = !editing;
  const updatePriority = (index: number, key: keyof OptimizationPlan['priorities'][number], value: string) => setDraft((valuePlan) => valuePlan ? ({ ...valuePlan, priorities: valuePlan.priorities.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }) : valuePlan);
  const updateContent = (index: number, key: keyof OptimizationPlan['contentTasks'][number], value: string) => setDraft((valuePlan) => valuePlan ? ({ ...valuePlan, contentTasks: valuePlan.contentTasks.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }) : valuePlan);
  const updatePhase = (index: number, key: keyof OptimizationPlan['phases'][number], value: string) => setDraft((valuePlan) => valuePlan ? ({ ...valuePlan, phases: valuePlan.phases.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }) : valuePlan);
  const updateRetest = (index: number, key: keyof OptimizationPlan['retestPlan'][number], value: string) => setDraft((valuePlan) => valuePlan ? ({ ...valuePlan, retestPlan: valuePlan.retestPlan.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }) : valuePlan);

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-2xl bg-[#10273b] p-6 text-white lg:flex-row lg:items-start lg:justify-between">
      <div className="max-w-3xl"><p className="text-sm font-semibold text-cyan-300">GEO优化方案</p><h2 className="mt-2 text-3xl font-semibold">从诊断发现转成可执行任务</h2><p className="mt-3 text-sm leading-6 text-slate-300">由 {current.generatedBy} 生成 · {new Date(current.generatedAt).toLocaleString('zh-CN')} · 依据 {completed}/{expected || completed} 条测试记录</p></div>
      <div className="flex flex-wrap gap-2">{editing ? <><Button variant="outline" onClick={cancelEditing} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">取消编辑</Button><Button onClick={save} className="bg-cyan-400 text-[#082034] hover:bg-cyan-300"><Save />保存修改</Button></> : <><Button variant="outline" onClick={startEditing} className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Pencil />编辑方案</Button><Button disabled={busy} onClick={regenerate} className="bg-cyan-400 text-[#082034] hover:bg-cyan-300">{busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}{busy ? '生成中…' : '重新生成'}</Button></>}</div>
    </div>
    {completed < expected && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">当前方案基于部分测试数据生成。完成剩余测试后请重新生成，诊断结论和任务优先级可能变化。</p>}
    {stale && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">诊断数据在方案生成后发生了变化。当前方案仍可查看和编辑，建议重新生成以使用最新结果。</p>}
    {message && <p className={`rounded-xl border p-4 text-sm ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-cyan-200 bg-cyan-50 text-cyan-900'}`}>{message.text}</p>}

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-xl font-semibold">方案摘要</h3><Textarea readOnly={readOnly} value={current.summary} onChange={(event) => setDraft((value) => value ? ({ ...value, summary: event.target.value }) : value)} className={`mt-4 min-h-28 leading-7 ${fieldClass}`} /><h4 className="mt-5 font-semibold">诊断依据</h4><Textarea readOnly={readOnly} value={current.diagnosisBasis} onChange={(event) => setDraft((value) => value ? ({ ...value, diagnosisBasis: event.target.value }) : value)} className={`mt-2 min-h-24 leading-7 ${fieldClass}`} /></section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><h3 className="text-xl font-semibold">优先改进事项</h3><p className="mt-1 text-sm text-slate-500">每一项都保留诊断证据和验收指标。</p></div>{editing && <Button variant="outline" size="sm" onClick={() => setDraft((value) => value ? ({ ...value, priorities: [...value.priorities, { id: `priority-${Date.now()}`, level: 'P1', issue: '', evidence: '', action: '', successMetric: '', status: '待处理' }] }) : value)}><Plus />新增</Button>}</div><div className="divide-y divide-slate-100">{current.priorities.map((row, index) => <div key={row.id} className="grid gap-3 p-5 lg:grid-cols-[90px_1fr_1fr_1.2fr_1fr_120px_auto]"><select disabled={readOnly} value={row.level} onChange={(event) => updatePriority(index, 'level', event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"><option>P0</option><option>P1</option><option>P2</option></select><Input readOnly={readOnly} aria-label="问题" value={row.issue} onChange={(event) => updatePriority(index, 'issue', event.target.value)} placeholder="问题" className={fieldClass} /><Input readOnly={readOnly} aria-label="证据" value={row.evidence} onChange={(event) => updatePriority(index, 'evidence', event.target.value)} placeholder="诊断证据" className={fieldClass} /><Textarea readOnly={readOnly} aria-label="动作" value={row.action} onChange={(event) => updatePriority(index, 'action', event.target.value)} placeholder="具体动作" className={`min-h-20 ${fieldClass}`} /><Textarea readOnly={readOnly} aria-label="验收指标" value={row.successMetric} onChange={(event) => updatePriority(index, 'successMetric', event.target.value)} placeholder="验收指标" className={`min-h-20 ${fieldClass}`} /><select disabled={readOnly} value={row.status} onChange={(event) => updatePriority(index, 'status', event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">{statusOptions.map((item) => <option key={item}>{item}</option>)}</select>{editing && <Button variant="ghost" size="icon" aria-label="删除优先事项" onClick={() => setDraft((value) => value ? ({ ...value, priorities: value.priorities.filter((_, rowIndex) => rowIndex !== index) }) : value)} className="text-red-600"><Trash2 /></Button>}</div>)}</div></section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 px-6 py-5"><div><h3 className="text-xl font-semibold">内容与资料任务</h3><p className="mt-1 text-sm text-slate-500">先补真实资料，再制作能回答用户问题的内容。</p></div>{editing && <Button variant="outline" size="sm" onClick={() => setDraft((value) => value ? ({ ...value, contentTasks: [...value.contentTasks, { id: `content-${Date.now()}`, topic: '', targetQuestions: '', factsNeeded: '待核实', format: '', channel: '', owner: '待分配', due: '', status: '待处理' }] }) : value)}><Plus />新增</Button>}</div><div className="overflow-x-auto"><table className="w-full min-w-[1380px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">内容主题</th><th className="px-4 py-3">目标问题</th><th className="px-4 py-3">所需事实</th><th className="px-4 py-3">形式</th><th className="px-4 py-3">发布渠道</th><th className="px-4 py-3">负责人</th><th className="px-4 py-3">截止时间</th><th className="px-4 py-3">状态</th>{editing && <th />}</tr></thead><tbody className="divide-y divide-slate-100">{current.contentTasks.map((row, index) => <tr key={row.id}>{(['topic', 'targetQuestions', 'factsNeeded', 'format', 'channel', 'owner', 'due'] as const).map((key) => <td key={key} className="px-3 py-3"><Textarea aria-label={key} readOnly={readOnly} value={row[key]} onChange={(event) => updateContent(index, key, event.target.value)} className={`min-h-20 min-w-36 ${fieldClass}`} /></td>)}<td className="px-3 py-3"><select aria-label="内容任务状态" disabled={readOnly} value={row.status} onChange={(event) => updateContent(index, 'status', event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2">{statusOptions.map((item) => <option key={item}>{item}</option>)}</select></td>{editing && <td className="px-2"><Button variant="ghost" size="icon" aria-label="删除内容任务" onClick={() => setDraft((value) => value ? ({ ...value, contentTasks: value.contentTasks.filter((_, rowIndex) => rowIndex !== index) }) : value)} className="text-red-600"><Trash2 /></Button></td>}</tr>)}</tbody></table></div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-xl font-semibold">四周行动计划</h3><p className="mt-1 text-sm text-slate-500">按周推进资料、内容、发布和复测准备。</p></div>{editing && <Button variant="outline" size="sm" onClick={() => setDraft((value) => value ? ({ ...value, phases: [...value.phases, { id: `phase-${Date.now()}`, period: '', objective: '', tasks: '', deliverable: '', status: '待处理' }] }) : value)}><Plus />新增</Button>}</div><div className="mt-5 grid gap-4 lg:grid-cols-2">{current.phases.map((row, index) => <div key={row.id} className="rounded-xl border border-slate-200 p-4"><div className="flex gap-2"><Input readOnly={readOnly} value={row.period} onChange={(event) => updatePhase(index, 'period', event.target.value)} className={`font-semibold ${fieldClass}`} /><select disabled={readOnly} value={row.status} onChange={(event) => updatePhase(index, 'status', event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 text-sm">{statusOptions.map((item) => <option key={item}>{item}</option>)}</select>{editing && <Button variant="ghost" size="icon" aria-label="删除阶段" onClick={() => setDraft((value) => value ? ({ ...value, phases: value.phases.filter((_, rowIndex) => rowIndex !== index) }) : value)} className="text-red-600"><Trash2 /></Button>}</div>{(['objective', 'tasks', 'deliverable'] as const).map((key) => <Textarea key={key} readOnly={readOnly} value={row[key]} onChange={(event) => updatePhase(index, key, event.target.value)} placeholder={key === 'objective' ? '阶段目标' : key === 'tasks' ? '具体任务' : '交付物'} className={`mt-3 min-h-20 ${fieldClass}`} />)}</div>)}</div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="text-xl font-semibold">复测计划</h3><p className="mt-1 text-sm text-slate-500">用同一批问题和同一评分规则比较优化前后。</p></div>{editing && <Button variant="outline" size="sm" onClick={() => setDraft((value) => value ? ({ ...value, retestPlan: [...value.retestPlan, { id: `retest-${Date.now()}`, timing: '', scope: '', metrics: '', passCriteria: '' }] }) : value)}><Plus />新增</Button>}</div><div className="mt-5 space-y-4">{current.retestPlan.map((row, index) => <div key={row.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-4">{(['timing', 'scope', 'metrics', 'passCriteria'] as const).map((key) => <Textarea key={key} readOnly={readOnly} value={row[key]} onChange={(event) => updateRetest(index, key, event.target.value)} placeholder={key === 'timing' ? '复测时间' : key === 'scope' ? '复测范围' : key === 'metrics' ? '对比指标' : '通过标准'} className={`min-h-20 ${fieldClass}`} />)}{editing && <Button variant="ghost" size="sm" onClick={() => setDraft((value) => value ? ({ ...value, retestPlan: value.retestPlan.filter((_, rowIndex) => rowIndex !== index) }) : value)} className="justify-self-start text-red-600"><Trash2 />删除</Button>}</div>)}</div><h4 className="mt-6 font-semibold">待核实信息与使用限制</h4><Textarea readOnly={readOnly} value={current.assumptions} onChange={(event) => setDraft((value) => value ? ({ ...value, assumptions: event.target.value }) : value)} className={`mt-2 min-h-28 leading-7 ${fieldClass}`} /></section>

    <div className="flex flex-wrap justify-between gap-3"><Button variant="outline" onClick={onBack}><ArrowLeft />返回诊断结果</Button><div className="flex gap-2">{editing && <Button onClick={save} className="bg-[#10273b] hover:bg-[#1b3b55]"><Save />保存修改</Button>}<Button variant="outline" onClick={onExport}><Download />导出完整 Excel</Button></div></div>
  </div>;
}
