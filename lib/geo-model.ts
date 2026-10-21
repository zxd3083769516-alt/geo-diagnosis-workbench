import { fields } from './geo-fields';
import { aiProviders, isApiProvider } from './ai-providers';
import { calculateVisibilitySummary, scoreVisibilityRun, onlineEvidenceProblem, VISIBILITY_SCORE_CONFIG, type VisibilitySummary } from './visibility-scoring';
export type Values = Record<string, string>;
export type Kind = 'client' | 'fact' | 'query' | 'platform' | 'protocol' | 'run' | 'source' | 'gap' | 'action' | 'experiment' | 'monthly' | 'outcome' | 'report';
export type Origin = 'manual' | 'ai' | 'rule' | 'import';
export type Revision = { values: Values; at: string; reason: string; origin: Origin; humanEdited: boolean };
export type Entity = { id: string; clientId: string; kind: Kind; current: Values; original: Values | null; aiOriginal?: Values | null; suggestion: Values | null; suggestionBaseRevision?: number; origin: Origin; humanEdited: boolean; revision: number; history: Revision[]; createdAt: string; updatedAt: string };
export type Workspace = { schemaVersion: 2; entities: Entity[]; legacyImported: boolean; diagnosisPlans?: Record<string, { mode: string; queryIds: string[] }> };
export const emptyWorkspace = (): Workspace => ({ schemaVersion: 2, entities: [], legacyImported: false });
export const ids: Record<Kind, string> = { client: 'CLI', fact: 'FACT', query: 'QRY', platform: 'PLT', protocol: 'PRO', run: 'RUN', source: 'SRC', gap: 'GAP', action: 'ACT', experiment: 'EXP', monthly: 'MON', outcome: 'BIZ', report: 'RPT' };
export const now = () => new Date().toISOString();
export const splitIds = (value = '') => value.split(/[\s,，、;；]+/).filter(Boolean);
export const list = (workspace: Workspace, kind: Kind, clientId: string) => workspace.entities.filter(e => e.kind === kind && e.clientId === clientId);
export function createEntity(kind: Kind, clientId: string, current: Values, origin: Origin = 'manual'): Entity {
  const id = `${ids[kind]}-${crypto.randomUUID()}`;
  return { id, clientId: kind === 'client' ? id : clientId, kind, current: { ...current }, original: origin === 'manual' ? null : { ...current }, suggestion: null, origin, humanEdited: origin === 'manual', revision: 1, history: [], createdAt: now(), updatedAt: now() };
}
export function revise(entity: Entity, values: Values, reason = '人工保存'): Entity {
  return { ...entity, current: { ...values }, humanEdited: true, revision: entity.revision + 1, updatedAt: now(), history: [...entity.history, { values: { ...entity.current }, at: entity.updatedAt, reason, origin: entity.origin, humanEdited: entity.humanEdited }] };
}
// All regeneration is staged. It cannot change an existing current version, even if it is not yet edited.
export function propose(entity: Entity, suggestion: Values, baseRevision = entity.revision): Entity {
  const history = entity.suggestion ? [...entity.history, { values: entity.suggestion, at: now(), reason: '上一份候选稿', origin: 'ai' as const, humanEdited: false }] : entity.history;
  return { ...entity, aiOriginal: entity.aiOriginal ?? { ...suggestion }, suggestion: { ...suggestion }, suggestionBaseRevision: baseRevision, history, updatedAt: now() };
}
export function acceptSuggestion(entity: Entity, confirmed: boolean): Entity {
  if (!confirmed || !entity.suggestion) return entity;
  return { ...revise(entity, entity.suggestion, '确认采用候选稿'), suggestion: null };
}
export function restoreOriginal(entity: Entity, confirmed: boolean): Entity {
  return confirmed && entity.original ? revise(entity, entity.original, '确认恢复原始内容') : entity;
}
export const priorityScore = (v: Values) => Math.round(Number(v.impact || 0) * Number(v.confidence || 0) / 100 / Math.max(1, Number(v.effort || 1)) * 100) / 100;
export const defaultWeight = (type: string) => /品牌/.test(type) && !/推荐|比较/.test(type) ? '1' : /推荐|比较|高意向/.test(type) ? '5' : /场景|预算/.test(type) ? '4' : /避坑/.test(type) ? '2' : '1';
export const defaultProtocol: Values = { title: '标准测试协议', version: '1', web: '是', loggedIn: '不适用', memory: '关闭', newChat: '是', followUp: '否', region: '', repeats: '3', channel: 'API', mentionRule: '回答正文明确出现品牌名称或已核实别名才算提及；仅引用网址不算。', recommendationRule: '明确建议考虑或选择该品牌且不是负面劝退；单纯列名只算提及。', top3Rule: '仅对明确的推荐排序记录真实名次；无序列表不推断前三。', accuracyRule: '逐项对照已核实的 Brand Facts；填写可核实事实数与正确事实数，无法核实不计分。', scoreExplanation: 'AI 发现可见度 v1.0：非品牌定向有效回答按 Mention 45、Recommendation 25、Top3 20、Top1 10 计算单次分数；同题同平台多次 Run 先平均，平台内按 Query Weight 加权，平台间等权。失败、无效、未判定和人工改写回答不计分。', serviceBoundary: 'GEO负责诊断、策略、信息结构、监测与复测；客户提供真实素材、账号与业务数据并审核。额外开发、拍摄、代运营另行约定。' };
export function createClient(values: Values): Entity[] {
  const client = createEntity('client', '', values);
  const platforms = [['qwen', '通义千问'], ['deepseek', 'DeepSeek'], ['doubao', '豆包'], ['zhipu', '智谱 GLM'], ['chatgpt', 'ChatGPT（OpenAI API）'], ['kimi', 'Kimi（Moonshot API）']].map(([provider, name], i) => createEntity('platform', client.id, { name, provider, active: i < 4 ? '是' : '否', channel: 'API', model: isApiProvider(provider) ? aiProviders[provider].model : '', notes: i < 4 ? '沿用已配置的 API 连接' : '独立API测量，不代表网页端；配置密钥后启用。' }));
  return [client, ...platforms, createEntity('protocol', client.id, { ...defaultProtocol, region: values.city || '' }, 'rule')];
}
export type Metric = { name: string; value: number | null; numerator: number; denominator: number; description: string };
export type Scope = { platformId?: string; brand?: 'discovery' | 'brand' | 'all'; from?: string; to?: string; runIds?: string[]; queryIds?: string[]; includeEdited?: boolean };
export function scopedRuns(w: Workspace, clientId: string, scope: Scope = {}) {
  const queries = new Map(list(w, 'query', clientId).map(q => [q.id, q]));
  const platforms = new Map(list(w, 'platform', clientId).map(p => [p.id, p]));
  const client = w.entities.find(e => e.id === clientId);
  const protocols = new Map(list(w, 'protocol', clientId).map(p => [p.id, p]));
  return list(w, 'run', clientId).filter(e => {
    const v = e.current;
    const q = queries.get(v.queryId); const p = platforms.get(v.platformId);
    const protocol = protocols.get(v.protocolId);
    return v.status === '已完成' && Boolean(v.answer?.trim()) && !onlineEvidenceProblem(v) && (!scope.platformId || v.platformId === scope.platformId)
      && Boolean(q && p) && (Boolean(scope.runIds) || (q?.current.active !== '否' && p?.current.active === '是' && v.prompt === q?.current.prompt && (!v.clientRevision || v.clientRevision === String(client?.revision))))
      && (Boolean(scope.runIds) || (v.queryWeight === q?.current.weight && v.brandDirected === q?.current.brandDirected && (!v.protocolVersion || v.protocolVersion === `${protocol?.current.version} / r${protocol?.revision}`)))
      && (!scope.from || v.testedAt.slice(0, 10) >= scope.from) && (!scope.to || v.testedAt.slice(0, 10) <= scope.to)
      && (!scope.runIds || scope.runIds.includes(e.id)) && (!scope.queryIds || scope.queryIds.includes(v.queryId))
      && ((scope.brand || 'discovery') === 'all' || (scope.brand === 'brand' ? v.brandDirected === '是' : v.brandDirected !== '是'))
      && (scope.includeEdited || (e.original && e.original.answer === v.answer));
  });
}
export function discoveryVisibility(w: Workspace, clientId: string, scope: Scope = {}): VisibilitySummary {
  const validOrAwaiting = scopedRuns(w, clientId, { ...scope, brand: 'discovery' });
  const queries = list(w, 'query', clientId).filter(query => query.current.active !== '否');
  const platforms = list(w, 'platform', clientId).filter(platform => platform.current.active === '是' && (!scope.platformId || platform.id === scope.platformId));
  const queryIds = new Set(queries.map(query => query.id)); const platformIds = new Set(platforms.map(platform => platform.id));
  const failed = list(w, 'run', clientId).filter(run => run.current.status === '失败' && run.current.brandDirected !== '是' && queryIds.has(run.current.queryId) && platformIds.has(run.current.platformId)
    && (!scope.runIds || scope.runIds.includes(run.id)) && (!scope.queryIds || scope.queryIds.includes(run.current.queryId))
    && (!scope.from || Boolean(run.current.testedAt) && run.current.testedAt.slice(0, 10) >= scope.from) && (!scope.to || Boolean(run.current.testedAt) && run.current.testedAt.slice(0, 10) <= scope.to));
  return calculateVisibilitySummary([...validOrAwaiting, ...failed], queries, platforms);
}
export function metrics(w: Workspace, clientId: string, scope: Scope = {}): Metric[] {
  const runs = scopedRuns(w, clientId, scope);
  const queries = list(w, 'query', clientId).filter(e => e.current.active !== '否' && (!scope.queryIds || scope.queryIds.includes(e.id)) && ((scope.brand || 'discovery') === 'all' || (scope.brand === 'brand' ? e.current.brandDirected === '是' : e.current.brandDirected !== '是')));
  const platforms = list(w, 'platform', clientId).filter(e => e.current.active === '是' && (!scope.platformId || e.id === scope.platformId));
  const judged = (field: string) => runs.filter(e => ['是', '否'].includes(e.current[field]));
  const m = (name: string, n: number, d: number, description: string): Metric => ({ name, value: d ? n / d * 100 : null, numerator: n, denominator: d, description });
  const mentions = judged('mentioned'); const recommendations = judged('recommended');
  const rankable = runs.filter(e => ['是', '否'].includes(e.current.mentioned) && ['是', '否'].includes(e.current.recommended));
  const accurate = runs.filter(e => Number(e.current.checkedFacts) > 0);
  const queryMentioned = new Set(mentions.filter(e => e.current.mentioned === '是').map(e => e.current.queryId));
  const platformMentioned = new Set(mentions.filter(e => e.current.mentioned === '是').map(e => e.current.platformId));
  const auditedCompetitors = runs.filter(e => e.current.competitorsAudited === '是' && ['是', '否'].includes(e.current.mentioned));
  const own = auditedCompetitors.filter(e => e.current.mentioned === '是').length;
  const other = auditedCompetitors.reduce((n, e) => n + new Set(splitIds(e.current.competitors)).size, 0);
  const sourcedRuns = runs.filter(e => e.current.sourcesAudited === '是');
  const sources = list(w, 'source', clientId).filter(e => e.current.brandRole === '本品牌' && e.current.verified === '是' && /^https?:\/\//.test(e.current.url || '') && Number(e.current.quality) >= 2);
  const sourced = sourcedRuns.filter(r => sources.some(s => splitIds(s.current.runIds).includes(r.id))).length;
  const visibility = discoveryVisibility(w, clientId, scope);
  return [
    m('Mention Rate', mentions.filter(e => e.current.mentioned === '是').length, mentions.length, '明确提及次数 / 已判定提及的有效回答数'),
    m('Recommendation Rate', recommendations.filter(e => e.current.recommended === '是').length, recommendations.length, '主动推荐次数 / 已判定推荐的有效回答数'),
    m('Top3 Rate', rankable.filter(e => e.current.recommended === '是' && Number(e.current.rank) > 0 && Number(e.current.rank) <= 3).length, rankable.length, '明确前3推荐次数 / 已完成提及与推荐判定的有效回答数'),
    m('Accuracy Rate', accurate.reduce((n, e) => n + Number(e.current.correctFacts || 0), 0), accurate.reduce((n, e) => n + Number(e.current.checkedFacts), 0), '正确事实条数 / 已核实事实条数；不是未提及即错误'),
    m('Prompt Coverage', queries.filter(e => queryMentioned.has(e.id)).length, queries.length, '至少被提及一次的有效Query数 / 计划中有效Query数；同时查看测试完成率'),
    m('Platform Coverage', platforms.filter(e => platformMentioned.has(e.id)).length, platforms.length, '至少被提及一次的平台数 / 计划启用平台数'),
    m('Competitor Share', other, own + other, '竞品去重提及总次数 /（本品牌＋竞品提及总次数）；逐条回答去重，仅统计完成竞品核查的回答'),
    m('Source Coverage', sourced, sourcedRuns.length, '含已核实本品牌来源的回答数 / 已核查来源的有效回答数；来源≥L2；引用不等于推荐'),
    { name: 'AI 发现可见度', value: visibility.overallScore, numerator: visibility.overallScore ?? 0, denominator: visibility.overallScore === null ? 0 : 100, description: `评分算法 ${visibility.version}：平台内按 Question Weight 加权，平台间默认等权；品牌定向与失败请求不进入分母` },
  ];
}
export function compareExperiment(w: Workspace, clientId: string, v: Values) {
  const beforeIds = splitIds(v.beforeRunIds); const afterIds = splitIds(v.afterRunIds);
  const queryIds = splitIds(v.queryIds);
  const before = scopedRuns(w, clientId, { runIds: beforeIds, queryIds, brand: 'all' });
  const after = scopedRuns(w, clientId, { runIds: afterIds, queryIds, brand: 'all' });
  const signature = (r: Entity) => ['queryId', 'platformId', 'model', 'configuredModel', 'adapterVersion', 'prompt', 'web', 'testMode', 'localKnowledgeBase', 'clientContextInjection', 'competitorContextInjection', 'questionMetadataInjection', 'loggedIn', 'memory', 'region', 'newChat', 'followUp', 'channel', 'protocolVersion', 'queryWeight'].map(k => r.current[k] || '').join('|');
  const bs = new Set(before.map(signature)); const as = new Set(after.map(signature)); const common = new Set([...bs].filter(s => as.has(s)));
  let b = before.filter(r => common.has(signature(r))); let a = after.filter(r => common.has(signature(r)));
  const problems = [];
  if (!queryIds.length) problems.push('未选择影响 Query');
  if (!beforeIds.length || !afterIds.length) problems.push('尚缺基线或复测 Run');
  if (beforeIds.some(id => afterIds.includes(id))) problems.push('前后数据包含同一 Run');
  if (b.length !== before.length || a.length !== after.length) problems.push('问题、模型或协议条件变化；仅比较匹配单元');
  if (!common.size) problems.push('暂无可比较单元');
  if (b.length && a.length && Math.max(...b.map(r => Date.parse(r.current.testedAt))) >= Math.min(...a.map(r => Date.parse(r.current.testedAt)))) problems.push('前后时间窗口重叠或顺序错误');
  if (problems.some(p => p.includes('同一 Run') || p.includes('时间窗口'))) { b = []; a = []; }
  const base = metrics(w, clientId, { runIds: b.map(r => r.id), queryIds, brand: 'all' });
  const post = metrics(w, clientId, { runIds: a.map(r => r.id), queryIds, brand: 'all' });
  return { before: base, after: post, beforeCount: b.length, afterCount: a.length, problems, note: '观察性前后比较；模型变化、外部活动和抽样波动仍可能影响结果，不能单独证明因果。' };
}
export function sourceMap(w: Workspace, clientId: string, scope: Scope = {}) {
  const runs = new Set(scopedRuns(w, clientId, { ...scope, brand: 'all' }).map(r => r.id));
  const map = new Map<string, { host: string; brand: string; role: string; runIds: Set<string>; sources: number }>();
  for (const s of list(w, 'source', clientId)) {
    let host: string; try { const u = new URL(s.current.url); if (!['https:', 'http:'].includes(u.protocol)) continue; host = u.hostname; } catch { continue; }
    const linked = splitIds(s.current.runIds).filter(id => runs.has(id));
    if (scope.platformId && !linked.length) continue;
    const key = `${host}|${s.current.brandName}|${s.current.brandRole}`;
    const item = map.get(key) || { host, brand: s.current.brandName, role: s.current.brandRole, runIds: new Set<string>(), sources: 0 };
    linked.forEach(id => item.runIds.add(id)); item.sources++; map.set(key, item);
  }
  return [...map.values()].map(v => ({ ...v, citations: v.runIds.size })).sort((a, b) => b.citations - a.citations);
}
export function validateWorkspace(w: Workspace): string | null {
  if (!w || w.schemaVersion !== 2 || !Array.isArray(w.entities) || w.entities.length > 30000) return '数据格式或记录数量不正确';
  const seen = new Set<string>();
  for (const e of w.entities) {
    if (!e || !ids[e.kind] || typeof e.id !== 'string' || !e.id.startsWith(`${ids[e.kind]}-`) || seen.has(e.id)) return '记录ID无效或重复';
    seen.add(e.id);
    if (!e.current || Object.values(e.current).some(v => typeof v !== 'string') || !Array.isArray(e.history) || !Number.isInteger(e.revision) || e.revision < 1 || !['manual', 'ai', 'rule', 'import'].includes(e.origin)) return '记录字段或版本格式不正确';
    if (e.original && Object.values(e.original).some(v => typeof v !== 'string')) return '原始版本格式不正确';
    if (e.suggestion && Object.values(e.suggestion).some(v => typeof v !== 'string')) return '候选版本格式不正确';
    if (e.history.some(h => !h || !h.values || Object.values(h.values).some(v => typeof v !== 'string'))) return '历史版本格式不正确';
  }
  const clients = new Set(w.entities.filter(e => e.kind === 'client').map(e => e.id));
  const refs: Partial<Record<Kind, Record<string, Kind>>> = { run: { queryId: 'query', platformId: 'platform', protocolId: 'protocol', experimentId: 'experiment' }, fact: { sourceIds: 'source' }, source: { runIds: 'run', factIds: 'fact' }, gap: { queryIds: 'query', runIds: 'run', sourceIds: 'source' }, action: { gapIds: 'gap', queryIds: 'query', experimentId: 'experiment' }, experiment: { queryIds: 'query', actionIds: 'action', beforeRunIds: 'run', afterRunIds: 'run' }, outcome: { experimentId: 'experiment' }, monthly: { runIds: 'run' } };
  const byId = new Map(w.entities.map(e => [e.id, e]));
  for (const e of w.entities) {
    if (!clients.has(e.clientId)) return '记录所属客户不存在';
    if (e.kind === 'client' && e.id !== e.clientId) return '客户ID与所属客户不一致';
    for (const field of fields[e.kind]) {
      const value = e.current[field.key] || '';
      if (field.required && !value.trim()) return `${field.label}不能为空`;
      if (field.options && value && !field.options.includes(value)) return `${field.label}不在允许的选项中`;
      if (field.type === 'number' && value && (!Number.isFinite(Number(value)) || (field.min !== undefined && Number(value) < field.min) || (field.max !== undefined && Number(value) > field.max))) return `${field.label}数值超出范围`;
    }
    for (const [key, kind] of Object.entries(refs[e.kind] || {})) for (const id of splitIds(e.current[key])) {
      const target = byId.get(id); if (!target || target.kind !== kind || target.clientId !== e.clientId) return `${e.id} 存在无效或跨客户关联：${key}`;
    }
    if (e.kind === 'query' && (!e.current.prompt?.trim() || !(Number(e.current.weight) >= 1 && Number(e.current.weight) <= 5))) return '问题不能为空；权重范围为1–5';
    if (e.kind === 'run') {
      const v = e.current;
      if (!v.queryId || !v.platformId || !v.protocolId) return '测试必须关联 Query、Platform 与 Protocol';
      if (v.testMode === '真实AI可见度测试' && (v.localKnowledgeBase !== '否' || v.clientContextInjection !== '否' || v.competitorContextInjection !== '否' || v.questionMetadataInjection !== '否' || v.memory !== '关闭' || v.newChat !== '是' || v.followUp !== '否')) return '真实AI可见度测试必须关闭本地资料注入、历史记忆和追问，并逐题使用独立会话';
      if (v.status === '已完成' && (!v.answer?.trim() || !v.prompt?.trim() || !v.model?.trim() || !v.region?.trim() || !Number.isFinite(Date.parse(v.testedAt)) || !Number.isInteger(Number(v.repeatIndex)) || Number(v.repeatIndex) < 1)) return '已完成测试必须填写回答、Prompt、模型、地区、时间和运行序号';
      if (v.recommended === '是' && v.mentioned !== '是') return '推荐为是时，提及必须为是';
      if (v.recommended === '是' && v.sentiment === '负向') return '负面提及不能判为主动推荐';
      if (v.resultValidity && !['待判定', '有效'].includes(v.resultValidity) && (v.mentioned === '是' || v.recommended === '是' || Boolean(v.rank))) return '无效回答或模型拒答不能记录提及、推荐或名次';
      if (v.rank && (!(Number(v.rank) > 0) || !Number.isInteger(Number(v.rank)) || v.recommended !== '是')) return '名次需为正整数，且已确认推荐';
      if (Number(v.correctFacts || 0) > Number(v.checkedFacts || 0)) return '正确事实数不能超过已核实事实数';
      // Retain historical score snapshots without reclassifying their original
      // evidence; current KPI calculations exclude unverified online responses.
      if (!onlineEvidenceProblem(v) && v.visibilityScoreVersion === VISIBILITY_SCORE_CONFIG.version && v.answerScore) { const score = scoreVisibilityRun(v); if (!score.valid || String(score.score) !== v.answerScore || v.top3 !== (score.top3 ? '是' : '否') || v.top1 !== (score.top1 ? '是' : '否')) return 'AI可见度评分快照与结构化判定不一致'; }
    }
    for (const field of ['checkedFacts', 'correctFacts', 'brandSearch', 'websiteVisits', 'platformVisits', 'aiVisits', 'inquiries', 'leads', 'deals', 'revenue']) if (e.current[field] && (!Number.isFinite(Number(e.current[field])) || Number(e.current[field]) < 0)) return `${field} 需要非负数`;
    if (['gap', 'action'].includes(e.kind) && (!(Number(e.current.impact) >= 1 && Number(e.current.impact) <= 5) || !(Number(e.current.effort) >= 1 && Number(e.current.effort) <= 5) || !(Number(e.current.confidence) >= 0 && Number(e.current.confidence) <= 100))) return 'Impact/Effort 范围1–5，Confidence 范围0–100';
  }
  if (w.diagnosisPlans !== undefined) {
    if (!w.diagnosisPlans || typeof w.diagnosisPlans !== 'object' || Array.isArray(w.diagnosisPlans)) return '诊断方案格式无效';
    for (const [cid, plan] of Object.entries(w.diagnosisPlans)) {
      if (!plan || !['screening','deep'].includes(plan.mode) || !Array.isArray(plan.queryIds) || plan.queryIds.length !== (plan.mode === 'screening' ? 45 : 100) || new Set(plan.queryIds).size !== plan.queryIds.length) return '诊断方案题量无效';
      if (!w.entities.some(e=>e.id===cid && e.kind==='client') || plan.queryIds.some(id=>!w.entities.some(e=>e.id===id && e.kind==='query' && e.clientId===cid))) return '诊断方案存在无效或跨客户关联';
    }
  }
  return null;
}
