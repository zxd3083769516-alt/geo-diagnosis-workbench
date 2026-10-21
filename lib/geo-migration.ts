import { createClient, createEntity, defaultWeight, emptyWorkspace, list, propose, type Workspace } from './geo-model';
import type { TestResult } from './content-edits';
export function migrateLegacy(legacy: any): Workspace {
  if (!legacy || !legacy.merchant || !legacy.merchant.brand) return emptyWorkspace();
  const entities = createClient(Object.fromEntries(Object.entries(legacy.merchant).map(([k, v]) => [k, String(v ?? '')])));
  const clientId = entities[0].id;
  const w: Workspace = { schemaVersion: 2, entities, legacyImported: true };
  const platforms = list(w, 'platform', clientId);
  platforms.forEach(p => { p.current.active = (legacy.selectedPlatforms || []).includes(p.current.provider) ? '是' : '否'; });
  const protocol = list(w, 'protocol', clientId)[0];
  const questions = new Map<number, string>();
  for (const q of legacy.questions || []) {
    const e = createEntity('query', clientId, { prompt: String(q.text || ''), category: String(q.type || ''), stage: String(q.stage || ''), intent: String(q.intent || ''), weight: defaultWeight(q.type), brandDirected: q.type === '品牌' ? '是' : '否', region: legacy.merchant.city || '', active: '是', frequency: '月度', scoreExplanation: '旧题库迁入；权重为可编辑的内部默认值。' }, 'import');
    entities.push(e); questions.set(q.id, e.id);
  }
  for (const r of (legacy.testResults || []) as TestResult[]) {
    const queryId = questions.get(r.questionId); const p = platforms.find(p => p.current.provider === r.provider);
    if (!queryId || !p) continue;
    const q = entities.find(e => e.id === queryId)!;
    const versions = [...(r.history || []), r];
    for (const v of versions) {
      if (!v.answer) continue;
      const prompt = 'question' in v ? String(v.question) : q.current.prompt;
      const original = v.originalAnswer ?? v.answer;
      const e = createEntity('run', clientId, { queryId, platformId: p.id, protocolId: protocol.id, protocolVersion: 'legacy', queryWeight: q.current.weight, brandDirected: q.current.brandDirected, prompt, answer: original, model: v.model || '旧记录未注明', testedAt: v.testedAt || '', region: legacy.merchant.city || '旧记录未注明', status: v.testedAt ? '已完成' : '待测试', mentioned: v.mentioned || '未知', recommended: '未知', rank: '', checkedFacts: '', correctFacts: '', competitors: v.competitor || '', competitorsAudited: '未知', sourcesAudited: '未知', web: '未知', loggedIn: '未知', memory: '未知', newChat: '未知', followUp: '未知', channel: 'API', repeatIndex: '1', repeats: '1', phase: '基线', notes: `从旧诊断台迁入。旧位置分${v.position || '空'}和准确度分${v.accuracy || '空'}不等于实际名次或事实条数，保留但不擅自换算。${v.userNote || ''}`, judgment: v.note || '' }, 'import');
      if (original !== v.answer) { e.current.answer = v.answer; e.humanEdited = true; }
      entities.push(e);
    }
  }
  if (legacy.optimizationPlan) {
    const plan = legacy.optimizationPlan;
    entities.push(createEntity('report', clientId, { title: '原诊断台优化方案', summary: plan.summary || '', body: JSON.stringify(plan, null, 2), limitations: '旧系统未保留首版AI内容时，仅能保留此次迁入版本。', scoreExplanation: plan.diagnosisBasis || '' }, 'import'));
  }
  return w;
}
