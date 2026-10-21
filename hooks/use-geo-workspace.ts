'use client';
import { useEffect, useRef, useState } from 'react';
import { emptyWorkspace, validateWorkspace, type Workspace } from '@/lib/geo-model';
import { migrateLegacy } from '@/lib/geo-migration';
const DRAFT_KEY = 'geo-operations-pending-v2';
export function useGeoWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const ref = useRef(workspace); const revision = useRef(0); const localVersion = useRef(0); const savedVersion = useRef(0); const inFlight = useRef(false); const blocked = useRef(false);
  const [ready, setReady] = useState(false); const [status, setStatus] = useState('正在读取服务端工作区…');
  const [recovery, setRecovery] = useState<Workspace | null>(null);
  const update = (next: Workspace | ((w: Workspace) => Workspace)) => {
    const value = typeof next === 'function' ? next(ref.current) : next;
    const error = validateWorkspace(value); if (error) throw new Error(error);
    ref.current = value; localVersion.current++; setWorkspace(value); setStatus('待保存到服务端');
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch { setStatus('待服务端保存；本机草稿空间不足，请导出备份'); }
  };
  const save = async () => {
    if (!ready || blocked.current || inFlight.current || savedVersion.current === localVersion.current) return;
    inFlight.current = true; const version = localVersion.current; const value = ref.current;
    setStatus('正在保存到服务端…');
    try {
      const response = await fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: revision.current, workspace: value }) });
      const data: any = await response.json();
      if (!response.ok) { if (response.status === 409) blocked.current = true; throw new Error(data.error || '保存失败'); }
      revision.current = data.revision; savedVersion.current = version;
      if (version === localVersion.current) { setStatus('已保存到服务端'); localStorage.removeItem(DRAFT_KEY); }
    } catch (error) { setStatus(error instanceof Error ? error.message : '保存失败；草稿已保留，可重试或导出'); }
    finally { inFlight.current = false; }
  };
  useEffect(() => {
    let active = true;
    try { const pending = localStorage.getItem(DRAFT_KEY); if (pending) { const draft = JSON.parse(pending); if (!validateWorkspace(draft)) setRecovery(draft); } } catch { /* Leave damaged backup untouched. */ }
    void (async () => {
      try {
        const response = await fetch('/api/workspace', { cache: 'no-store' }); const data: any = await response.json();
        if (!response.ok) throw new Error(data.error || '服务端工作区读取失败');
        if (!active) return;
        const invalid = validateWorkspace(data.workspace); if (invalid) throw new Error(invalid);
        revision.current = data.revision; let next = data.workspace as Workspace;
        if (!next.entities.length) {
          const old = localStorage.getItem('geo-diagnosis-workspace-v1');
          if (old) { try { const migrated = migrateLegacy(JSON.parse(old)); if (!validateWorkspace(migrated) && migrated.entities.length) { next = migrated; localVersion.current++; } } catch { /* Preserve the original browser backup. */ } }
        }
        ref.current = next; setWorkspace(next); setStatus('已读取服务端工作区');
        const pending = localStorage.getItem(DRAFT_KEY);
        if (pending) { try { const draft = JSON.parse(pending); if (!validateWorkspace(draft) && JSON.stringify(draft) !== JSON.stringify(next)) setRecovery(draft); } catch { /* Never erase a damaged backup automatically. */ } }
        setReady(true);
      } catch (error) { if (active) setStatus(error instanceof Error ? error.message : '工作区读取失败，请刷新重试'); }
    })(); return () => { active = false; };
  }, []);
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => void save(), 600); return () => clearTimeout(timer); }, [workspace, ready]);
  useEffect(() => { const listener = (event: BeforeUnloadEvent) => { if (localVersion.current !== savedVersion.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', listener); return () => window.removeEventListener('beforeunload', listener); }, []);
  useEffect(() => { const timer = setInterval(() => { if (ready && !inFlight.current && !blocked.current && localVersion.current !== savedVersion.current) void save(); }, 15000); return () => clearInterval(timer); }, [ready]);
  return { workspace, ref, update, ready, status, save, recovery, dismissRecovery: () => setRecovery(null) };
}
