import { aiProviders, completionDeltaText, completionResponseText, providerError, visibilityTestRequest } from './ai-providers';
import type { ProviderId } from './provider-credentials';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown) => typeof v === 'string' ? v : '';
export type SearchStatus = '未执行' | '执行中' | '已执行' | '未知' | '失败';
export type NativeSource = { url: string; title: string; kind: string; native: Obj };
export type VisibilityEvent = { type: 'delta' | 'search'; text?: string; searchStatus?: SearchStatus };

// Only transport/tool metadata establishes search activity. URLs in answer prose do not.
export class SearchEvidence {
  status: SearchStatus;
  calls: Obj[] = [];
  sources: NativeSource[] = [];
  annotations: Obj[] = [];
  constructor(public enabled: boolean) { this.status = enabled ? '未知' : '未执行'; }
  observe(value: unknown) {
    const v = obj(value);
    const type = str(v.type);
    if (type.includes('web_search_call')) {
      this.calls.push(v);
      if (v.status === 'failed' || type.endsWith('.failed') || v.error) this.status = '失败';
      else if (this.status !== '失败' && (v.status === 'completed' || type.endsWith('.completed'))) this.status = '已执行';
      else if (this.status !== '失败' && this.status !== '已执行') this.status = '执行中';
    }
    const addSources = (items: unknown, kind: string) => {
      for (const item of arr(items)) {
        const s = obj(item); const url = str(s.url) || str(s.link);
        if (/^https?:\/\//i.test(url) && !this.sources.some(x => x.url === url && x.kind === kind)) this.sources.push({ url, title: str(s.title) || str(s.site_name) || url, kind, native: s });
      }
    };
    if (v.search_info) {
      this.calls.push({ type: 'dashscope.search_info', ...obj(v.search_info) });
      addSources(obj(v.search_info).search_results, 'search_result');
      if (this.status !== '失败' && arr(obj(v.search_info).search_results).length) this.status = '已执行';
    }
    if (arr(v.web_search).length || arr(v.search_result).length) {
      addSources(v.web_search || v.search_result, 'search_result');
      this.calls.push({ type: 'native.search_results', results: v.web_search || v.search_result });
      if (this.status !== '失败') this.status = '已执行';
    }
    addSources(obj(v.action).sources, 'search_result');
    const annotations = arr(v.annotations);
    for (const a of annotations) {
      this.annotations.push(obj(a));
      addSources([obj(a).url_citation || a], 'citation');
    }
    if (type === 'response.output_text.annotation.added' && v.annotation) this.observe({ annotations: [v.annotation] });
    for (const [key, child] of Object.entries(v)) {
      if (['response', 'output', 'item', 'content', 'message', 'choices', 'delta'].includes(key)) {
        if (Array.isArray(child)) child.forEach(x => this.observe(x)); else this.observe(child);
      }
    }
  }
  finish() { if (this.status === '执行中') this.status = '未知'; }
}

export class VisibilityFailure extends Error {
  constructor(message: string, public data: Obj) { super(message); }
}

export async function runVisibility(provider: ProviderId, question: string, apiKey: string, options: { webSearch?: boolean; stream?: boolean; model?: string }, emit: (event: VisibilityEvent) => void = () => {}) {
  const config = aiProviders[provider];
  const request = visibilityTestRequest(provider, question, options);
  const evidence = new SearchEvidence(request.debug.webSearchEnabled);
  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  let answer = ''; let actualModel = ''; let upstreamId = ''; let usage: unknown = null; let finishReason = ''; let complete = false;
  const exchanges: Obj[] = [];
  let failureDetail: Obj | null = null;
  let responseStatus = '';
  const redact = (v: unknown): unknown => { if(typeof v === 'string') return v.replaceAll(apiKey,'[已脱敏]'); if(Array.isArray(v)) return v.map(redact); if(v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/authorization|api[_-]?key|access[_-]?token/i.test(k)?'[已脱敏]':redact(x)])); return v; };
  let requestBody: Obj = request.body;
  const payload = () => ({
    provider, platform: config.name, prompt: question, model: actualModel || request.debug.model,
    returnedModel: actualModel, configuredModel: request.debug.model, answer, upstreamId,
    startedAt, endedAt: new Date().toISOString(), testedAt: new Date().toISOString(),
    testMode: '真实AI可见度测试', web: request.debug.webSearchEnabled ? '是' : '否',
    webSearchRequested: request.debug.webSearchRequested ? '是' : '否', webSearchSupported: request.debug.webSearchSupported ? '是' : '否',
    webSearchEnabled: request.debug.webSearchEnabled ? '是' : '否', searchStatus: evidence.status,
    webSearchUsed: evidence.status === '已执行' ? '是' : evidence.status === '未执行' ? '否' : '未知',
    searchSourcesReturned: evidence.sources.length ? '是' : '否', nativeSources: evidence.sources,
    localKnowledgeBase: '否', clientContextInjection: '否', competitorContextInjection: '否', questionMetadataInjection: '否',
    loggedIn: '不适用', memory: '关闭', newChat: '是', followUp: '否', channel: 'API',
    responseMetadata: { requestDebug: { ...request.debug, endpoint: request.endpoint, requestBody: request.body, adapterVersion: 'native-search-v2' }, exchanges, searchCalls: evidence.calls, nativeSources: evidence.sources, annotations: evidence.annotations, usage, finishReason, complete, responseStatus, failureDetail, searchStatus: evidence.status },
  });
  try {
    if (!request.debug.webSearchRequested || !request.debug.webSearchEnabled || !request.debug.webSearchSupported) {
      failureDetail = { kind: 'online_required', reason: 'search_not_enabled' };
      throw new Error('真实AI可见度测试必须联网；当前模型未启用或不支持官方搜索，已阻止非联网请求。');
    }
    for (let round = 0; round < 8; round++) {
      exchanges.push({ round: round + 1, endpoint: request.endpoint, body: structuredClone(requestBody), scope: '当前题内官方工具往返；无跨题历史' });
      const upstream = await fetch(request.endpoint, {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(config.webSearch === 'dashscope' && options.stream ? { 'X-DashScope-SSE': 'enable' } : {}) },
        body: JSON.stringify(requestBody),
      });
      if (!upstream.ok) {
        const rawError = await upstream.json().catch(() => ({}));
        failureDetail = { kind: 'http_error', httpStatus: upstream.status, requestId: upstream.headers.get('x-request-id'), upstream: redact(rawError) };
        const failure = providerError(rawError, upstream.status);
        throw new Error(`${config.name}：${failure.message}`);
      }
      finishReason = '';
      let roundAnswer = ''; let reasoningContent = ''; let terminal = false;
      const toolCalls = new Map<number, Obj>();
      const consume = (raw: unknown, streaming: boolean) => {
        const e = obj(raw); const response = obj(e.response); const output = obj(e.output);
        responseStatus = str(response.status) || str(e.status) || responseStatus;
        const prior = evidence.status; evidence.observe(e);
        if (evidence.status !== prior) emit({ type: 'search', searchStatus: evidence.status });

        actualModel = str(response.model) || str(e.model) || actualModel;
        upstreamId = str(response.id) || str(e.id) || str(e.request_id) || upstreamId;
        usage = response.usage || e.usage || usage;
        const choice = obj(arr(e.choices || output.choices)[0]);
        const message = obj(choice.message); const delta = obj(choice.delta);
        finishReason = str(choice.finish_reason) || finishReason;

        const text = config.webSearch === 'dashscope' ? str(message.content) : streaming ? completionDeltaText(e) : completionResponseText(e);
        if (text) { roundAnswer += text; answer += text; emit({ type: 'delta', text }); }
        const failed = e.error || response.error || (e.code && e.code !== '0') || e.type === 'error' || e.type === 'response.failed' || e.type === 'response.incomplete' || ['failed','incomplete'].includes(responseStatus) || finishReason === 'length' || evidence.status === '失败';
        if (failed) {
          const partial = completionResponseText(e.response || e);
          if (partial) { answer = answer.slice(0, answer.length-roundAnswer.length)+partial; roundAnswer=partial; }
          const detail = obj(response.incomplete_details || e.incomplete_details);
          const upstreamError = obj(response.error || e.error);
          finishReason = str(detail.reason) || finishReason;
          failureDetail = { kind: 'upstream_event', eventType: e.type, code: upstreamError.code || e.code, reason: detail.reason, upstream: redact(e) };
          const reason = str(upstreamError.message) || str(e.message) || str(detail.reason) || finishReason || '平台未提供具体原因';
          throw new Error((evidence.status === '失败' ? '搜索工具失败：' : responseStatus === 'incomplete' || e.type === 'response.incomplete' || finishReason === 'length' ? '回答不完整：' : '回答生成失败：') + reason);
        }
        reasoningContent += str(delta.reasoning_content) || str(message.reasoning_content);
        arr(delta.tool_calls || message.tool_calls).forEach((item, index) => {
          const t = obj(item); const i = typeof t.index === 'number' ? t.index : index;
          const previous = toolCalls.get(i) || {}; const f = obj(t.function); const pf = obj(previous.function);
          toolCalls.set(i, { id: str(t.id) || previous.id, type: 'function', function: { name: str(f.name) || pf.name, arguments: str(pf.arguments) + str(f.arguments) } });
        });
        if (e.type === 'response.completed' || e.status === 'completed') {
          terminal = true;
          const finalText = completionResponseText(e.response || e);
          if (finalText) { answer = answer.slice(0, answer.length - roundAnswer.length) + finalText; roundAnswer = finalText; }
        }
        if (['stop', 'tool_calls', 'content_filter'].includes(finishReason)) terminal = true;
        // An HTTP 200 can still contain a queued/in-progress Responses object.
        // Only explicit terminal evidence establishes a complete answer.
        if (!streaming && request.debug.endpointType === 'responses') terminal = response.status === 'completed' || e.status === 'completed';
      };
      if ((upstream.headers.get('content-type') || '').includes('text/event-stream')) {
        const reader = upstream.body!.getReader(); const decoder = new TextDecoder(); let buffer = '';
        const line = (value: string) => {
          if (!value.startsWith('data:')) return;
          const data = value.slice(5).trim(); if (!data) return;
          if (data === '[DONE]') { if (request.debug.endpointType !== 'responses') terminal = true; return; }
          consume(JSON.parse(data), true);
        };
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) { buffer += decoder.decode(); if (buffer.trim()) line(buffer); break; }
            buffer += decoder.decode(value, { stream: true }); const lines = buffer.split(/\r?\n/); buffer = lines.pop() || ''; lines.forEach(line);
          }
        } finally { await reader.cancel().catch(() => {}); }
      } else consume(await upstream.json(), false);
      if (!terminal) throw new Error('平台连接提前结束，未收到完整结束事件。');
      if (config.webSearch === 'kimi-builtin' && toolCalls.size) {
        const calls = [...toolCalls.values()];
        if (!request.debug.webSearchEnabled || calls.some(t => obj(t.function).name !== '$web_search')) throw new Error('平台返回了未允许的工具调用。');
        evidence.status = '执行中'; emit({ type: 'search', searchStatus: evidence.status });
        evidence.calls.push(...calls.map(t => ({ ...t, status: 'requested', round: round + 1 })));
        const assistant = { role: 'assistant', content: roundAnswer || null, ...(reasoningContent ? { reasoning_content: reasoningContent } : {}), tool_calls: calls };
        requestBody = { ...requestBody, messages: [...arr(requestBody.messages), assistant, ...calls.map(t => ({ role: 'tool', tool_call_id: t.id, name: '$web_search', content: obj(t.function).arguments }))] };
        continue;
      }
      if (config.webSearch === 'kimi-builtin' && evidence.calls.length && finishReason === 'stop') {
        evidence.status = '已执行'; evidence.calls.push({ type: 'kimi.builtin_search_completed', status: 'completed', proof: '官方搜索参数回传后，平台成功返回最终 stop 回答' });
      }
      complete = true; break;
    }
    if (!complete) throw new Error('官方搜索工具超过本题最大往返次数。');
    if (!answer.trim()) throw new Error(`${config.name}没有返回可用回答。`);
    evidence.finish();
    if (evidence.status !== '已执行') {
      failureDetail = { kind: 'online_required', reason: 'search_not_confirmed', searchStatus: evidence.status };
      throw new Error('平台未返回实际联网搜索成功的证据。本次回答已保留，但不作为有效联网测试，也不计入GEO评分。');
    }
    return payload();
  } catch (error) {
    complete = false;
    evidence.finish();
    if (!failureDetail) failureDetail = { kind: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'transport_or_protocol', message: redact(error instanceof Error ? error.message : '未知异常') };
    const message = error instanceof Error && error.name === 'AbortError' ? '平台响应超时。' : error instanceof Error ? error.message : '平台请求失败。';
    const safeMessage = message.replaceAll(apiKey, '[已脱敏]') + (answer ? ' 已保存收到的原始片段。' : ' 本次未收到回答正文。');
    throw new VisibilityFailure(safeMessage, { ...payload(), error: safeMessage });
  } finally { clearTimeout(timer); }
}
