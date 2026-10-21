'use client';

import { ArrowRight, Pencil, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { discoveryVisibility, list, scopedRuns, type Entity, type Scope, type Workspace } from '@/lib/geo-model';
import { scoreVisibilityRun, VISIBILITY_SCORE_CONFIG } from '@/lib/visibility-scoring';

const score = (value: number | null) => value === null ? '—' : `${value.toFixed(1)} / 100`;
const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
const day = (value: string) => value ? value.slice(0, 10) : '—';

export function VisibilityResults({ workspace, clientId, scope, search, onSearch, onEdit, onGap, onSuggest, busy }: {
  workspace: Workspace;
  clientId: string;
  scope: Scope;
  search: string;
  onSearch: (value: string) => void;
  onEdit: (run: Entity) => void;
  onGap: (run: Entity) => void;
  onSuggest: (run: Entity) => void;
  busy: boolean;
}) {
  const summary = discoveryVisibility(workspace, clientId, scope);
  const queries = new Map(list(workspace, 'query', clientId).map(query => [query.id, query]));
  const platforms = new Map(list(workspace, 'platform', clientId).map(platform => [platform.id, platform]));
  const brandRuns = scopedRuns(workspace, clientId, { ...scope, brand: 'brand' });
  const checkedFacts = brandRuns.reduce((sum, run) => sum + Number(run.current.checkedFacts || 0), 0);
  const correctFacts = brandRuns.reduce((sum, run) => sum + Number(run.current.correctFacts || 0), 0);
  const brandAccuracy = checkedFacts ? correctFacts / checkedFacts * 100 : null;
  const rawRuns = list(workspace, 'run', clientId).filter(run => (!scope.platformId || run.current.platformId === scope.platformId)
    && (!scope.from || Boolean(run.current.testedAt) && run.current.testedAt.slice(0, 10) >= scope.from!)
    && (!scope.to || Boolean(run.current.testedAt) && run.current.testedAt.slice(0, 10) <= scope.to!)
    && ((scope.brand || 'discovery') === 'all' || ((scope.brand || 'discovery') === 'brand' ? run.current.brandDirected === '是' : run.current.brandDirected !== '是'))
    && (!search || JSON.stringify(run.current).toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => (b.current.testedAt || b.createdAt).localeCompare(a.current.testedAt || a.createdAt));

  return <>
    <section className="geo-visibility-hero" aria-labelledby="visibility-title">
      <div><span className="geo-step">核心 GEO KPI · {summary.version}</span><h2 id="visibility-title">AI 发现可见度</h2><strong>{score(summary.overallScore)}</strong><p>仅统计有效的非品牌定向测试。先计算 Run Score，再按问题、平台逐层汇总。</p></div>
      <div className="geo-visibility-rates">{[
        ['Mention Rate', summary.mentionRate],
        ['Recommendation Rate', summary.recommendationRate],
        ['Top3 Rate', summary.top3Rate],
        ['Top1 Rate', summary.top1Rate],
      ].map(([label, value]) => <div key={String(label)}><small>{label}</small><strong>{percent(value as number | null)}</strong></div>)}</div>
      <div className="geo-visibility-meta"><span>有效测试<strong>{summary.validRunCount}</strong></span><span>失败测试<strong>{summary.failedRunCount}</strong></span><span>待判定 / 无效<strong>{summary.invalidRunCount}</strong></span><span>问题数<strong>{summary.questionCount}</strong></span><span>平台数<strong>{summary.platformCount}</strong></span><span>测试时间<strong>{day(summary.from)} – {day(summary.to)}</strong></span></div>
      <details><summary>查看评分公式与追溯层级</summary><p>Answer Score = {VISIBILITY_SCORE_CONFIG.mention}×Mention + {VISIBILITY_SCORE_CONFIG.recommendation}×Recommendation + {VISIBILITY_SCORE_CONFIG.top3}×Top3 + {VISIBILITY_SCORE_CONFIG.top1}×Top1。Question Score 为同题同平台多次 Run 平均；Platform Score 按 Question Weight 加权；Overall Score 为有效平台等权平均。</p></details>
    </section>

    <section className="geo-panel"><h2>各平台可见度</h2><p className="geo-subtle">只显示实际存在有效测试结果的平台；V1.0 平台权重均为 1。</p><div className="geo-table-scroll"><table><thead><tr><th>平台</th><th>Visibility Score</th><th>有效问题</th><th>有效 Run</th><th>平台权重</th></tr></thead><tbody>{summary.platformScores.map(platform => <tr key={platform.platformId}><td>{platform.name}</td><td><strong>{score(platform.score)}</strong></td><td>{platform.questionCount}</td><td>{platform.runCount}</td><td>{platform.platformWeight}</td></tr>)}</tbody></table>{!summary.platformScores.length && <p className="geo-empty-row">暂无完成结构化判定的发现型测试。</p>}</div></section>

    <section className="geo-panel"><h2>按问题类型表现</h2><p className="geo-subtle">分类从当前题库动态聚合；类别内仍先合并重复 Run，再使用 Question Weight 加权。</p><div className="geo-table-scroll"><table><thead><tr><th>问题类型</th><th>Visibility Score</th><th>问题数</th><th>有效 Run</th></tr></thead><tbody>{summary.categoryScores.map(category => <tr key={category.category}><td>{category.category}</td><td>{score(category.score)}</td><td>{category.questionCount}</td><td>{category.runCount}</td></tr>)}</tbody></table>{!summary.categoryScores.length && <p className="geo-empty-row">暂无可聚合的问题类型。</p>}</div></section>

    <section className="geo-panel"><h2>AI 品牌认知 · 基础统计</h2><p className="geo-subtle">品牌定向问题与核心可见度分流。本版只展示可客观计算的事实核实框架，不创建主观综合分。</p><div className="geo-knowledge-stats"><span>有效品牌定向 Run<strong>{brandRuns.length}</strong></span><span>已核实事实<strong>{checkedFacts}</strong></span><span>正确事实<strong>{correctFacts}</strong></span><span>品牌事实准确率<strong>{percent(brandAccuracy)}</strong></span></div></section>

    <section className="geo-panel"><div className="geo-list-head"><div><h2>测试记录 · {rawRuns.length}</h2><p className="geo-subtle">每一分均可继续追溯到平台、问题、单次 Run 与完整原始回答。</p></div><input aria-label="搜索测试记录" placeholder="搜索问题、回答、平台或标签" value={search} onChange={event => onSearch(event.target.value)} /></div>{!rawRuns.length ? <div className="geo-empty compact"><p>尚无符合条件的测试记录</p></div> : <div className="geo-table-scroll"><table className="geo-result-table"><thead><tr><th>问题</th><th>平台 / Run</th><th>原始回答</th><th>Mention</th><th>Recommendation</th><th>Rank</th><th>Top3</th><th>Top1</th><th>Run Score</th><th>Question Score</th><th>Platform Score</th><th>Weight</th><th>审核</th><th>操作</th></tr></thead><tbody>{rawRuns.map(run => {
      const query = queries.get(run.current.queryId); const platform = platforms.get(run.current.platformId); const runScore = scoreVisibilityRun(run.current); const questionScore = summary.questionScores.find(row => row.questionId === run.current.queryId && row.platformId === run.current.platformId); const platformScore = summary.platformScores.find(row => row.platformId === run.current.platformId); const originalPreserved = Boolean(run.original?.answer && run.original.answer === run.current.answer); const included = originalPreserved && runScore.valid;
      return <tr key={run.id}><td><strong>{query?.current.prompt || run.current.prompt}</strong><small>{query?.current.category || '未分类'} · {run.current.brandDirected === '是' ? '品牌定向' : '发现型'}</small></td><td>{platform?.current.name || '平台待确认'}<small>{run.current.model || '模型待确认'} · #{run.current.repeatIndex || '1'}</small></td><td><details><summary aria-label="展开查看完整原始回答">查看完整原文</summary><pre>{run.original?.answer || run.current.answer || run.current.notes || '没有有效回答'}</pre></details></td><td>{run.current.mentioned || '未知'}</td><td>{run.current.recommended || '未知'}</td><td>{run.current.rank || '—'}</td><td>{runScore.valid ? (runScore.top3 ? '是' : '否') : '—'}</td><td>{runScore.valid ? (runScore.top1 ? '是' : '否') : '—'}</td><td>{run.current.brandDirected === '是' ? '品牌认知，不计分' : included ? `${runScore.score}` : '—'}<small>{included ? runScore.version : run.current.status === '失败' ? '失败，已排除' : !originalPreserved ? '人工改写，已排除' : runScore.reason}</small></td><td>{included && questionScore ? questionScore.score.toFixed(1) : '—'}</td><td>{included && platformScore ? platformScore.score.toFixed(1) : '—'}</td><td>{run.current.queryWeight || query?.current.weight || '1'}</td><td>{run.current.reviewStatus || '待自动判定'}<small>{run.current.reviewedAt ? day(run.current.reviewedAt) : ''}</small></td><td><div className="geo-row-actions"><Button aria-label="编辑这条测试记录" variant="outline" onClick={() => onEdit(run)}><Pencil aria-hidden="true" />编辑</Button><Button aria-label="从这条测试记录创建 Gap" variant="outline" onClick={() => onGap(run)}><ArrowRight aria-hidden="true" />Gap</Button><Button aria-label="为这条测试记录生成候选稿" variant="ghost" disabled={busy} onClick={() => onSuggest(run)}><Sparkles aria-hidden="true" />候选稿</Button></div></td></tr>;
    })}</tbody></table></div>}</section>
  </>;
}
