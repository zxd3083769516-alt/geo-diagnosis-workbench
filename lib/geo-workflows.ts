import { createEntity, propose, defaultWeight, list, type Entity, type Values, type Workspace } from './geo-model';
import { defaults } from './geo-fields';
import { buildQuestions, initialMerchant, type Merchant, type MixRow } from './question-library';
import { aiProviders } from './ai-providers';
import { stampVisibilityScore } from './visibility-scoring';
export function addApiPlatforms(w: Workspace, clientId: string): Workspace {
  const added = (['chatgpt', 'kimi'] as const).filter(provider => !w.entities.some(e => e.kind === 'platform' && e.clientId === clientId && e.current.provider === provider && e.current.channel === 'API')).map(provider => createEntity('platform', clientId, { name: aiProviders[provider].name, provider, active: '否', channel: 'API', model: aiProviders[provider].model, notes: '独立API测量，不代表网页端；需要配置密钥后启用。' }));
  return { ...w, entities: [...w.entities, ...added] };
}
export function generateQueries(w: Workspace, client: Entity, mix: MixRow[]) {
  const missing = ['brand', 'city', 'areas', 'industry', 'business', 'services', 'audience', 'scenarios', 'advantages'].filter(k => !client.current[k]?.trim());
  if (missing.length) throw new Error('请先完善客户的品牌、行业、地区、业务、服务、客群、场景及真实卖点。');
  if (mix.some(m => m.type === '竞品比较' && m.count > 0) && !client.current.competitors?.trim()) throw new Error('请填写真实竞品，或把竞品比较题数设为0。');
  const total = mix.reduce((n, m) => n + m.count, 0); if (total < 1 || total > 100 || mix.some(m => !Number.isInteger(m.count) || m.count < 0)) throw new Error('题量需为1–100的整数。');
  const generated = buildQuestions({ ...initialMerchant, ...client.current } as Merchant, mix);
  const normalize = (s: string) => s.replace(/[\s，。！？,.!?]/g, '');
  const existing = new Set(list(w, 'query', client.id).map(q => normalize(q.current.prompt))); const added: Entity[] = []; const selected: Entity[] = [];
  for (const q of generated) {
    const text = normalize(q.text); if (existing.has(text)) { const reused = [...list(w, 'query', client.id), ...added].find(e => normalize(e.current.prompt) === text); if(reused && !selected.some(e=>e.id===reused.id)) selected.push(reused); continue; } existing.add(text);
    added.push(createEntity('query', client.id, { ...defaults('query'), prompt: q.text, category: q.type, stage: q.stage, intent: q.intent, region: client.current.city, weight: defaultWeight(q.type), brandDirected: q.type === '品牌' ? '是' : '否', scoreExplanation: '商户资料与行业场景规则生成；不代表搜索热度。需审核近义重复与事实前提。' }, 'rule'));
    selected.push(added[added.length - 1]);
  }
  return { added, selected, skipped: generated.length - added.length };
}
export function makeRun(client: Entity, query: Entity, platform: Entity, protocol: Entity, extra: Values = {}) {
  return createEntity('run', client.id, {
    ...defaults('run'),
    ...Object.fromEntries(['web', 'loggedIn', 'region', 'repeats', 'channel'].map(k => [k, protocol.current[k] || ''])),
    queryId: query.id,
    platformId: platform.id,
    protocolId: protocol.id,
    protocolVersion: `${protocol.current.version} / r${protocol.revision}`,
    clientRevision: String(client.revision),
    prompt: query.current.prompt,
    queryWeight: query.current.weight,
    brandDirected: query.current.brandDirected,
    model: platform.current.model || '',
    configuredModel: platform.current.model || '',
    adapterVersion: 'native-search-v2',
    ...extra,
    testMode: '真实AI可见度测试',
    localKnowledgeBase: '否',
    clientContextInjection: '否',
    competitorContextInjection: '否',
    questionMetadataInjection: '否',
    memory: '关闭',
    newChat: '是',
    followUp: '否',
  });
}
const textValue = (value: unknown, fallback = '') => typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : fallback;

export function collectRun(run: Entity, data: Record<string, unknown>): Entity {
  const values = stampVisibilityScore({ ...run.current, answer: textValue(data.answer), startedAt: textValue(data.startedAt), endedAt: textValue(data.endedAt), returnedModel: textValue(data.returnedModel), webSearchEnabled: textValue(data.webSearchEnabled, '未知'), searchStatus: textValue(data.searchStatus, '未知'), searchSourcesReturned: textValue(data.searchSourcesReturned, '未知'), nativeSources: JSON.stringify(data.nativeSources || []), model: textValue(data.model), configuredModel: textValue(data.configuredModel), testedAt: textValue(data.testedAt), testMode: textValue(data.testMode, '真实AI可见度测试'), web: textValue(data.web, '未知'), webSearchRequested: textValue(data.webSearchRequested, '未知'), webSearchSupported: textValue(data.webSearchSupported, '未知'), webSearchUsed: textValue(data.webSearchUsed, '未知'), localKnowledgeBase: textValue(data.localKnowledgeBase, '否'), clientContextInjection: textValue(data.clientContextInjection, '否'), competitorContextInjection: textValue(data.competitorContextInjection, '否'), questionMetadataInjection: textValue(data.questionMetadataInjection, '否'), loggedIn: textValue(data.loggedIn, '未知'), memory: textValue(data.memory, '未知'), newChat: textValue(data.newChat, '未知'), followUp: textValue(data.followUp, '未知'), channel: textValue(data.channel, 'API'), upstreamId: textValue(data.upstreamId), responseMetadata: JSON.stringify(data.responseMetadata || {}), status: '已完成', resultValidity: '待判定', reviewStatus: '待自动判定', notes: '真实AI原始输出已永久保存；等待知识库辅助分析与人工审核。' });
  return { ...run, current: values, original: { ...values }, origin: 'ai', humanEdited: false, revision: run.revision + 1, updatedAt: new Date().toISOString() };
}

export function collectRunAnalysis(run: Entity, analysis: Record<string, unknown>, model: string) {
  const automatic = stampVisibilityScore({ ...run.current, analysisMode: '知识库辅助分析', resultValidity: textValue(analysis.resultValidity, '有效'), mentioned: textValue(analysis.mentioned, '未知'), recommended: textValue(analysis.recommended, '未知'), rank: textValue(analysis.rank), sentiment: textValue(analysis.sentiment, '未知'), brandAccuracy: textValue(analysis.brandAccuracy, '未知'), checkedFacts: textValue(analysis.checkedFacts, '0'), correctFacts: textValue(analysis.correctFacts, '0'), competitors: textValue(analysis.competitors), sourceCandidates: textValue(analysis.sourceCandidates), judgment: textValue(analysis.judgment), reviewStatus: '待人工审核', autoAnalysisModel: model, autoAnalyzedAt: new Date().toISOString(), notes: '知识库辅助分析待人工审核；真实AI原始回答已永久保留。' });
  if (run.humanEdited || run.current.reviewStatus === '人工已审核') return propose(run, automatic);
  return { ...run, current: automatic, aiOriginal: { ...automatic }, revision: run.revision + 1, updatedAt: new Date().toISOString() };
}

export function diagnosisError(mode: string, queryCount: number, platformCount: number) {
  if (!mode) return '';
  const target = mode === 'screening' ? 45 : 100;
  if (queryCount !== target) return `本模式需选择${target}题，当前${queryCount}题。`;
  if (mode === 'screening' && platformCount !== 1) return 'AI可见度初筛需选择一个平台。';
  if (mode === 'deep' && platformCount < 2) return 'GEO深度诊断需选择至少两个不同AI平台。';
  return '';
}

export function collectRunFailure(run: Entity, data: Record<string, unknown>, message: string): Entity {
  const collected = collectRun(run, data);
  const values = { ...collected.current, status: '失败', resultValidity: '请求失败', reviewStatus: '待自动判定', searchStatus: textValue(data.searchStatus, '失败'), error: message, notes: message };
  return { ...collected, current: values, original: { ...values } };
}
