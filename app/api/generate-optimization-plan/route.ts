import { aiProviders, completionBody, completionResponseText, providerError } from '@/lib/ai-providers';
import type { OptimizationPlan, PlanStatus } from '@/lib/optimization-plan';
import { decryptCredentials, type ProviderId } from '@/lib/provider-credentials';

const statuses: PlanStatus[] = ['待处理', '进行中', '已完成'];

function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && value in aiProviders;
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new SyntaxError('missing json');
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim().slice(0, 4000) : fallback;
}

function list(value: unknown, max: number) {
  return Array.isArray(value) ? value.slice(0, max).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function status(value: unknown): PlanStatus {
  return statuses.includes(value as PlanStatus) ? value as PlanStatus : '待处理';
}

function normalizePlan(raw: Record<string, unknown>, generatedBy: string, generatedAt: string, sourceFingerprint: string): OptimizationPlan {
  const priorities = list(raw.priorities, 8).map((row, index) => ({
    id: `priority-${index + 1}`,
    level: ['P0', 'P1', 'P2'].includes(text(row.level)) ? text(row.level) as 'P0' | 'P1' | 'P2' : index < 2 ? 'P0' : 'P1',
    issue: text(row.issue, '待补充问题'),
    evidence: text(row.evidence, '待补充诊断依据'),
    action: text(row.action, '待补充具体动作'),
    successMetric: text(row.successMetric, '待确定验收指标'),
    status: status(row.status),
  }));
  const contentTasks = list(raw.contentTasks, 12).map((row, index) => ({
    id: `content-${index + 1}`,
    topic: text(row.topic, '待确定选题'),
    targetQuestions: text(row.targetQuestions, '待补充目标问题'),
    factsNeeded: text(row.factsNeeded, '待核实资料'),
    format: text(row.format, '问答页'),
    channel: text(row.channel, '官网或可公开检索渠道'),
    owner: text(row.owner, '待分配'),
    due: text(row.due, '待确定'),
    status: status(row.status),
  }));
  const phases = list(raw.phases, 6).map((row, index) => ({
    id: `phase-${index + 1}`,
    period: text(row.period, `第${index + 1}阶段`),
    objective: text(row.objective, '待确定目标'),
    tasks: text(row.tasks, '待补充任务'),
    deliverable: text(row.deliverable, '待确定交付物'),
    status: status(row.status),
  }));
  const retestPlan = list(raw.retestPlan, 6).map((row, index) => ({
    id: `retest-${index + 1}`,
    timing: text(row.timing, '优化内容公开后复测'),
    scope: text(row.scope, '复测原问题'),
    metrics: text(row.metrics, '品牌提及率、推荐位置、认知准确度'),
    passCriteria: text(row.passCriteria, '与本次基线比较后确定'),
  }));
  if (priorities.length < 1 || contentTasks.length < 1 || phases.length < 1 || retestPlan.length < 1) throw new SyntaxError('incomplete json');
  return {
    summary: text(raw.summary, '请根据下方任务推进GEO优化。'),
    diagnosisBasis: text(raw.diagnosisBasis, '方案依据当前已完成的GEO测试结果生成。'),
    priorities,
    contentTasks,
    phases,
    retestPlan,
    assumptions: text(raw.assumptions, '价格、资质、案例和服务能力等信息在公开前需要商家核实。'),
    generatedBy,
    generatedAt,
    sourceFingerprint,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      provider?: unknown;
      merchant?: Record<string, string>;
      diagnosis?: Record<string, unknown>;
      evidenceRows?: unknown[];
      sourceFingerprint?: unknown;
    };
    if (!isProvider(body.provider)) return Response.json({ error: '请选择已配置的方案生成平台。' }, { status: 400 });
    if (!body.merchant || typeof body.merchant.brand !== 'string' || !body.merchant.brand.trim()) return Response.json({ error: '客户资料不完整。' }, { status: 400 });
    if (!body.diagnosis || !Array.isArray(body.evidenceRows) || body.evidenceRows.length < 1 || body.evidenceRows.length > 24) return Response.json({ error: '至少需要一条真实测试结果才能生成优化方案。' }, { status: 400 });
    const sourceFingerprint = typeof body.sourceFingerprint === 'string' ? body.sourceFingerprint.slice(0, 80) : '';
    const credentials = await decryptCredentials(request);
    const apiKey = credentials[body.provider];
    const provider = aiProviders[body.provider];
    if (!apiKey) return Response.json({ error: `${provider.name}尚未配置API Key。`, needsConfiguration: true }, { status: 401 });

    const prompt = `你是一名严谨的本地商家GEO优化顾问。请根据商家提交的真实资料、诊断汇总和已完成的AI测试证据，制作一份可执行的初步优化方案。

要求：
1. 只能把输入中明确存在的信息当作事实。不得编造价格、资质、案例、排名、销量、评价或服务能力。
2. 证据不足的内容必须写“待核实”，并在factsNeeded或assumptions中列出所需资料。
3. 方案应适用于商家的真实行业，不套用餐饮模板。语言清楚、口语化、方便老板和执行人员使用。
4. 优先处理得分低、品牌未提及、认知错误、优势未识别和缺乏可信依据的问题。
5. 不建议伪造评价、虚构媒体报道、关键词堆砌或批量制造低质量内容。
6. 不承诺进入AI推荐，只给出可验证的内容与信息建设动作。
7. contentTasks给出6至10项；phases按“第1周、第2周、第3周、第4周”给出4项；priorities给出3至6项；retestPlan给出3至5项。
8. successMetric必须是可复测或可验收的指标；passCriteria以本次真实基线为参照，不能凭空设定行业标准。

只输出JSON对象，不要Markdown和额外解释，结构如下：
{"summary":"","diagnosisBasis":"","priorities":[{"level":"P0","issue":"","evidence":"","action":"","successMetric":"","status":"待处理"}],"contentTasks":[{"topic":"","targetQuestions":"","factsNeeded":"","format":"","channel":"","owner":"待分配","due":"","status":"待处理"}],"phases":[{"period":"第1周","objective":"","tasks":"","deliverable":"","status":"待处理"}],"retestPlan":[{"timing":"","scope":"","metrics":"","passCriteria":""}],"assumptions":""}

输入：${JSON.stringify({ merchant: body.merchant, diagnosis: body.diagnosis, evidenceRows: body.evidenceRows })}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    let upstream: Response;
    try {
      upstream = await fetch(provider.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(completionBody(body.provider, prompt, 5000)),
      });
    } finally {
      clearTimeout(timeout);
    }
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const failure = providerError(result, upstream.status);
      return Response.json({ error: `${provider.name}生成方案失败：${failure.message}` }, { status: upstream.status >= 500 ? 502 : 400 });
    }
    const output = completionResponseText(result);
    if (!output) return Response.json({ error: `${provider.name}没有返回有效方案。` }, { status: 502 });
    const generatedAt = new Date().toISOString();
    return Response.json({ plan: normalizePlan(parseJson(output), `${provider.name} · ${provider.model}`, generatedAt, sourceFingerprint) });
  } catch (cause) {
    const message = cause instanceof Error && cause.name === 'AbortError'
      ? '方案生成超时，请稍后重试或更换已配置的平台。'
      : cause instanceof SyntaxError
        ? 'AI返回的方案结构不完整，请重新生成。'
        : '优化方案暂时无法生成，请稍后重试。';
    return Response.json({ error: message }, { status: 500 });
  }
}
