'use client';
import { useEffect, useState } from 'react';
import { diagnosisError } from '@/lib/geo-workflows';
import { aiProviders } from '@/lib/ai-providers';
import { Button } from './ui/button';
import { splitIds, type Entity } from '@/lib/geo-model';
import { entityTitle } from './geo-editor';

export function RunPlanner({ mode, plannedQueryIds, queries, platforms, experiments, repeats, start, close }: { mode: string; plannedQueryIds: string[]; queries: Entity[]; platforms: Entity[]; experiments: Entity[]; repeats: string; start: (q: string[], p: string[], phase: string, experiment: string) => void; close: () => void }) {
  const [qids, setQids] = useState(queries.filter(q => q.current.active !== '否' && (!mode || plannedQueryIds.includes(q.id))).map(q => q.id));
  const [pids, setPids] = useState(platforms.filter(p => p.current.active === '是').map(p => p.id).slice(0, mode === 'screening' ? 1 : undefined));
  const [phase, setPhase] = useState('基线');
  const [experiment, setExperiment] = useState('');
  const error = diagnosisError(mode, qids.length, new Set(platforms.filter(p => pids.includes(p.id)).map(p => p.current.provider === 'manual' ? p.id : p.current.provider)).size);
  return <section className="geo-panel">
    <span className="geo-step">步骤 1 · 配置范围</span>
    <h2>{mode === 'screening' ? 'AI可见度初筛 · 45题单平台' : mode === 'deep' ? 'GEO深度诊断 · 100题多平台' : '选择本轮测试范围'}</h2>
    <div className="geo-form-grid">
      <label>测试问题<select multiple size={6} value={qids} onChange={e => setQids(Array.from(e.target.selectedOptions).map(o => o.value))}>{queries.filter(q => q.current.active !== '否').map(q => <option key={q.id} value={q.id}>{q.current.prompt}</option>)}</select></label>
      <label>测试平台<select multiple={mode !== 'screening'} size={6} value={mode === 'screening' ? (pids[0] || '') : pids} onChange={e => setPids(Array.from(e.target.selectedOptions).map(o => o.value))}>{platforms.map(p => <option key={p.id} value={p.id}>{p.current.name} · {p.current.channel}</option>)}</select></label>
      <label>测试阶段<select value={phase} onChange={e => setPhase(e.target.value)}><option>基线</option><option>复测</option><option>月度</option></select></label>
      <label>关联实验<select value={experiment} onChange={e => { setExperiment(e.target.value); const selected = experiments.find(x => x.id === e.target.value); if (selected) setQids(splitIds(selected.current.queryIds)); }}><option value="">不关联</option>{experiments.map(e => <option key={e.id} value={e.id}>{entityTitle(e)}</option>)}</select></label>
    </div>
    <p className="geo-subtle">按 Ctrl 多选。每题每平台 {repeats} 次，合计 {qids.length * pids.length * Number(repeats)} 次。重复次数与地区在测试协议中修改。</p>
    <div className="geo-toolbar"><output>{error}</output><Button disabled={!!error || !qids.length || !pids.length} onClick={() => start(qids, pids, phase, experiment)}>创建并开始测试</Button><Button variant="outline" onClick={close}>取消</Button></div>
  </section>;
}

export function Connections() {
  type ConnectionState = Record<string, { configured?: boolean; hint?: string }>;
  type ConnectionPayload = { providers?: ConnectionState; message?: string; error?: string; verification?: unknown };
  const [verification, setVerification] = useState<unknown>(null);
  const [keys, setKeys] = useState<Record<string, string>>({}); const [status, setStatus] = useState<ConnectionState>({}); const [message, setMessage] = useState(''); const [busy, setBusy] = useState('');
  useEffect(() => { void fetch('/api/connections', { cache: 'no-store' }).then(r => r.json() as Promise<ConnectionPayload>).then(d => { setStatus(d.providers || {}); setMessage(d.error || d.message || ''); }).catch(() => setMessage('连接状态读取失败。')); }, []);
  const manage = async (provider: string, action: string) => { setBusy(provider); try { const response = await fetch('/api/connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, action, apiKey: keys[provider] || '' }) }); const data = await response.json() as ConnectionPayload; if (action === 'test-search') setVerification(data.verification || null); if (!response.ok) throw new Error(data.error); if (data.providers) setStatus(data.providers); if (action === 'save') { const check = await fetch('/api/connections', {cache:'no-store'}); const saved = await check.json() as ConnectionPayload; if (saved.providers) setStatus(saved.providers); if (!check.ok || !saved.providers?.[provider]?.configured) throw new Error(saved.error || saved.message || '浏览器未保存密钥，请检查 Cookie 设置后重新保存。'); } if (action === 'save' || action === 'remove') setKeys(k => ({ ...k, [provider]: '' })); setMessage(data.message || '操作完成'); } catch (e) { setMessage(e instanceof Error ? e.message : '连接失败'); } finally { setBusy(''); } };
  return <section className="geo-panel"><h2>模型连接</h2><p className="geo-subtle">密钥加密保存在当前浏览器，有效期30天；过期、清除 Cookie 或换浏览器后需重新保存，密钥不进入工作区备份。API 与网页表现分别分析。OpenAI与Moonshot需各自的API密钥；Kimi接入国内站。已有网页平台可用上方按钮另建API平台。</p>{Object.entries(aiProviders).map(([id, { name, model }]) => <div className="geo-connection" key={id}><strong>{name}<small className="block geo-subtle">{model}</small></strong><span>{status[id]?.configured ? `已配置 ${status[id].hint}` : '未配置'}</span><input aria-label={`${name} API Key`} type="password" autoComplete="off" value={keys[id] || ''} onChange={e => setKeys(k => ({ ...k, [id]: e.target.value }))} placeholder="输入新密钥" /><Button variant="outline" disabled={Boolean(busy)} onClick={() => void manage(id, 'save')}>保存</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void manage(id, 'test')}>测试连接</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void manage(id, 'test-search')}>{busy === id ? '处理中…' : '验证联网'}</Button><Button variant="ghost" disabled={Boolean(busy)} onClick={() => { if (window.confirm(`移除${name}连接？`)) void manage(id, 'remove'); }}>移除</Button></div>)}{message && <output className="geo-notice" role="status">{message}</output>}{verification != null && <details><summary>联网验证原始回答与搜索证据（不计入客户评分）</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(verification, null, 2)}</pre></details>}</section>;
}
