'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, Pause, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import type { Entity, Values } from '@/lib/geo-model';
import { scoreVisibilityRun, VISIBILITY_SCORE_CONFIG } from '@/lib/visibility-scoring';
import { aiProviders, isApiProvider } from '@/lib/ai-providers';

const reviewFields = ['resultValidity', 'mentioned', 'recommended', 'rank', 'sentiment', 'brandAccuracy', 'checkedFacts', 'correctFacts', 'competitors', 'sourceCandidates', 'judgment'] as const;

export type TestLiveState = { runId: string; stage: string; text: string; searchStatus?: string };

export function AiTestWorkspace({ runs, queries, platforms, currentRunId, live, testing, onSelect, onRun, onRerun, onPause, onContinue, onRetryFailed, onReview }: {
  runs: Entity[];
  queries: Entity[];
  platforms: Entity[];
  currentRunId: string;
  live: TestLiveState;
  testing: boolean;
  onSelect: (id: string) => void;
  onRun: (run: Entity) => void;
  onRerun: (run: Entity) => void;
  onPause: () => void;
  onContinue: () => void;
  onRetryFailed: () => void;
  onReview: (run: Entity, values: Values) => void;
}) {
  const selected = runs.find(run => run.id === currentRunId) || runs[0];
  const index = Math.max(0, runs.findIndex(run => run.id === selected?.id));
  const query = queries.find(item => item.id === selected?.current.queryId);
  const platform = platforms.find(item => item.id === selected?.current.platformId);
  const provider = platform && isApiProvider(platform.current.provider) ? aiProviders[platform.current.provider] : null;
  const draftKey = selected ? `${selected.id}:${selected.revision}` : '';
  const initialDraft = selected ? Object.fromEntries(reviewFields.map(key => [key, selected.current[key] || ''])) : {};
  const [draftState, setDraftState] = useState<{ key: string; values: Values }>({ key: '', values: {} });
  const draft = draftState.key === draftKey ? draftState.values : initialDraft;
  const scorePreview = selected ? scoreVisibilityRun({ ...selected.current, ...draft }) : null;

  const counts = useMemo(() => ({
    done: runs.filter(run => run.current.status === '已完成').length,
    failed: runs.filter(run => run.current.status === '失败').length,
    reviewed: runs.filter(run => run.current.reviewStatus === '人工已审核').length,
  }), [runs]);
  const percent = runs.length ? Math.round((counts.done + counts.failed) / runs.length * 100) : 0;
  const streaming = selected?.id === live.runId && Boolean(live.stage);
  const answer = streaming ? live.text : selected?.original?.answer || selected?.current.answer || '';
  const requestDebug = (() => {
    try { return JSON.parse(selected?.current.responseMetadata || '{}').requestDebug as Record<string, unknown> | undefined; }
    catch { return undefined; }
  })();
  const nativeSources = (() => { try { return JSON.parse(selected?.current.nativeSources || '[]') as Array<{url:string;title:string;kind:string}>; } catch { return []; } })();
  const set = (key: string, value: string) => setDraftState({ key: draftKey, values: { ...draft, [key]: value } });

  if (!runs.length) return <section className="geo-test-workspace geo-test-empty" aria-labelledby="test-workspace-title"><div><span className="geo-step">步骤 2</span><h2 id="test-workspace-title">AI 测试执行区</h2><p>选择测试范围并创建任务后，可在这里逐题运行、查看完整原文并完成审核。</p></div></section>;

  return <section className="geo-test-workspace" aria-labelledby="test-workspace-title">
    <header className="geo-test-header">
      <div><span className="geo-step">步骤 2 · AI 测试执行</span><h2 id="test-workspace-title">当前批次</h2><p className="geo-id">{selected?.current.batchId}</p></div>
      <div className="geo-progress-block"><div><strong>{counts.done + counts.failed}/{runs.length}</strong><span> 已处理 · {counts.reviewed} 已审核</span></div><progress className="geo-progress-track" aria-label="批量测试进度" max={100} value={percent}>{percent}%</progress><small>{percent}% · 失败 {counts.failed}</small></div>
      <div className="geo-toolbar">{testing ? <Button variant="outline" onClick={onPause}><Pause />暂停</Button> : <Button onClick={onContinue}><Play />继续批量测试</Button>}{counts.failed > 0 && <Button variant="outline" disabled={testing} onClick={onRetryFailed}><RefreshCw />重试失败</Button>}</div>
    </header>
    <div className="geo-test-grid">
      <aside className="geo-run-queue" aria-label="测试任务队列">
        <div className="geo-run-queue-title"><strong>任务队列</strong><span>{runs.length} 条 Run</span></div>
        {runs.map((run, runIndex) => {
          const runQuery = queries.find(item => item.id === run.current.queryId);
          const runPlatform = platforms.find(item => item.id === run.current.platformId);
          return <button key={run.id} className={run.id === selected?.id ? 'selected' : ''} onClick={() => onSelect(run.id)}><span>#{runIndex + 1}</span><span><strong>{runQuery?.current.prompt || run.current.prompt}</strong><small>{runPlatform?.current.name || '平台待确认'} · {run.current.status} · {run.current.reviewStatus || '待自动判定'}</small></span></button>;
        })}
      </aside>
      <div className="geo-test-detail">
        <div className="geo-question-head">
          <div className="geo-chip-row"><span className="geo-chip">问题 {index + 1}/{runs.length}</span><span className="geo-chip">{query?.current.category || '未分类'}</span><span className="geo-chip">{query?.current.intent || query?.current.stage || '标签待补充'}</span><span className="geo-chip">{query?.current.brandDirected === '是' ? '品牌定向' : '发现型'}</span></div>
          <h3>{selected?.current.prompt || query?.current.prompt}</h3>
          <p>{platform?.current.name || '平台待确认'} <span>·</span> {selected?.current.model || platform?.current.model || '模型待确认'} <span>·</span> Run {selected?.current.repeatIndex || '1'}</p>
          <div className="geo-runtime-status" aria-label="当前测试环境">
            <span><small>测试模式</small><strong>真实AI可见度测试</strong></span>
            <span><small>当前模型</small><strong>{selected?.current.model || platform?.current.model || '待确认'}</strong></span>
            <span><small>联网能力</small><strong>{provider && provider.webSearch !== 'unsupported' ? '官方工具支持' : '未接入'}</strong></span>
            <span><small>搜索工具</small><strong>{selected?.current.webSearchEnabled || (selected?.current.web === '否' ? '关闭' : '运行时开启')}</strong></span>
            <span><small>实际搜索</small><strong>{streaming && live.searchStatus ? live.searchStatus : selected?.current.searchStatus || (selected?.current.status === '待测试' ? '未执行' : '未知')}</strong></span>
            <span><small>本地知识库</small><strong>关闭</strong></span>
            <span><small>会话方式</small><strong>每题独立</strong></span>
          </div>
          {provider?.webSearch === 'unsupported' && <p className="geo-offline-warning"><AlertCircle/>当前测试为非联网模型结果，可能与消费者真实AI搜索结果存在差异。{provider.webSearchNote}</p>}
          <p className="geo-preserve-note">{provider?.webSearchNote} 正式测试必须确认搜索成功；未联网或证据未知的回答不计分。批量测试期间请保持页面打开，刷新后需点击继续。</p>
          <div className="geo-toolbar"><Button disabled={testing || selected?.current.status === '已完成'} onClick={() => selected && onRun(selected)}><Play />运行本题</Button><Button variant="outline" disabled={testing || !selected?.current.answer} onClick={() => selected && onRerun(selected)}><RotateCcw />重新运行</Button></div>
        </div>
        <div className="geo-answer-review-grid">
          <article className="geo-raw-answer">
            <div className="geo-section-title"><div><span>AI 原始回答</span><small>{streaming ? live.stage : selected?.current.testedAt || '尚未运行'}</small></div>{streaming && <span className="geo-live-dot">生成中</span>}</div>
            {answer ? <pre aria-live="polite">{answer}</pre> : <div className="geo-answer-placeholder">{selected?.current.status === '失败' ? <><AlertCircle />本次运行失败，可重试后继续。</> : '等待运行当前问题。'}</div>}
            {selected?.current.error && <p role="alert" className="geo-offline-warning">{selected.current.error}</p>}
            <details className="geo-request-debug"><summary>原生搜索来源与引用 · {nativeSources.length}</summary>{nativeSources.length ? <ul>{nativeSources.map((source,i)=><li key={i}>{/^https?:\/\//i.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer">{source.title || source.url}</a> : source.title}<small> · {source.kind === 'citation' ? '回答引用' : '检索来源'}</small></li>)}</ul> : <p>平台未返回可展示的原生来源。回答中的普通链接不作为搜索执行证据。</p>}</details>
            <p className="geo-preserve-note">{selected?.current.status === '失败' ? answer ? '本次收到的原文已保留，但未通过有效联网测试校验。' : '本次未收到回答正文。' : answer ? '原始回答已保留。' : '本次尚未收到回答。'}重新运行会创建新 Run，不覆盖本次记录。</p>
            {requestDebug && <details className="geo-request-debug"><summary>原始请求调试（已移除密钥）</summary><pre>{JSON.stringify(JSON.parse(selected?.current.responseMetadata || '{}'), null, 2)}</pre></details>}
          </article>
          <form className="geo-review-form" onSubmit={event => { event.preventDefault(); if (selected) onReview(selected, draft); }}>
            <div className="geo-section-title"><div><span>GEO 自动判定</span><small>{selected?.current.reviewStatus || '待自动判定'}{selected?.current.autoAnalysisModel ? ` · ${selected.current.autoAnalysisModel}` : ''}</small></div>{selected?.current.reviewStatus === '人工已审核' && <span className="geo-reviewed"><Check />已审核</span>}</div>
            <div className="geo-score-preview"><div><small>Answer Score · {VISIBILITY_SCORE_CONFIG.version}</small><strong>{scorePreview?.score ?? '—'}<em>/100</em></strong></div><span>Top3：{scorePreview?.valid ? scorePreview.top3 ? '是' : '否' : '—'}</span><span>Top1：{scorePreview?.valid ? scorePreview.top1 ? '是' : '否' : '—'}</span></div>
            <div className="geo-review-fields">
              <label>回答有效性<select value={draft.resultValidity || '待判定'} onChange={e => set('resultValidity', e.target.value)}><option>待判定</option><option>有效</option><option>无效回答</option><option>模型拒答</option><option>请求失败</option></select></label>
              <label>品牌提及<select value={draft.mentioned || '未知'} onChange={e => set('mentioned', e.target.value)}><option>未知</option><option>是</option><option>否</option></select></label>
              <label>主动推荐<select value={draft.recommended || '未知'} onChange={e => set('recommended', e.target.value)}><option>未知</option><option>是</option><option>否</option></select></label>
              <label>推荐名次<input type="number" min="1" value={draft.rank || ''} onChange={e => set('rank', e.target.value)} placeholder="无明确顺序则留空" /></label>
              <label>情感倾向<select value={draft.sentiment || '未知'} onChange={e => set('sentiment', e.target.value)}><option>未知</option><option>正向</option><option>中性</option><option>负向</option><option>混合</option></select></label>
              <label>品牌描述准确度<select value={draft.brandAccuracy || '未知'} onChange={e => set('brandAccuracy', e.target.value)}><option>未知</option><option>准确</option><option>部分准确</option><option>不准确</option><option>无法核实</option></select></label>
              <label>已核实事实数<input type="number" min="0" value={draft.checkedFacts || '0'} onChange={e => set('checkedFacts', e.target.value)} /></label>
              <label>正确事实数<input type="number" min="0" max={draft.checkedFacts || undefined} value={draft.correctFacts || '0'} onChange={e => set('correctFacts', e.target.value)} /></label>
              <label className="geo-span">竞品<input value={draft.competitors || ''} onChange={e => set('competitors', e.target.value)} placeholder="回答中出现的竞品" /></label>
              <label className="geo-span">可能的引用来源<textarea rows={3} value={draft.sourceCandidates || ''} onChange={e => set('sourceCandidates', e.target.value)} placeholder="URL、域名、平台或来源标题" /></label>
              <label className="geo-span">判定说明<textarea rows={3} value={draft.judgment || ''} onChange={e => set('judgment', e.target.value)} placeholder="记录人工判断依据和不确定性" /></label>
            </div>
            <Button type="submit" disabled={!selected?.current.answer || streaming}><Check />保存人工审核</Button>
          </form>
        </div>
        <footer className="geo-test-nav"><Button variant="outline" disabled={index <= 0} onClick={() => onSelect(runs[index - 1].id)}><ArrowLeft />上一题</Button><span>{index + 1} / {runs.length}</span><Button variant="outline" disabled={index >= runs.length - 1} onClick={() => onSelect(runs[index + 1].id)}>下一题<ArrowRight /></Button></footer>
      </div>
    </div>
  </section>;
}
