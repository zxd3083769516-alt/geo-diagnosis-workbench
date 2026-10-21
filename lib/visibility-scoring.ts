export const VISIBILITY_SCORE_CONFIG = Object.freeze({
  version: 'v1.0',
  mention: 45,
  recommendation: 25,
  top3: 20,
  top1: 10,
  defaultPlatformWeight: 1,
});

export type ScoreValues = Record<string, string>;
export type ScoreEntity = { id: string; current: ScoreValues };
export type RunVisibilityScore = {
  valid: boolean;
  reason: string;
  score: number | null;
  mentioned: boolean;
  recommended: boolean;
  rank: number | null;
  top3: boolean;
  top1: boolean;
  version: string;
};

export type VisibilityQuestionScore = { questionId: string; platformId: string; category: string; weight: number; score: number; runCount: number; runIds: string[] };
export type VisibilityPlatformScore = { platformId: string; name: string; score: number; questionCount: number; runCount: number; platformWeight: number; questionScores: VisibilityQuestionScore[] };
export type VisibilityCategoryScore = { category: string; score: number; questionCount: number; runCount: number };
export type VisibilitySummary = {
  version: string;
  overallScore: number | null;
  mentionRate: number | null;
  recommendationRate: number | null;
  top3Rate: number | null;
  top1Rate: number | null;
  validRunCount: number;
  failedRunCount: number;
  invalidRunCount: number;
  questionCount: number;
  platformCount: number;
  from: string;
  to: string;
  runScores: Array<RunVisibilityScore & { runId: string; questionId: string; platformId: string; weight: number }>;
  questionScores: VisibilityQuestionScore[];
  platformScores: VisibilityPlatformScore[];
  categoryScores: VisibilityCategoryScore[];
};

const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator * 100 : null;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const numberWeight = (value: string | undefined) => {
  const parsed = Number(value || 1);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

// Search configuration alone is not proof. Old records stay readable/exportable,
// but only a complete provider response with observed search evidence is eligible.
export function onlineEvidenceProblem(values: ScoreValues): string {
  if (values.webSearchEnabled !== '是') return '未开启官方联网搜索，不计入正式评分';
  if (values.searchStatus !== '已执行') return '未确认联网搜索成功，不计入正式评分';
  try {
    const metadata = JSON.parse(values.responseMetadata || '{}');
    if (metadata.complete !== true || metadata.searchStatus !== '已执行' || metadata.failureDetail || !Array.isArray(metadata.searchCalls) || !metadata.searchCalls.length) return '缺少完整联网回答证据，不计入正式评分';
  } catch { return '联网证据无法读取，不计入正式评分'; }
  return '';
}

export function scoreVisibilityRun(values: ScoreValues): RunVisibilityScore {
  const base = { score: null, mentioned: values.mentioned === '是', recommended: values.recommended === '是', rank: null, top3: false, top1: false, version: VISIBILITY_SCORE_CONFIG.version };
  if (values.brandDirected === '是') return { ...base, valid: false, reason: '品牌定向问题不进入 AI 发现可见度' };
  if (values.status !== '已完成' || !values.answer?.trim()) return { ...base, valid: false, reason: values.status === '失败' ? '测试失败' : '没有有效原始回答' };
  const onlineProblem = onlineEvidenceProblem(values);
  if (onlineProblem) return { ...base, valid: false, reason: onlineProblem };
  if (values.resultValidity && values.resultValidity !== '有效') return { ...base, valid: false, reason: values.resultValidity === '待判定' ? '回答有效性尚未判定' : values.resultValidity };
  if (!['是', '否'].includes(values.mentioned) || !['是', '否'].includes(values.recommended)) return { ...base, valid: false, reason: '结构化判定尚未完成' };
  const mentioned = values.mentioned === '是';
  const recommended = values.recommended === '是';
  if (recommended && !mentioned) return { ...base, valid: false, reason: '推荐与提及判定冲突' };
  if (recommended && values.sentiment === '负向') return { ...base, valid: false, reason: '负面提及不能自动判为推荐' };
  let rank: number | null = null;
  if (values.rank?.trim()) {
    const parsed = Number(values.rank);
    if (!Number.isInteger(parsed) || parsed < 1 || !recommended) return { ...base, valid: false, reason: '推荐名次与推荐判定冲突' };
    rank = parsed;
  }
  const top3 = recommended && rank !== null && rank <= 3;
  const top1 = top3 && rank === 1;
  const score = (mentioned ? VISIBILITY_SCORE_CONFIG.mention : 0)
    + (recommended ? VISIBILITY_SCORE_CONFIG.recommendation : 0)
    + (top3 ? VISIBILITY_SCORE_CONFIG.top3 : 0)
    + (top1 ? VISIBILITY_SCORE_CONFIG.top1 : 0);
  return { valid: true, reason: '', score, mentioned, recommended, rank, top3, top1, version: VISIBILITY_SCORE_CONFIG.version };
}

export function stampVisibilityScore(values: ScoreValues): ScoreValues {
  const result = scoreVisibilityRun(values);
  return { ...values, top3: result.valid ? (result.top3 ? '是' : '否') : '未知', top1: result.valid ? (result.top1 ? '是' : '否') : '未知', answerScore: result.score === null ? '' : String(result.score), visibilityScoreVersion: VISIBILITY_SCORE_CONFIG.version };
}

export function calculateVisibilitySummary(runs: ScoreEntity[], questions: ScoreEntity[], platforms: ScoreEntity[]): VisibilitySummary {
  const questionMap = new Map(questions.map(question => [question.id, question]));
  const eligibleRuns = runs.filter(run => run.current.brandDirected !== '是');
  const runScores = eligibleRuns.map(run => {
    const result = scoreVisibilityRun(run.current);
    return { ...result, runId: run.id, questionId: run.current.queryId, platformId: run.current.platformId, weight: numberWeight(run.current.queryWeight || questionMap.get(run.current.queryId)?.current.weight) };
  });
  const validRuns = runScores.filter(run => run.valid && run.score !== null);
  const cells = new Map<string, typeof validRuns>();
  for (const run of validRuns) {
    const key = `${run.questionId}:${run.platformId}`;
    cells.set(key, [...(cells.get(key) || []), run]);
  }
  const questionScores: VisibilityQuestionScore[] = [...cells.values()].map(cell => {
    const first = cell[0];
    return { questionId: first.questionId, platformId: first.platformId, category: questionMap.get(first.questionId)?.current.category || '未分类', weight: first.weight, score: average(cell.map(run => run.score!))!, runCount: cell.length, runIds: cell.map(run => run.runId) };
  });
  const platformScores: VisibilityPlatformScore[] = platforms.map(platform => {
    const rows = questionScores.filter(question => question.platformId === platform.id);
    const denominator = rows.reduce((sum, question) => sum + question.weight, 0);
    return { platformId: platform.id, name: platform.current.name || platform.id, score: denominator ? rows.reduce((sum, question) => sum + question.score * question.weight, 0) / denominator : Number.NaN, questionCount: rows.length, runCount: rows.reduce((sum, question) => sum + question.runCount, 0), platformWeight: VISIBILITY_SCORE_CONFIG.defaultPlatformWeight, questionScores: rows };
  }).filter(platform => Number.isFinite(platform.score));
  const categoryNames = [...new Set(questionScores.map(question => question.category))];
  const categoryScores = categoryNames.map(category => {
    const rows = questionScores.filter(question => question.category === category);
    const denominator = rows.reduce((sum, question) => sum + question.weight, 0);
    return { category, score: denominator ? rows.reduce((sum, question) => sum + question.score * question.weight, 0) / denominator : 0, questionCount: new Set(rows.map(question => question.questionId)).size, runCount: rows.reduce((sum, question) => sum + question.runCount, 0) };
  }).sort((a, b) => b.score - a.score);
  const dates = validRuns.map(run => runs.find(entity => entity.id === run.runId)?.current.testedAt).filter((value): value is string => Boolean(value)).sort();
  return {
    version: VISIBILITY_SCORE_CONFIG.version,
    overallScore: average(platformScores.map(platform => platform.score)),
    mentionRate: rate(validRuns.filter(run => run.mentioned).length, validRuns.length),
    recommendationRate: rate(validRuns.filter(run => run.recommended).length, validRuns.length),
    top3Rate: rate(validRuns.filter(run => run.top3).length, validRuns.length),
    top1Rate: rate(validRuns.filter(run => run.top1).length, validRuns.length),
    validRunCount: validRuns.length,
    failedRunCount: eligibleRuns.filter(run => run.current.status === '失败').length,
    invalidRunCount: runScores.filter(run => !run.valid && runs.find(entity => entity.id === run.runId)?.current.status === '已完成').length,
    questionCount: new Set(validRuns.map(run => run.questionId)).size,
    platformCount: platformScores.length,
    from: dates[0] || '',
    to: dates.at(-1) || '',
    runScores,
    questionScores,
    platformScores,
    categoryScores,
  };
}
