import { aiProviders, completionBody, completionResponseText, providerError } from '@/lib/ai-providers';
import { decryptCredentials, type ProviderId } from '@/lib/provider-credentials';

type AnalysisSource = {
  key: string;
  question: string;
  type: string;
  platform: string;
  answer: string;
};

function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && value in aiProviders;
}

function inferProvider(value: unknown, platform: string | undefined): ProviderId | null {
  if (isProvider(value)) return value;
  const normalized = platform?.replace(/\s+/g, '').toLowerCase();
  const match = (Object.entries(aiProviders) as Array<[ProviderId, (typeof aiProviders)[ProviderId]]>)
    .find(([, config]) => config.name.replace(/\s+/g, '').toLowerCase() === normalized);
  return match?.[0] || null;
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SyntaxError('missing json');
  return JSON.parse(cleaned.slice(start, end + 1)) as { analyses?: Array<Record<string, unknown>> };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { merchant?: Record<string, string>; brandFacts?: Array<Record<string, string>>; results?: AnalysisSource[]; provider?: unknown };
    const results = body.results;
    if (!body.merchant || !results || results.length < 1 || results.length > 10) {
      return Response.json({ error: '每次必须提交1到10条完整测试结果。' }, { status: 400 });
    }
    if (results.some((row) => !row.key || !row.question || !row.platform || !row.answer)) {
      return Response.json({ error: '测试结果格式不正确。' }, { status: 400 });
    }
    const selectedProvider = inferProvider(body.provider, results[0]?.platform);
    if (!selectedProvider) return Response.json({ error: '评分平台信息不正确，请刷新页面后重试。' }, { status: 400 });

    const credentials = await decryptCredentials(request);
    const apiKey = credentials[selectedProvider];
    const provider = aiProviders[selectedProvider];
    if (!apiKey) return Response.json({ error: `${provider.name}尚未配置API Key。`, haltProvider: true }, { status: 401 });

    const scoringPrompt = `你是GEO测试自动判定员。请根据真实商户资料，逐条审阅AI平台对问题的原始回答。只能依据商户资料和原始回答判断，不得补充或猜测事实。

判定规则：
1. resultValidity：正常回答问题填“有效”；明确拒绝回答填“模型拒答”；答非所问或没有可分析内容填“无效回答”。
2. mentioned：明确出现目标品牌为“是”，否则为“否”。
3. recommended：回答明确建议考虑、选择或优先该品牌为“是”，单纯列名或负面提及为“否”。负面提及仍可将 mentioned 判为“是”。
4. rank：只有明确推荐顺序时填写正整数；无序列表或未推荐必须为空字符串。
5. sentiment：只能是“正向”“中性”“负向”“混合”之一。
6. brandAccuracy：只能是“准确”“部分准确”“不准确”“无法核实”；品牌未出现时填“无法核实”。
7. checkedFacts 与 correctFacts：只统计回答中可与商户资料直接核对的品牌事实；均为0到50整数，正确数不能大于核实数。
8. competitors：回答里实际出现的竞品品牌，用顿号分隔；没有则空字符串。
9. sourceCandidates：只摘录回答中真实出现的URL、域名、平台名或来源标题，用换行分隔；不得补充回答中没有的来源。
10. judgment：不超过120字说明判定依据和不确定性。
11. 品牌未出现时，recommended必须为“否”、rank为空、checkedFacts和correctFacts必须为0。
12. 模型拒答或无效回答时，mentioned和recommended均填“否”，rank为空，事实数均为0。

只输出一个JSON对象，不要Markdown，不要解释。格式必须是：
{"analyses":[{"key":"原始key","resultValidity":"有效","mentioned":"是或否","recommended":"是或否","rank":"","sentiment":"中性","brandAccuracy":"无法核实","checkedFacts":0,"correctFacts":0,"competitors":"","sourceCandidates":"","judgment":""}]}
analyses数量和顺序必须与输入results完全一致。

输入数据：${JSON.stringify({ merchant: body.merchant, brandFacts: Array.isArray(body.brandFacts) ? body.brandFacts.slice(0, 100) : [], results })}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    let upstream: Response;
    try {
      upstream = await fetch(provider.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(completionBody(selectedProvider, scoringPrompt, 2200)),
      });
    } finally {
      clearTimeout(timeout);
    }
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const failure = providerError(result, upstream.status);
      return Response.json({ error: `${provider.name}评分失败：${failure.message}`, haltProvider: failure.haltProvider }, { status: upstream.status >= 500 ? 502 : 400 });
    }

    const outputText = completionResponseText(result);
    if (!outputText) return Response.json({ error: `${provider.name}没有返回有效评分。` }, { status: 502 });
    const parsed = parseJson(outputText);
    if (!parsed.analyses || parsed.analyses.length !== results.length) return Response.json({ error: '评分结果数量不完整，请继续重试。' }, { status: 502 });
    const expected = new Set(results.map((row) => row.key));
    if (expected.size !== results.length || new Set(parsed.analyses.map(row => row.key)).size !== results.length || parsed.analyses.some((row) => typeof row.key !== 'string' || !expected.has(row.key))) return Response.json({ error: '评分结果对应关系不正确，请继续重试。' }, { status: 502 });
    const validSentiments = ['正向', '中性', '负向', '混合']; const validAccuracy = ['准确', '部分准确', '不准确', '无法核实'];
    if (parsed.analyses.some(row => {
      const checked = Number(row.checkedFacts); const correct = Number(row.correctFacts); const rank = typeof row.rank === 'string' || typeof row.rank === 'number' ? String(row.rank) : '';
      return !['有效', '无效回答', '模型拒答'].includes(String(row.resultValidity)) || !['是', '否'].includes(String(row.mentioned)) || !['是', '否'].includes(String(row.recommended)) || !validSentiments.includes(String(row.sentiment)) || !validAccuracy.includes(String(row.brandAccuracy))
        || !Number.isInteger(checked) || !Number.isInteger(correct) || checked < 0 || checked > 50 || correct < 0 || correct > checked
        || (rank !== '' && (!Number.isInteger(Number(rank)) || Number(rank) < 1))
        || typeof row.competitors !== 'string' || typeof row.sourceCandidates !== 'string' || typeof row.judgment !== 'string'
        || (row.mentioned === '否' && (row.recommended !== '否' || rank !== '' || checked !== 0 || correct !== 0))
        || (row.recommended === '否' && rank !== '')
        || (row.recommended === '是' && row.sentiment === '负向')
        || (row.resultValidity !== '有效' && (row.mentioned !== '否' || row.recommended !== '否' || rank !== '' || checked !== 0 || correct !== 0));
    })) return Response.json({ error: '自动判定字段越界或相互矛盾，当前记录未改变。' }, { status: 502 });
    return Response.json({ analyses: parsed.analyses, model: provider.model, scorer: provider.name, analysisDebug: { stage: 'knowledge_assisted_analysis', inputSources: ['原始AI回答', '原始用户问题', '客户资料', '品牌事实库', '客户登记竞品'], structuredOutput: true, affectsOriginalAnswer: false } });
  } catch (cause) {
    const message = cause instanceof SyntaxError
      ? '评分模型返回的格式异常，请继续重试。'
      : cause instanceof Error && cause.name === 'AbortError'
        ? '单批评分响应超时，系统已保留原始回答，请继续重试。'
        : '自动评分暂时不可用，可稍后续跑。';
    return Response.json({ error: message }, { status: 500 });
  }
}
