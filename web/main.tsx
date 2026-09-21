import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive, ArrowRight, ArrowUpRight, BookOpen, Boxes, Check, ChevronRight, CircleAlert,
  Database, Download, FileJson, FileText, Import, Link2, Plus, Search, ShieldCheck,
  Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { exportBackup, restoreBackup } from '../src/core/backup';
import { WorkbenchDatabase, db, deleteAllLocalData, getDemoDatabase } from '../src/core/db';
import { seedDemo } from '../src/core/demo';
import type { Category, Entity, Excerpt, ItemCategory, ItemEntity, Platform, SourceItem, TextStatus } from '../src/core/types';
import { platformLabel } from '../src/core/types';
import { nowIso, sanitizeUrl } from '../src/core/utils';
import { parseQuickImport, saveWebBookmark, type WebBookmarkInput } from '../src/core/web-import';
import './style.css';

type View = 'library' | 'entities' | 'data';
type ImportMode = 'single' | 'batch';

interface Snapshot {
  items: SourceItem[];
  categories: Category[];
  itemCategories: ItemCategory[];
  entities: Entity[];
  itemEntities: ItemEntity[];
  excerpts: Excerpt[];
}

const emptySnapshot: Snapshot = {
  items: [], categories: [], itemCategories: [], entities: [], itemEntities: [], excerpts: [],
};

function useSnapshot(database: WorkbenchDatabase, refreshKey: number) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [items, categories, itemCategories, entities, itemEntities, excerpts] = await Promise.all([
        database.items.where('activeState').equals('active').reverse().sortBy('lastSeenAt'),
        database.categories.orderBy('updatedAt').reverse().toArray(),
        database.itemCategories.toArray(),
        database.entities.orderBy('updatedAt').reverse().toArray(),
        database.itemEntities.toArray(),
        database.excerpts.toArray(),
      ]);
      if (!cancelled) {
        setSnapshot({ items, categories, itemCategories, entities, itemEntities, excerpts });
        setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [database, refreshKey]);
  return { snapshot, loading };
}

function App() {
  const [view, setView] = useState<View>('library');
  const [demoMode, setDemoMode] = useState(() => localStorage.getItem('shicang-demo') === '1');
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => localStorage.getItem('shicang-welcomed') !== '1');
  const [toast, setToast] = useState('');
  const database = demoMode ? getDemoDatabase() : db;
  const { snapshot, loading } = useSnapshot(database, refreshKey);
  const refresh = () => setRefreshKey((value) => value + 1);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('zh-CN');
    return snapshot.items.filter((item) => {
      if (platform !== 'all' && item.platform !== platform) return false;
      return !needle || `${item.title} ${item.author ?? ''} ${item.text ?? ''}`.toLocaleLowerCase('zh-CN').includes(needle);
    });
  }, [snapshot.items, query, platform]);
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0] ?? null;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sharedUrl = params.get('url') ?? extractUrl(params.get('text') ?? '');
    if (sharedUrl) {
      setWelcomeOpen(false);
      setImportOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const enterApp = () => {
    localStorage.setItem('shicang-welcomed', '1');
    setWelcomeOpen(false);
    setImportOpen(true);
  };
  const enterDemo = async () => {
    await seedDemo(getDemoDatabase());
    localStorage.setItem('shicang-demo', '1');
    localStorage.setItem('shicang-welcomed', '1');
    setDemoMode(true);
    setWelcomeOpen(false);
    setView('library');
    refresh();
  };
  const exitDemo = () => {
    localStorage.removeItem('shicang-demo');
    setDemoMode(false);
    setSelectedId(null);
    refresh();
  };

  return <>
    <div className="app-shell">
      <Sidebar view={view} setView={setView} total={snapshot.items.length} />
      <main className="workspace">
        {demoMode && <div className="demo-ribbon"><span>合成演示库</span>不会混入你的收藏。<button onClick={exitDemo}>回到我的资料</button></div>}
        <Topbar view={view} query={query} setQuery={setQuery} onImport={() => setImportOpen(true)} />
        {view === 'library' && <Library
          snapshot={snapshot}
          items={filtered}
          loading={loading}
          selected={selected}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          platform={platform}
          setPlatform={setPlatform}
          database={database}
          refresh={refresh}
          onImport={() => setImportOpen(true)}
          notify={setToast}
        />}
        {view === 'entities' && <Entities snapshot={snapshot} database={database} refresh={refresh} notify={setToast} />}
        {view === 'data' && <DataPage
          database={database}
          demoMode={demoMode}
          onDemo={enterDemo}
          refresh={refresh}
          notify={setToast}
        />}
      </main>
    </div>
    {welcomeOpen && <Welcome onStart={enterApp} onDemo={enterDemo} onClose={() => { localStorage.setItem('shicang-welcomed', '1'); setWelcomeOpen(false); }} />}
    {importOpen && <ImportSheet
      database={database}
      onClose={() => setImportOpen(false)}
      onSaved={(message) => { refresh(); setToast(message); }}
    />}
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
  </>;
}

function Sidebar({ view, setView, total }: { view: View; setView: (view: View) => void; total: number }) {
  const navigation: Array<[View, string, React.ReactNode]> = [
    ['library', '全部收藏', <Archive size={19} />],
    ['entities', '对象对照', <Boxes size={19} />],
    ['data', '本地数据', <Database size={19} />],
  ];
  return <aside className="sidebar">
    <button className="brand" onClick={() => setView('library')} aria-label="拾藏首页">
      <span className="brand-mark">拾</span><span><b>拾藏</b><small>SHICANG</small></span>
    </button>
    <nav>{navigation.map(([id, label, icon]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}>{icon}<span>{label}</span>{id === 'library' && <em>{total}</em>}</button>)}</nav>
    <div className="sidebar-note"><ShieldCheck size={18} /><span><b>只存此设备</b><small>无需注册 · 无云端账号</small></span></div>
  </aside>;
}

function Topbar({ view, query, setQuery, onImport }: { view: View; query: string; setQuery: (value: string) => void; onImport: () => void }) {
  const labels: Record<View, [string, string]> = {
    library: ['全部收藏', '搜索、分类并核对原始出处'],
    entities: ['对象对照', '把同一地点、产品或作品并列查看'],
    data: ['本地数据', '备份、迁移与隐私边界'],
  };
  return <header className="topbar">
    <div className="topbar-title"><span className="mobile-mark">拾</span><div><h1>{labels[view][0]}</h1><p>{labels[view][1]}</p></div></div>
    <div className="topbar-actions">
      {view === 'library' && <label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者或正文" /></label>}
      <button className="primary-action" onClick={onImport}><Plus size={18} /><span>添加收藏</span></button>
    </div>
  </header>;
}

interface LibraryProps {
  snapshot: Snapshot;
  items: SourceItem[];
  loading: boolean;
  selected: SourceItem | null;
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  platform: Platform | 'all';
  setPlatform: (platform: Platform | 'all') => void;
  database: WorkbenchDatabase;
  refresh: () => void;
  onImport: () => void;
  notify: (message: string) => void;
}

function Library(props: LibraryProps) {
  const { snapshot, items, loading, selected, setSelectedId, platform, setPlatform, database, refresh, onImport, notify } = props;
  return <div className="library-layout">
    <section className="collection-pane">
      <div className="filterbar">
        <div className="segmented">
          {([['all', '全部'], ['xiaohongshu', '小红书'], ['douyin', '抖音']] as const).map(([id, label]) => <button key={id} className={platform === id ? 'active' : ''} onClick={() => setPlatform(id)}>{label}</button>)}
        </div>
        <span>{items.length} 条</span>
      </div>
      <div className="list-head"><span>收藏内容</span><span>整理结果</span><span>保存时间</span></div>
      <div className="item-list">
        {loading && <Empty icon={<Sparkles className="pulse" />} title="正在读取本地资料" />}
        {!loading && items.length === 0 && <Empty icon={<Archive />} title="从第一条收藏开始" detail="粘贴链接与可见文字，分类和摘录会在浏览器里完成。" action="添加收藏" onAction={onImport} />}
        {items.map((item, index) => {
          const categories = snapshot.itemCategories.filter((entry) => entry.itemId === item.id).map((entry) => snapshot.categories.find((category) => category.id === entry.categoryId)).filter(Boolean) as Category[];
          const entity = snapshot.itemEntities.filter((entry) => entry.itemId === item.id && entry.status !== 'rejected').map((entry) => snapshot.entities.find((candidate) => candidate.id === entry.entityId)).find(Boolean);
          return <button key={item.id} className={`item-row ${selected?.id === item.id ? 'selected' : ''}`} style={{ animationDelay: `${Math.min(index, 10) * 28}ms` }} onClick={() => setSelectedId(item.id)}>
            <div className="item-title"><SourceDot platform={item.platform} /><span><b>{item.title}</b><small>{item.author ?? '作者未记录'} · {textStatusLabel(item.textStatus)}</small></span></div>
            <div className="row-tags">{categories.slice(0, 2).map((category) => <span key={category.id} style={{ '--tag': category.color } as React.CSSProperties}>{category.name}</span>)}{entity && <span className="entity-tag"><Link2 size={12} />{entity.name}</span>}</div>
            <time>{formatDate(item.lastSeenAt)}</time>
          </button>;
        })}
      </div>
    </section>
    <Inspector item={selected} snapshot={snapshot} database={database} refresh={refresh} notify={notify} />
  </div>;
}

function Inspector({ item, snapshot, database, refresh, notify }: { item: SourceItem | null; snapshot: Snapshot; database: WorkbenchDatabase; refresh: () => void; notify: (message: string) => void }) {
  if (!item) return <aside className="inspector inspector-empty"><FileText size={28} /><p>选择一条收藏查看证据</p></aside>;
  const excerpts = snapshot.excerpts.filter((excerpt) => excerpt.itemId === item.id);
  const assigned = snapshot.itemCategories.filter((entry) => entry.itemId === item.id);
  const openOriginal = () => {
    const url = sanitizeUrl(item.navigationUrl, item.platform);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };
  const toggleCategory = async (category: Category) => {
    const id = `${item.id}|${category.id}`;
    const existing = await database.itemCategories.get(id);
    if (existing) await database.itemCategories.delete(id);
    else await database.itemCategories.put({ id, itemId: item.id, categoryId: category.id, source: 'user', score: null, evidence: ['用户在网页版手动设置'], locked: true, updatedAt: nowIso() });
    refresh();
  };
  const remove = async () => {
    if (!window.confirm('只从本机移除这条收藏？原平台内容不会受到影响。')) return;
    await database.transaction('rw', database.items, database.itemCategories, database.itemEntities, database.excerpts, database.featureCache, async () => {
      await database.items.delete(item.id);
      await database.itemCategories.where('itemId').equals(item.id).delete();
      await database.itemEntities.where('itemId').equals(item.id).delete();
      await database.excerpts.where('itemId').equals(item.id).delete();
      await database.featureCache.where('itemId').equals(item.id).delete();
    });
    refresh(); notify('已从这台设备移除');
  };
  return <aside className="inspector">
    <div className="inspector-kicker"><span><SourceDot platform={item.platform} />{platformLabel[item.platform]}</span><button onClick={() => void remove()} title="从本机移除"><Trash2 size={16} /></button></div>
    <h2>{item.title}</h2>
    <p className="meta">{item.author ?? '作者未记录'} · {formatDate(item.lastSeenAt)} 保存</p>
    <button className="original-link" onClick={openOriginal}>查看原内容 <ArrowUpRight size={15} /></button>
    <section>
      <div className="section-label"><span>摘录证据</span><small>{item.textStatus === 'metadata_only' ? '正文未提供' : '来自你提供的文字'}</small></div>
      {item.textScope && <p className="scope-note"><CircleAlert size={14} />{item.textScope}</p>}
      <div className="excerpt-list">{excerpts.map((excerpt) => <blockquote key={excerpt.id}><p>{excerpt.text}</p><footer>{excerpt.sourceField === 'title' ? '标题' : `正文 ${excerpt.start}–${excerpt.end}`}</footer></blockquote>)}</div>
    </section>
    <section>
      <div className="section-label"><span>分类</span><small>点击切换</small></div>
      <div className="category-picker">{snapshot.categories.map((category) => {
        const active = assigned.some((entry) => entry.categoryId === category.id);
        return <button key={category.id} className={active ? 'active' : ''} onClick={() => void toggleCategory(category)}><i style={{ background: category.color }} />{category.name}{active && <Check size={12} />}</button>;
      })}</div>
    </section>
  </aside>;
}

function Entities({ snapshot, database, refresh, notify }: { snapshot: Snapshot; database: WorkbenchDatabase; refresh: () => void; notify: (message: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = snapshot.entities.find((entity) => entity.id === selectedId) ?? snapshot.entities[0] ?? null;
  const links = selected ? snapshot.itemEntities.filter((link) => link.entityId === selected.id && link.status !== 'rejected') : [];
  const items = links.map((link) => snapshot.items.find((item) => item.id === link.itemId)).filter(Boolean) as SourceItem[];
  const unlink = async (itemId: string) => {
    if (!selected) return;
    await database.itemEntities.delete(`${itemId}|${selected.id}`);
    refresh(); notify('已移出对象，不影响收藏本身');
  };
  return <div className="entity-layout">
    <section className="entity-index">
      <div className="entity-index-head"><span>具体对象</span><em>{snapshot.entities.length}</em></div>
      {snapshot.entities.length === 0 && <Empty icon={<Boxes />} title="还没有对象" detail="添加收藏时填写地点、门店、型号或作品名，就能跨平台并列查看。" />}
      {snapshot.entities.map((entity) => {
        const count = snapshot.itemEntities.filter((link) => link.entityId === entity.id && link.status !== 'rejected').length;
        return <button key={entity.id} className={selected?.id === entity.id ? 'active' : ''} onClick={() => setSelectedId(entity.id)}><span><b>{entity.name}</b><small>{entity.type === 'other' ? '未指定类型' : entity.type}</small></span><em>{count}</em><ChevronRight size={16} /></button>;
      })}
    </section>
    <section className="entity-detail">
      {selected ? <>
        <header><span className="eyebrow">CROSS-PLATFORM OBJECT</span><h2>{selected.name}</h2><p>同一对象的来源保持独立，不合并成无法追溯的结论。</p></header>
        <div className="comparison-grid">{(['xiaohongshu', 'douyin'] as Platform[]).map((source) => <div className="platform-column" key={source}>
          <div className="column-title"><SourceDot platform={source} />{platformLabel[source]}<span>{items.filter((item) => item.platform === source).length}</span></div>
          {items.filter((item) => item.platform === source).map((item) => <article key={item.id}><b>{item.title}</b><p>{item.text?.slice(0, 220) ?? '正文未提供，暂不能形成内容摘录。'}</p><footer><button onClick={() => window.open(item.navigationUrl, '_blank', 'noopener,noreferrer')}>查看来源 <ArrowUpRight size={13} /></button><button onClick={() => void unlink(item.id)}>移出对象</button></footer></article>)}
          {items.every((item) => item.platform !== source) && <div className="empty-column">此平台暂无来源</div>}
        </div>)}</div>
        <p className="comparison-note"><ShieldCheck size={16} />这里只有可回溯的来源证据，不把个别作者的看法概括为平台立场。</p>
      </> : <Empty icon={<Boxes />} title="选择一个对象开始对照" />}
    </section>
  </div>;
}

function DataPage({ database, demoMode, onDemo, refresh, notify }: { database: WorkbenchDatabase; demoMode: boolean; onDemo: () => Promise<void>; refresh: () => void; notify: (message: string) => void }) {
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({});
  const [confirmText, setConfirmText] = useState('');
  useEffect(() => { void navigator.storage.estimate().then(setStorage); }, []);
  const download = async () => {
    const backup = await exportBackup(database);
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `拾藏备份-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    notify('备份已下载到本机');
  };
  const restore = async (file?: File) => {
    if (!file) return;
    if (file.size > 200 * 1024 * 1024) { notify('文件超过 200 MB 安全上限'); return; }
    try { await restoreBackup(database, JSON.parse(await file.text())); refresh(); notify('备份恢复完成'); }
    catch (error) { notify(error instanceof Error ? error.message : '备份恢复失败'); }
  };
  const clear = async () => {
    if (confirmText !== '删除全部数据') return;
    await deleteAllLocalData(); setConfirmText(''); refresh(); notify('本机数据已清空');
  };
  return <div className="data-page">
    <section className="storage-lead"><span className="eyebrow">LOCAL DATA</span><strong>{formatBytes(storage.usage ?? 0)}</strong><p>当前站点在这台设备上的浏览器存储估算</p><div className="meter"><i style={{ width: `${Math.min(100, ((storage.usage ?? 0) / Math.max(1, storage.quota ?? 1)) * 100)}%` }} /></div><small>可用配额估算 {formatBytes(storage.quota ?? 0)}</small></section>
    <div className="data-sections">
      <section><div className="data-icon"><FileJson /></div><div><h2>导出与迁移</h2><p>网页和扩展使用相同备份格式。导出文件包含私人收藏，请妥善保管。</p><div className="action-row"><button className="button dark" onClick={() => void download()}><Download size={16} />导出备份</button><label className="button"><Upload size={16} />恢复备份<input type="file" accept="application/json,.json" onChange={(event) => void restore(event.target.files?.[0])} /></label></div></div></section>
      <section><div className="data-icon"><ShieldCheck /></div><div><h2>隐私边界</h2><p>收藏、正文、分类和对象关系只保存在当前浏览器的 IndexedDB；本站没有账号系统、分析埋点或远程模型。清除站点数据、无备份换设备或使用无痕模式都可能导致丢失。</p></div></section>
      <section><div className="data-icon"><Import /></div><div><h2>平台自动同步</h2><p>普通网页无法安全读取另一个网站的登录态收藏。网页版本支持手工与批量导入；需要从平台已展示页面读取时，仍可使用开源浏览器扩展。</p><a className="button" href="https://github.com/Lccs02/cs-xhs-dy" target="_blank" rel="noreferrer">查看扩展源码 <ArrowUpRight size={15} /></a></div></section>
      <section><div className="data-icon"><BookOpen /></div><div><h2>合成演示库</h2><p>演示数据位于独立数据库，不会进入真实收藏和备份。</p><button className="button" disabled={demoMode} onClick={() => void onDemo()}>{demoMode ? '正在查看演示库' : '载入演示数据'}</button></div></section>
      <section className="danger"><div className="data-icon"><Trash2 /></div><div><h2>删除全部本地数据</h2><p>会清空真实库、演示库、摘录、关联与缓存，且无法撤销。</p><div className="delete-row"><input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="输入：删除全部数据" /><button disabled={confirmText !== '删除全部数据'} onClick={() => void clear()}><Trash2 size={15} />永久删除</button></div></div></section>
    </div>
  </div>;
}

function ImportSheet({ database, onClose, onSaved }: { database: WorkbenchDatabase; onClose: () => void; onSaved: (message: string) => void }) {
  const [mode, setMode] = useState<ImportMode>('single');
  const params = new URLSearchParams(location.search);
  const sharedUrl = params.get('url') ?? extractUrl(params.get('text') ?? '') ?? '';
  const sharedText = params.get('text')?.replace(sharedUrl, '').trim() ?? '';
  const [form, setForm] = useState<WebBookmarkInput>({
    platform: sharedUrl.includes('douyin.com') ? 'douyin' : 'xiaohongshu',
    url: sharedUrl,
    title: params.get('title') ?? '',
    text: sharedText,
    author: '',
    entityName: '',
  });
  const [batch, setBatch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const update = (field: keyof WebBookmarkInput, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const saveSingle = async () => {
    setSaving(true); setError('');
    try {
      await saveWebBookmark(database, form);
      history.replaceState({}, '', location.pathname);
      onSaved('收藏已保存在这台设备'); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
    finally { setSaving(false); }
  };
  const saveBatch = async () => {
    setSaving(true); setError('');
    const parsed = parseQuickImport(batch);
    if (parsed.rows.length === 0) { setError(parsed.errors[0] ?? '没有可导入的内容'); setSaving(false); return; }
    for (const row of parsed.rows) await saveWebBookmark(database, row);
    onSaved(`已导入 ${parsed.rows.length} 条${parsed.errors.length ? `，跳过 ${parsed.errors.length} 行` : ''}`); onClose(); setSaving(false);
  };
  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="import-sheet" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <header><div><span className="eyebrow">LOCAL IMPORT</span><h2 id="import-title">添加到拾藏</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></header>
      <div className="mode-switch"><button className={mode === 'single' ? 'active' : ''} onClick={() => setMode('single')}>单条添加</button><button className={mode === 'batch' ? 'active' : ''} onClick={() => setMode('batch')}>批量粘贴</button></div>
      {mode === 'single' ? <div className="import-form">
        <fieldset><legend>来源平台</legend><label><input type="radio" checked={form.platform === 'xiaohongshu'} onChange={() => update('platform', 'xiaohongshu')} /><SourceDot platform="xiaohongshu" />小红书</label><label><input type="radio" checked={form.platform === 'douyin'} onChange={() => update('platform', 'douyin')} /><SourceDot platform="douyin" />抖音</label></fieldset>
        <label><span>内容链接 <b>必填</b></span><input type="url" value={form.url} onChange={(event) => update('url', event.target.value)} placeholder="https://www.xiaohongshu.com/…" /></label>
        <label><span>标题 <b>必填</b></span><input value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="这条收藏讲了什么" maxLength={180} /></label>
        <div className="form-pair"><label><span>作者</span><input value={form.author} onChange={(event) => update('author', event.target.value)} placeholder="选填" maxLength={80} /></label><label><span>具体对象</span><input value={form.entityName} onChange={(event) => update('entityName', event.target.value)} placeholder="地点、门店、型号…" maxLength={80} /></label></div>
        <label><span>可见文字</span><textarea value={form.text} onChange={(event) => update('text', event.target.value)} placeholder="粘贴描述或正文，分类与摘录只在本机完成。没有文字也可以先保存链接。" maxLength={20_000} /></label>
        {error && <p className="form-error"><CircleAlert size={15} />{error}</p>}
        <button className="save-button" disabled={saving} onClick={() => void saveSingle()}>{saving ? '正在保存…' : '保存到这台设备'}<ArrowRight size={17} /></button>
      </div> : <div className="batch-form">
        <p>每行一条，使用竖线或 Tab 分隔：</p>
        <code>链接 | 标题 | 正文（可选） | 具体对象（可选）</code>
        <textarea value={batch} onChange={(event) => setBatch(event.target.value)} placeholder={'https://www.xiaohongshu.com/explore/… | 上海书店散步 | 工作日上午更安静 | 衡山和集\nhttps://www.douyin.com/video/… | 开放式耳机体验'} />
        {error && <p className="form-error"><CircleAlert size={15} />{error}</p>}
        <button className="save-button" disabled={saving} onClick={() => void saveBatch()}>{saving ? '正在导入…' : '批量导入'}<ArrowRight size={17} /></button>
      </div>}
      <footer><ShieldCheck size={15} />不会把链接、文字或分类发送到服务器。</footer>
    </aside>
  </div>;
}

function Welcome({ onStart, onDemo, onClose }: { onStart: () => void; onDemo: () => Promise<void>; onClose: () => void }) {
  return <div className="welcome">
    <button className="welcome-close" onClick={onClose} aria-label="关闭"><X /></button>
    <div className="welcome-brand"><span className="brand-mark">拾</span><b>拾藏</b></div>
    <section className="welcome-copy"><span className="eyebrow">NO SIGN-UP · LOCAL FIRST</span><h1>把想留下的，<br />收回自己手里。</h1><p>打开就能用。收藏、搜索、分类与对照都在你的浏览器里完成。</p><div><button onClick={onStart}>开始整理 <ArrowRight size={18} /></button><button onClick={() => void onDemo()}>先看演示</button></div></section>
    <section className="welcome-proof"><article><span>01</span><div><b>粘贴或批量导入</b><p>链接与可见文字由你主动提供。</p></div></article><article><span>02</span><div><b>自动分类与摘录</b><p>基础规则无需模型、无需联网。</p></div></article><article><span>03</span><div><b>跨平台核对对象</b><p>保留每条内容的原始出处。</p></div></article></section>
    <footer><ShieldCheck size={17} />数据仅保存在当前浏览器；换设备前请先导出备份。</footer>
  </div>;
}

function Empty({ icon, title, detail, action, onAction }: { icon: React.ReactNode; title: string; detail?: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state">{icon}<b>{title}</b>{detail && <p>{detail}</p>}{action && <button onClick={onAction}>{action}<ArrowRight size={14} /></button>}</div>;
}

function SourceDot({ platform }: { platform: Platform }) { return <i className={`source-dot ${platform}`} aria-label={platformLabel[platform]} />; }
function extractUrl(value: string) { return value.match(/https:\/\/[^\s]+/)?.[0] ?? null; }
function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value)); }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }
function textStatusLabel(status: TextStatus) { return ({ metadata_only: '仅链接与标题', text_partial: '部分文字', text_available: '文字可用', content_unavailable: '内容不可用', extraction_failed: '解析失败' } as Record<TextStatus, string>)[status]; }

if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('./sw.js');
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
