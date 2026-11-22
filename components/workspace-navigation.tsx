'use client';

import { useRef, useState } from 'react';
import {
  ArrowLeft, BarChart3, BookOpen, Building2, ChevronDown, ClipboardList,
  FileText, FlaskConical, Layers3, ListChecks, Menu, Network, Plug,
  Plus, Search, Settings, SlidersHorizontal, Target, TrendingUp,
} from 'lucide-react';
import type { Entity } from '@/lib/geo-model';

export const modules = {
  overview: ['运营总览', 'Overview', BarChart3],
  fact: ['品牌事实', 'Brand Facts', Building2],
  query: ['问题库', 'Query Library', ClipboardList],
  run: ['AI 测试', 'AI Results', FlaskConical],
  source: ['来源审计', 'Source Audit', Network],
  gap: ['缺口诊断', 'Gap Diagnosis', Search],
  action: ['优化动作', 'Optimization Actions', ListChecks],
  experiment: ['实验与复测', 'Experiment / Re-test', FlaskConical],
  monthly: ['月度跟踪', 'Monthly Tracking', TrendingUp],
  outcome: ['业务结果', 'Business Outcome', Target],
  report: ['报告与总结', 'Reports', FileText],
  protocol: ['测试协议', 'Testing Protocol', SlidersHorizontal],
  platform: ['平台与连接', 'Platforms', Plug],
} as const;
export type View = keyof typeof modules;

const shortcuts = ['overview', 'query', 'run'] as const;
const groups = [
  { label: '品牌与来源', icon: BookOpen, items: ['fact', 'source'] },
  { label: '诊断与优化', icon: Layers3, items: ['gap', 'action', 'experiment'] },
  { label: '跟踪与报告', icon: TrendingUp, items: ['monthly', 'outcome', 'report'] },
  { label: '测试设置', icon: Settings, items: ['protocol', 'platform'] },
] as const satisfies ReadonlyArray<{ label: string; icon: typeof BookOpen; items: readonly View[] }>;

type Props = {
  view: View;
  onNavigate: (view: View) => void;
  clients: Entity[];
  clientId: string;
  entities: Entity[];
  onClientChange: (id: string) => void;
  onAddClient: () => void;
  testing: boolean;
  ready: boolean;
};

export function WorkspaceNavigation(props: Props) {
  const { view, onNavigate, clients, clientId, entities } = props;
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopTrigger = useRef<HTMLButtonElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const counts = new Map<string, number>();
  for (const entity of entities) counts.set(entity.kind, (counts.get(entity.kind) ?? 0) + 1);

  function closePanel() {
    if (window.matchMedia('(max-width: 760px)').matches) {
      setMobileOpen(false);
      mobileTrigger.current?.focus();
    } else {
      setDesktopOpen(false);
      desktopTrigger.current?.focus();
    }
  }

  function navigate(id: View) {
    onNavigate(id);
    if (window.matchMedia('(max-width: 760px)').matches) {
      setMobileOpen(false);
      document.getElementById('geo-content')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  function moduleButton(id: View, quick = false) {
    const [label, , Icon] = modules[id];
    const count = counts.get(id);
    return <button type="button" key={id} className={quick ? 'wn-shortcut' : 'wn-item'}
      aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>
      <span className="wn-icon"><Icon size={18} aria-hidden="true" /></span>
      <span>{label}</span>
      {!!count && <span className="wn-count" aria-label={count + ' 条记录'}>{count}</span>}
    </button>;
  }

  return <aside className="workspace-nav" data-desktop-open={desktopOpen} data-mobile-open={mobileOpen}
    onKeyDown={event => { if (event.key === 'Escape' && event.target instanceof HTMLElement && event.target.closest('.wn-panel')) closePanel(); }}>
    <a className="wn-skip" href="#geo-content">跳到工作区</a>
    <div className="wn-brandbar">
      <button className="wn-brandmark" ref={desktopTrigger} type="button" aria-controls="workspace-nav-panel"
        aria-label={desktopOpen ? '收起导航' : '展开导航'} title={desktopOpen ? '收起导航' : '展开导航'}
        aria-expanded={desktopOpen} onClick={() => setDesktopOpen(!desktopOpen)}><Layers3 size={20} aria-hidden="true" /></button>
      <span className="wn-mobile-mark" aria-hidden="true"><Layers3 size={20} /></span>
      <strong>GEO 运营系统</strong>
      <button type="button" className="wn-mobile-toggle" ref={mobileTrigger} aria-controls="workspace-nav-panel"
        aria-expanded={mobileOpen} aria-label={mobileOpen ? '收起导航' : '展开导航'} onClick={() => setMobileOpen(!mobileOpen)}>
        {modules[view][0]} <Menu size={18} aria-hidden="true" />
      </button>
    </div>
    <div className="wn-panel" id="workspace-nav-panel">
      <div className="wn-heading"><h2>工作台导航</h2>
        <button type="button" aria-label="关闭导航面板" title="收起导航" onClick={closePanel}><ArrowLeft size={20} aria-hidden="true" /></button>
      </div>
      <div className="wn-scroll">
        <section className="wn-section">
          <label className="wn-label" htmlFor="wn-client">当前客户</label>
          <div className="wn-select"><select id="wn-client" value={clientId} disabled={props.testing || !clients.length}
            onChange={event => props.onClientChange(event.target.value)}>
            {!clients.length && <option value="">尚无客户</option>}
            {clients.map(client => <option key={client.id} value={client.id}>{client.current.brand}</option>)}
          </select><ChevronDown size={18} aria-hidden="true" /></div>
        </section>
        <nav aria-label="运营模块">
          <section className="wn-section"><h3 className="wn-label">快捷入口</h3>
            <div className="wn-shortcuts">{shortcuts.map(id => moduleButton(id, true))}</div>
          </section>
          <section className="wn-section"><h3 className="wn-label">工作模块</h3>
            <div className="wn-groups">{groups.map(({ label, icon: Icon, items }) =>
              <details className="wn-group" key={label} data-current={items.some(id => id === view)}>
                <summary><Icon size={17} aria-hidden="true" /><span>{label}</span><ChevronDown className="wn-chevron" size={17} aria-hidden="true" /></summary>
                <div className="wn-items">{items.map(id => moduleButton(id))}</div>
              </details>
            )}</div>
          </section>
        </nav>
      </div>
      <div className="wn-foot"><button type="button" disabled={!props.ready || props.testing} onClick={props.onAddClient}>
        <Plus size={18} aria-hidden="true" />新建客户
      </button></div>
    </div>
  </aside>;
}
