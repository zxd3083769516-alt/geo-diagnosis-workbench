import * as XLSX from 'xlsx';
import { labels } from './geo-fields';
import { discoveryVisibility, metrics, type Workspace, type Scope, type Kind } from './geo-model';
export function createWorkbook(w: Workspace, cid: string, scope: Scope = {}) {
  const book = XLSX.utils.book_new();
  for (const kind of Object.keys(labels) as Kind[]) {
    const rows = w.entities.filter(e => e.clientId === cid && e.kind === kind).map(e => ({ ID: e.id, ClientID: e.clientId, Version: e.revision, Origin: e.humanEdited ? '人工修改' : e.origin, ...e.current, 原始内容: JSON.stringify(e.original), 首份AI建议: JSON.stringify(e.aiOriginal || null), 候选稿: JSON.stringify(e.suggestion), 修改历史: JSON.stringify(e.history) }));
    if (!rows.length) continue;
    const safe = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && v.length > 32000 ? v.slice(0, 31950) + ' [过长内容请查看JSON备份]' : v])));
    const sheet = XLSX.utils.json_to_sheet(safe); sheet['!cols'] = Object.keys(safe[0]).map((_, i) => ({ wch: i < 2 ? 44 : 24 })); sheet['!autofilter'] = { ref: sheet['!ref']! }; XLSX.utils.book_append_sheet(book, sheet, labels[kind]);
  }
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(metrics(w, cid, scope).map(m => ({ 指标: m.name, 百分比: m.value, 分子: m.numerator, 分母: m.denominator, 口径: m.description, 范围: JSON.stringify(scope) }))), '统一KPI');
  const visibility = discoveryVisibility(w, cid, scope); const byId = new Map(w.entities.map(entity => [entity.id, entity]));
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ 算法版本: visibility.version, AI发现可见度: visibility.overallScore, MentionRate: visibility.mentionRate, RecommendationRate: visibility.recommendationRate, Top3Rate: visibility.top3Rate, Top1Rate: visibility.top1Rate, 有效Run: visibility.validRunCount, 失败Run: visibility.failedRunCount, 待判定或无效Run: visibility.invalidRunCount, 有效问题: visibility.questionCount, 有效平台: visibility.platformCount, 起始时间: visibility.from, 结束时间: visibility.to }]), 'AI发现可见度');
  const traceRows = visibility.runScores.map(run => { const entity = byId.get(run.runId); const question = byId.get(run.questionId); const platform = byId.get(run.platformId); const questionScore = visibility.questionScores.find(row => row.questionId === run.questionId && row.platformId === run.platformId); const platformScore = visibility.platformScores.find(row => row.platformId === run.platformId); return { OverallScore: visibility.overallScore, PlatformScore: platformScore?.score ?? '', QuestionScore: questionScore?.score ?? '', RunScore: run.score ?? '', ScoreVersion: run.version, 有效: run.valid ? '是' : '否', 排除原因: run.reason, RunID: run.runId, QueryID: run.questionId, PlatformID: run.platformId, 问题: question?.current.prompt || entity?.current.prompt || '', 平台: platform?.current.name || '', Weight: run.weight, Mention: entity?.current.mentioned || '未知', Recommendation: entity?.current.recommended || '未知', Rank: entity?.current.rank || '', Top3: entity?.current.top3 || '未知', Top1: entity?.current.top1 || '未知', 审核状态: entity?.current.reviewStatus || '', AI原判定: JSON.stringify(entity?.aiOriginal || null), 当前人工版本: JSON.stringify(entity?.current || null), AI原始回答: (entity?.original?.answer || entity?.current.answer || '').slice(0, 31950), 修改时间: entity?.current.reviewedAt || '' }; });
  if (traceRows.length) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(traceRows), '评分追溯');
  return book;
}
