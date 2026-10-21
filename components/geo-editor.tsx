'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { fields, labels } from '@/lib/geo-fields';
import { splitIds, type Entity, type Values } from '@/lib/geo-model';
export const entityTitle = (e: Entity) => e.current.title || e.current.brand || e.current.name || e.current.prompt || labels[e.kind];
export function GeoEditor({ entity, entities, onSave, onClose, onSuggest, onRestore, onAccept, busy, externalError }: { entity: Entity; entities: Entity[]; onSave: (values: Values, revision: number) => void; onClose: () => void; onSuggest: (instructions: string) => void; onRestore: (values: Values) => void; onAccept: () => void; busy: boolean; externalError?: string }) {
  const [draft, setDraft] = useState({ ...entity.current }); const [baseRevision] = useState(entity.revision); const [error, setError] = useState(''); const [instructions, setInstructions] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(entity.current);
  const close = () => { if (!dirty || window.confirm('当前内容还没有保存，确认放弃此次编辑吗？')) onClose(); };
  return <Dialog open onOpenChange={open => { if (!open) close(); }}><DialogContent showCloseButton={false} className="geo-dialog geo-editor-popup" aria-describedby={undefined}>
    <div className="geo-dialog-head"><div><p className="geo-eyebrow">{labels[entity.kind]} · v{entity.revision}</p><DialogTitle>编辑与版本记录</DialogTitle><p className="geo-id">{entity.id}</p></div><Button variant="outline" onClick={close}>关闭</Button></div>
    <div className="geo-dialog-body"><p className="geo-notice">{entity.humanEdited ? '当前版本含人工修改' : entity.origin === 'ai' ? '当前版本为 AI 建议' : entity.origin === 'rule' ? '当前版本为规则草稿' : '当前版本为迁入内容'}。新生成内容先进入候选稿，采用或恢复前会再次确认。</p>
      <form id="geo-editor-form" onSubmit={e => { e.preventDefault(); try { onSave(draft, baseRevision); } catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败'); } }} className="geo-form-grid">
        {fields[entity.kind].map(field => {
          const value = draft[field.key] || ''; const options = field.ref ? entities.filter(e => e.kind === field.ref && e.clientId === entity.clientId) : [];
          const change = (value: string) => { setError(''); setDraft(d => {
            const next = { ...d, [field.key]: value };
            if (entity.kind === 'run' && field.key === 'queryId' && entity.current.status !== '已完成') { const q = options.find(e => e.id === value); if (q) Object.assign(next, { prompt: q.current.prompt, queryWeight: q.current.weight, brandDirected: q.current.brandDirected }); }
            return next;
          }); };
          return <label key={field.key} className={field.type === 'textarea' || field.multiple ? 'geo-span' : ''}><span>{field.label}{field.required && ' *'}</span>{field.ref ? <select aria-label={field.label} multiple={field.multiple} value={field.multiple ? splitIds(value) : value} onChange={e => change(field.multiple ? Array.from(e.target.selectedOptions).map(o => o.value).join(',') : e.target.value)} size={field.multiple ? Math.min(6, options.length + 1) : undefined}>{!field.multiple && <option value="">请选择 / 留空</option>}{options.map(e => <option key={e.id} value={e.id}>{entityTitle(e).slice(0, 65)} · {e.id.slice(-8)}</option>)}</select> : field.options ? <select aria-label={field.label} value={value} onChange={e => change(e.target.value)}>{!value && <option value="">请选择</option>}{field.options.map(o => <option key={o}>{o}</option>)}</select> : field.type === 'textarea' ? <textarea aria-label={field.label} rows={field.key === 'answer' || field.key === 'body' ? 10 : 3} value={value} required={field.required} onChange={e => change(e.target.value)} /> : <input aria-label={field.label} type={field.type || 'text'} value={value} min={field.min} max={field.max} step={field.type === 'number' ? 'any' : undefined} required={field.required} onChange={e => change(e.target.value)} />}{field.multiple && <small>按住 Ctrl 可多选；关联关系使用稳定 ID 保存。</small>}</label>;
        })}
      </form>
      {(error || externalError) && <p role="alert" className="geo-error">{error || externalError}</p>}
      <section className="geo-version"><h3>AI 候选稿</h3><label><span>重新生成的调整要求</span><textarea rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="例如：保留已核实事实，重新组织建议与优先级说明" /></label><Button variant="outline" disabled={busy || dirty} onClick={() => onSuggest(instructions)}>{busy ? '生成中…' : '生成候选稿'}</Button>{dirty && <small>请先保存当前编辑，再生成候选稿。</small>}{entity.suggestion && <><pre>{JSON.stringify(entity.suggestion, null, 2)}</pre><Button disabled={dirty} onClick={() => { if (window.confirm('确认以这份候选稿更新当前内容？当前版本会保留在历史中。')) onAccept(); }}>确认采用此候选稿</Button></>}</section>
      {entity.suggestion && entity.suggestionBaseRevision !== entity.revision && <p className="geo-notice">候选稿生成后，当前内容又有修改，请对照后决定是否采用。</p>}
      <details className="geo-version"><summary>原始内容 {entity.original ? '· 已保留' : '· 人工新建'}</summary>{entity.original && <><pre>{JSON.stringify(entity.original, null, 2)}</pre><Button variant="outline" disabled={dirty} onClick={() => { if (window.confirm('恢复原始内容？当前人工版本会进入历史，不会删除。')) onRestore(entity.original!); }}>恢复原始内容</Button></>}</details>
      {entity.aiOriginal && <details className="geo-version"><summary>首份 AI 建议</summary><pre>{JSON.stringify(entity.aiOriginal, null, 2)}</pre><Button variant="outline" disabled={dirty} onClick={() => { if (window.confirm('恢复首份 AI 建议？当前版本会保留。')) onRestore(entity.aiOriginal!); }}>恢复首份 AI 建议</Button></details>}
      <details className="geo-version"><summary>历史版本 · {entity.history.length} 条</summary>{entity.history.length ? [...entity.history].reverse().map((h, i) => <details key={`${h.at}-${i}`}><summary>{new Date(h.at).toLocaleString('zh-CN')} · {h.reason} · {h.humanEdited ? '人工修改' : '原始 / AI'}</summary><pre>{JSON.stringify(h.values, null, 2)}</pre><Button variant="outline" disabled={dirty} onClick={() => { if (window.confirm('确认恢复这一历史版本？当前版本仍会保留。')) onRestore(h.values); }}>恢复此版本</Button></details>) : <p>尚无历史修订。</p>}</details>
    </div><div className="geo-dialog-foot"><span>保存后可在页面顶部查看同步状态</span><Button type="submit" form="geo-editor-form">保存修改</Button></div>
  </DialogContent></Dialog>;
}
