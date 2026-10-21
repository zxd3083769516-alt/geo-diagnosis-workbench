import type { ProviderId } from '@/lib/provider-credentials';

export type ProviderConfig = {
  name: string;
  endpoint: string;
  visibilityEndpoint?: string;
  model: string;
  webSearch: 'responses-tool' | 'dashscope' | 'kimi-builtin' | 'zhipu-tool' | 'unsupported';
  webSearchNote: string;
};

export const aiProviders: Record<ProviderId, ProviderConfig> = {
  chatgpt: {
    name: 'ChatGPT（OpenAI API）',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    visibilityEndpoint: 'https://api.openai.com/v1/responses',
    model: 'gpt-5.4',
    webSearch: 'responses-tool',
    webSearchNote: '通过 OpenAI Responses API 的 web_search 工具联网。',
  },
  kimi: {
    name: 'Kimi（Moonshot API）',
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    model: 'kimi-k2.6',
    webSearch: 'kimi-builtin',
    webSearchNote: '当前使用官方旧版 $web_search。官方公告预计2026-10-20下线，新接口迁移待完成；本工作台尚未实测当前可用性，工具失败不会降级为非联网成功。',
  },
  qwen: {
    name: '通义千问',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
    visibilityEndpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    webSearch: 'dashscope',
    webSearchNote: 'DashScope 原生搜索，返回 search_info 与引用；需百炼模型权限。',
  },
  deepseek: {
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-v4-flash',
    visibilityEndpoint: 'https://api.deepseek.com/responses',
    webSearch: 'responses-tool',
    webSearchNote: 'DeepSeek 官方 Responses web_search；需 API 余额。',
  },
  doubao: {
    name: '豆包',
    endpoint: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    model: 'doubao-seed-2-0-lite-260215',
    visibilityEndpoint: 'https://ark.cn-beijing.volces.com/api/v3/responses',
    webSearch: 'responses-tool',
    webSearchNote: '方舟 Responses web_search；需模型与联网搜索工具权限。',
  },
  zhipu: {
    name: '智谱 GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4.5-air',
    webSearch: 'zhipu-tool',
    webSearchNote: '智谱对话内 web_search，返回原生来源；需模型及搜索服务余额。',
  },
};

export function isApiProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && Object.hasOwn(aiProviders, value);
}

export function completionBody(provider: ProviderId, question: string, maxTokens = 900, stream = false) {
  return {
    model: aiProviders[provider].model,
    messages: [{ role: 'user', content: question }],
    stream,
    ...(provider === 'chatgpt' ? { max_completion_tokens: maxTokens, reasoning_effort: 'none', store: false } : { max_tokens: maxTokens }),
    ...(provider === 'deepseek' || provider === 'zhipu' || provider === 'kimi' ? { thinking: { type: 'disabled' } } : {}),
  };
}

export type VisibilityRequestDebug = {
  model: string;
  endpointType: 'responses' | 'chat_completions' | 'dashscope';
  systemPrompt: null;
  userPrompt: string;
  tools: Array<Record<string, unknown>>;
  webSearchRequested: boolean;
  webSearchSupported: boolean;
  webSearchEnabled: boolean;
  historyMessages: 0;
  localKnowledgeBase: false;
  clientContextInjection: false;
  competitorContextInjection: false;
  questionMetadataInjection: false;
  responseFormat: 'text';
  parameters: Record<string, unknown>;
};

export function visibilityTestRequest(provider: ProviderId, question: string, options: { webSearch?: boolean; stream?: boolean; model?: string } = {}) {
  const config = aiProviders[provider];
  const webSearchRequested = options.webSearch !== false;
  const webSearchSupported = config.webSearch !== 'unsupported';
  const webSearchEnabled = webSearchRequested && webSearchSupported;
  const stream = options.stream === true;
  const model = options.model || config.model;

  if (config.webSearch === 'responses-tool') {
    const tools = webSearchEnabled ? [{ type: 'web_search' }] : [];
    const requestBody = {
      model,
      input: question,
      stream,
      store: false,
      ...(tools.length ? { tools, ...(provider === 'chatgpt' ? { include: ['web_search_call.action.sources'] } : {}) } : {}),
    };
    return {
      endpoint: config.visibilityEndpoint || config.endpoint,
      body: requestBody,
      debug: {
        model, endpointType: 'responses', systemPrompt: null, userPrompt: question, tools,
        webSearchRequested, webSearchSupported, webSearchEnabled, historyMessages: 0,
        localKnowledgeBase: false, clientContextInjection: false, competitorContextInjection: false,
        questionMetadataInjection: false, responseFormat: 'text', parameters: { stream, store: false, reasoning: null, temperature: null },
      } satisfies VisibilityRequestDebug,
    };
  }

  const tools: Array<Record<string, unknown>> = webSearchEnabled ? config.webSearch === 'kimi-builtin' ? [{ type: 'builtin_function', function: { name: '$web_search' } }] : config.webSearch === 'zhipu-tool' ? [{ type: 'web_search', web_search: { enable: true, search_engine: 'search_pro', search_result: true } }] : [] : [];
  const requestBody = config.webSearch === 'dashscope' ? {
    model, input: { messages: [{ role: 'user', content: question }] },
    parameters: { result_format: 'message', incremental_output: stream, enable_search: webSearchEnabled, ...(webSearchEnabled ? { search_options: { enable_source: true, enable_citation: true } } : {}) },
  } : {
    model,
    messages: [{ role: 'user', content: question }],
    stream,
    ...(tools.length ? { tools } : {}),
  };
  return {
    endpoint: config.visibilityEndpoint || config.endpoint,
    body: requestBody,
    debug: {
      model, endpointType: config.webSearch === 'dashscope' ? 'dashscope' : 'chat_completions', systemPrompt: null, userPrompt: question,
      tools, webSearchRequested, webSearchSupported, webSearchEnabled, historyMessages: 0,
      localKnowledgeBase: false, clientContextInjection: false, competitorContextInjection: false,
      questionMetadataInjection: false, responseFormat: 'text',
      parameters: { ...Object.fromEntries(Object.entries(requestBody).filter(([key]) => !['model', 'messages'].includes(key))), reasoning: null, temperature: null },
    } satisfies VisibilityRequestDebug,
  };
}

export function completionDeltaText(result: unknown) {
  const value = result as { type?: string; delta?: unknown; choices?: Array<{ delta?: { content?: string | Array<{ text?: string }> } }> };
  if (value.type === 'response.output_text.delta' && typeof value.delta === 'string') return value.delta;
  const content = value.choices?.[0]?.delta?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => item.text || '').join('');
  return '';
}

export function completionResponseText(result: unknown) {
  const value = result as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>; choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  if (typeof value.output_text === 'string') return value.output_text;
  if (Array.isArray(value.output)) return value.output.flatMap(item => item.content || []).filter(item => item.type === 'output_text' && typeof item.text === 'string').map(item => item.text).join('');
  const content = value.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((item) => item.text || '').join('');
  return '';
}

export function providerError(result: unknown, status: number) {
  const value = result as { error?: { message?: string }; message?: string };
  const detail = value.error?.message || value.message || '';
  if (status === 401 || status === 403) {
    return { message: '密钥无效、权限不足或模型服务尚未开通。', category: 'auth', haltProvider: true };
  }
  if (status === 429) {
    return { message: '平台调用频率或余额额度已达到限制。请到平台控制台检查余额、套餐和速率限制。', category: 'quota', haltProvider: true };
  }
  if (status === 400) {
    return { message: detail.slice(0, 180) || '当前答题模型或请求参数不可用。', category: 'configuration', haltProvider: true };
  }
  return { message: detail.slice(0, 180) || `平台返回 ${status}。`, category: 'temporary', haltProvider: status >= 500 };
}
