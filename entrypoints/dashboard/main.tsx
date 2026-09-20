import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive, ArrowUpRight, BookOpenCheck, Boxes, Check, ChevronRight, CircleAlert, CircleHelp, Database,
  Download, FileText, Link2, ListFilter, LoaderCircle, Merge, MoreHorizontal,
  Pause, Play, Plus, RefreshCw, Search, Settings, ShieldCheck, Split, Square, Tags, Trash2,
  Upload, X,
} from 'lucide-react';
import { browser } from 'wxt/browser';
import { adapters } from '../../src/adapters/shared';
import { exportBackup, restoreBackup } from '../../src/core/backup';
import { WorkbenchDatabase, db, deleteAllLocalData, getDemoDatabase } from '../../src/core/db';
import { seedDemo } from '../../src/core/demo';
import { readLocalModelManifest, type LocalModelManifest } from '../../src/core/model';
import type {
  Category, Entity, Excerpt, ItemCategory, ItemEntity, Platform, SourceItem, SyncRun, TextStatus,
} from '../../src/core/types';
import { platformLabel } from '../../src/core/types';
import { nowIso, sanitizeUrl } from '../../src/core/utils';
import './style.css';

type Route = 'welcome' | 'library' | 'categories' | 'entities' | 'sync' | 'settings';
const PAGE_SIZE = 40;

interface Snapshot {
  items: SourceItem[];
  total: number;
  categories: Category[];
  itemCategories: ItemCategory[];
  entities: Entity[];
  itemEntities: ItemEntity[];
  excerpts: Excerpt[];
  runs: SyncRun[];
}

const emptySnapshot: Snapshot = { items: [], total: 0, categories: [], itemCategories: [], entities: [], itemEntities: [], excerpts: [], runs: [] };

function routeFromHash(): Route {
  const route = location.hash.replace(/^#\/?/, '') as Route;
  return ['welcome', 'library', 'categories', 'entities', 'sync', 'settings'].includes(route) ? route : 'library';
}

function useHashRoute() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const navigate = (next: Route) => { location.hash = `/${next}`; };
  return [route, navigate] as const;
}

function useSnapshot(database: WorkbenchDatabase, refreshKey: number, query: string, platform: Platform | 'all', status: TextStatus | 'all', page: number) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let collection = database.items.where('activeState').equals('active');
      if (platform !== 'all') collection = collection.filter((item) => item.platform === platform);
      if (status !== 'all') collection = collection.filter((item) => item.textStatus === status);
      const needle = query.trim().toLocaleLowerCase('zh-CN');
      if (needle) collection = collection.filter((item) => `${item.title} ${item.author ?? ''} ${item.text ?? ''}`.toLocaleLowerCase('zh-CN').includes(needle));
      const [total, items, categories, entities, runs] = await Promise.all([
        collection.count(),
        collection.offset(page * PAGE_SIZE).limit(PAGE_SIZE).toArray(),
        database.categories.orderBy('updatedAt').toArray(),
        database.entities.orderBy('updatedAt').reverse().toArray(),
        database.syncRuns.orderBy('startedAt').reverse().limit(30).toArray(),
      ]);
      const itemIds = items.map((item) => item.id);
      const [itemCategories, itemEntities, excerpts] = itemIds.length > 0 ? await Promise.all([
        database.itemCategories.where('itemId').anyOf(itemIds).toArray(),
        database.itemEntities.where('itemId').anyOf(itemIds).toArray(),
        database.excerpts.where('itemId').anyOf(itemIds).toArray(),
      ]) : [[], [], []];
      if (!cancelled) {
        setSnapshot({ items, total, categories, entities, runs, itemCategories, itemEntities, excerpts });
        setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [database, refreshKey, query, platform, status, page]);
  return { snapshot, loading };
}

function App() {
  const [route, navigate] = useHashRoute();
  const [demoMode, setDemoMode] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const [status, setStatus] = useState<TextStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const database = demoMode ? getDemoDatabase() : db;
  const { snapshot, loading } = useSnapshot(database, refreshKey, query, platform, status, page);
  const selected = snapshot.items.find((item) => item.id === selectedId) ?? snapshot.items[0] ?? null;
  const refresh = () => setRefreshKey((value) => value + 1);

  useEffect(() => {
    void browser.storage.local.get('demoMode').then((value) => setDemoMode(value.demoMode === true));
  }, []);
  useEffect(() => { setPage(0); }, [query, platform, status, demoMode]);

  const enterDemo = async () => {
    const demo = getDemoDatabase();
    await seedDemo(demo);
    await browser.storage.local.set({ demoMode: true });
    setDemoMode(true);
    navigate('library');
    refresh();
  };
  const exitDemo = async () => {
    await browser.storage.local.set({ demoMode: false });
    setDemoMode(false);
    refresh();
  };

  if (route === 'welcome') return <Welcome onStart={() => navigate('sync')} onDemo={enterDemo} />;

  return <div className="app-shell">
    <Sidebar route={route} navigate={navigate} total={snapshot.total} />
    <main className="workspace">
      {demoMode && <div className="demo-ribbon"><span>合成演示库</span> 与真实收藏完全分离，不计入真实数据。<button onClick={() => void exitDemo()}>退出演示</button></div>}
      <Topbar route={route} query={query} setQuery={setQuery} />
      {route === 'library' && <LibraryPage
        {...{ snapshot, loading, selected, selectedId, setSelectedId, platform, setPlatform, status, setStatus, page, setPage, database, refresh }}
      />}
      {route === 'categories' && <CategoriesPage database={database} snapshot={snapshot} refresh={refresh} />}
      {route === 'entities' && <EntitiesPage database={database} snapshot={snapshot} refresh={refresh} />}
      {route === 'sync' && <SyncPage runs={snapshot.runs} />}
      {route === 'settings' && <SettingsPage database={database} demoMode={demoMode} onDemo={enterDemo} refresh={refresh} />}
    </main>
  </div>;
}

function Sidebar({ route, navigate, total }: { route: Route; navigate: (route: Route) => void; total: number }) {
  const nav: Array<[Route, string, React.ReactNode]> = [
    ['library', '全部收藏', <Archive size={18} />],
    ['categories', '分类管理', <Tags size={18} />],
    ['entities', '对象工作台', <Boxes size={18} />],
    ['sync', '同步中心', <RefreshCw size={18} />],
  ];
  return <aside className="sidebar">
    <button className="brand" onClick={() => navigate('library')}><span className="brand-mark">拾</span><span><b>拾藏</b><small>LOCAL WORKBENCH</small></span></button>
    <nav>
      {nav.map(([id, label, icon]) => <button key={id} className={route === id ? 'active' : ''} onClick={() => navigate(id)}>{icon}<span>{label}</span>{id === 'library' && <em>{total}</em>}</button>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="privacy-note"><ShieldCheck size={16} /><span>正文与分析<br />仅存此设备</span></div>
      <button className={route === 'settings' ? 'active' : ''} onClick={() => navigate('settings')}><Settings size={18} /><span>本地数据设置</span></button>
    </div>
  </aside>;
}

function Topbar({ route, query, setQuery }: { route: Route; query: string; setQuery: (value: string) => void }) {
  const titles: Record<Route, [string, string]> = {
    welcome: ['开始使用', ''], library: ['全部收藏', '检索、筛选并核对每一条来源'], categories: ['分类管理', '规则依据与人工锁定分开保存'],
    entities: ['对象工作台', '同一对象的跨平台证据并列查看'], sync: ['同步中心', '每个平台独立记录范围与可靠性'], settings: ['本地数据设置', '备份、恢复、占用与模型状态'],
  };
  return <header className="topbar"><div><h1>{titles[route][0]}</h1><p>{titles[route][1]}</p></div>{route === 'library' && <label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、正文或作者" /><kbd>⌘ K</kbd></label>}</header>;
}

function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => Promise<void> }) {
  return <main className="welcome">
    <div className="welcome-brand"><span className="brand-mark">拾</span><b>拾藏</b></div>
    <section className="welcome-copy">
      <span className="kicker">LOCAL-FIRST COLLECTIONS</span>
      <h1>把散落的平台收藏，<br />收回自己的设备。</h1>
      <p>从官方网页主动同步，在本地分类、关联同一对象，并保留每条摘录的原始出处。</p>
      <div className="welcome-actions"><button className="button dark" onClick={onStart}>开始连接平台 <ChevronRight size={17} /></button><button className="button text" onClick={() => void onDemo()}>载入合成演示数据</button></div>
    </section>
    <section className="welcome-steps">
      <article><span>01</span><div><b>在官方网页登录</b><p>密码与验证码始终由平台处理。</p></div></article>
      <article><span>02</span><div><b>点击工具栏同步</b><p>只有主动点击后才读取当前标签页。</p></div></article>
      <article><span>03</span><div><b>本地整理与对照</b><p>无云端账号、无分析埋点、无远程模型。</p></div></article>
    </section>
    <footer><ShieldCheck size={16} /> IndexedDB 不是加密保险箱；浏览器资料被控制时，本地数据也可能被读取。</footer>
  </main>;
}

interface LibraryProps {
  snapshot: Snapshot; loading: boolean; selected: SourceItem | null; selectedId: string | null;
  setSelectedId: (id: string) => void; platform: Platform | 'all'; setPlatform: (value: Platform | 'all') => void;
  status: TextStatus | 'all'; setStatus: (value: TextStatus | 'all') => void; page: number; setPage: (value: number) => void;
  database: WorkbenchDatabase; refresh: () => void;
}

function LibraryPage(props: LibraryProps) {
  const { snapshot, loading, selected, setSelectedId, platform, setPlatform, status, setStatus, page, setPage, database, refresh } = props;
  return <div className="library-layout">
    <section className="collection-pane">
      <div className="filterbar">
        <div className="segmented"><button className={platform === 'all' ? 'active' : ''} onClick={() => setPlatform('all')}>全部</button><button className={platform === 'xiaohongshu' ? 'active' : ''} onClick={() => setPlatform('xiaohongshu')}>小红书</button><button className={platform === 'douyin' ? 'active' : ''} onClick={() => setPlatform('douyin')}>抖音</button></div>
        <label><ListFilter size={15} /><select value={status} onChange={(event) => setStatus(event.target.value as TextStatus | 'all')}><option value="all">全部解析状态</option><option value="text_available">文字可用</option><option value="text_partial">部分文字</option><option value="metadata_only">仅元数据</option><option value="content_unavailable">内容不可用</option><option value="extraction_failed">解析失败</option></select></label>
        <span className="result-count">{snapshot.total} 条</span>
      </div>
      <div className="list-head"><span>收藏内容</span><span>整理结果</span><span>最近看到</span></div>
      <div className="item-list">
        {loading && <Empty icon={<LoaderCircle className="spin" />} title="正在读取本地数据库" />}
        {!loading && snapshot.items.length === 0 && <Empty icon={<Archive />} title="这里还没有收藏" detail="到同步中心查看导入步骤，或在设置中载入合成演示数据。" />}
        {snapshot.items.map((item, index) => {
          const categories = snapshot.itemCategories.filter((entry) => entry.itemId === item.id).map((entry) => snapshot.categories.find((category) => category.id === entry.categoryId)).filter(Boolean) as Category[];
          const entities = snapshot.itemEntities.filter((entry) => entry.itemId === item.id && entry.status !== 'rejected').map((entry) => snapshot.entities.find((entity) => entity.id === entry.entityId)).filter(Boolean) as Entity[];
          return <button style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }} className={`item-row ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedId(item.id)}>
            <div className="item-title"><SourceDot platform={item.platform} /><span><b>{item.title}</b><small>{item.author ?? '作者未知'} · {textStatusLabel(item.textStatus)}</small></span></div>
            <div className="row-tags">{categories.slice(0, 2).map((category) => <span key={category.id} style={{ '--tag-color': category.color } as React.CSSProperties}>{category.name}</span>)}{entities[0] && <span className="entity-tag"><Link2 size={11} />{entities[0].name}</span>}</div>
            <time>{formatDate(item.lastSeenAt)}</time>
          </button>;
        })}
      </div>
      {snapshot.total > PAGE_SIZE && <div className="pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {Math.ceil(snapshot.total / PAGE_SIZE)}</span><button disabled={(page + 1) * PAGE_SIZE >= snapshot.total} onClick={() => setPage(page + 1)}>下一页</button></div>}
    </section>
    <Inspector item={selected} snapshot={snapshot} database={database} refresh={refresh} />
  </div>;
}

function Inspector({ item, snapshot, database, refresh }: { item: SourceItem | null; snapshot: Snapshot; database: WorkbenchDatabase; refresh: () => void }) {
  if (!item) return <aside className="inspector empty-inspector"><FileText size={24} /><p>选择一条收藏查看来源证据</p></aside>;
  const assigned = snapshot.itemCategories.filter((entry) => entry.itemId === item.id);
  const excerpts = snapshot.excerpts.filter((entry) => entry.itemId === item.id);
  const openOriginal = async () => {
    const url = sanitizeUrl(item.navigationUrl, item.platform);
    if (url) await browser.tabs.create({ url });
  };
  const toggleCategory = async (category: Category) => {
    const existing = await database.itemCategories.get(`${item.id}|${category.id}`);
    if (existing) await database.itemCategories.delete(existing.id);
    else await database.itemCategories.put({ id: `${item.id}|${category.id}`, itemId: item.id, categoryId: category.id, source: 'user', score: null, evidence: ['用户手动设置'], locked: true, updatedAt: nowIso() });
    refresh();
  };
  return <aside className="inspector">
    <div className="inspector-head"><span className="source-label"><SourceDot platform={item.platform} />{platformLabel[item.platform]}</span><button aria-label="更多"><MoreHorizontal size={18} /></button></div>
    <h2>{item.title}</h2>
    <div className="metadata"><span>{item.author ?? '作者未知'}</span><span>{item.publishedAt ? formatDate(item.publishedAt) : '发布日期未知'}</span></div>
    <button className="original-link" onClick={() => void openOriginal()}>回到原平台 <ArrowUpRight size={15} /></button>
    <section><div className="section-title"><span>摘录证据</span><small>{item.textStatus === 'text_partial' ? '部分内容' : item.textStatus === 'metadata_only' ? '正文未获取' : '来自已取得文字'}</small></div>
      {item.textScope && <p className="scope-note"><CircleAlert size={14} />{item.textScope}</p>}
      <div className="excerpt-list">{excerpts.map((excerpt) => <blockquote key={excerpt.id}>{excerpt.text}<footer>{excerpt.sourceField === 'title' ? '标题' : `正文 ${excerpt.start}–${excerpt.end}`}</footer></blockquote>)}</div>
    </section>
    <section><div className="section-title"><span>分类</span><small>点击以人工锁定</small></div><div className="category-picker">{snapshot.categories.map((category) => { const active = assigned.some((entry) => entry.categoryId === category.id); return <button key={category.id} className={active ? 'active' : ''} onClick={() => void toggleCategory(category)}><i style={{ background: category.color }} />{category.name}{active && <Check size={12} />}</button>; })}</div></section>
    <section><div className="section-title"><span>本地记录</span></div><dl><div><dt>稳定 ID</dt><dd>{item.stableItemId}</dd></div><div><dt>内容版本</dt><dd>v{item.contentVersion}</dd></div><div><dt>适配器</dt><dd>{item.adapterVersion}</dd></div></dl></section>
  </aside>;
}

function CategoriesPage({ database, snapshot, refresh }: { database: WorkbenchDatabase; snapshot: Snapshot; refresh: () => void }) {
  const [name, setName] = useState('');
  const counts = useMemo(() => Object.fromEntries(snapshot.categories.map((category) => [category.id, snapshot.itemCategories.filter((entry) => entry.categoryId === category.id).length])), [snapshot]);
  const create = async () => {
    const clean = name.trim(); if (!clean) return;
    const at = nowIso();
    await database.categories.add({ id: `cat-user-${crypto.randomUUID()}`, name: clean.slice(0, 40), color: '#d65332', keywords: [], isSystem: false, createdAt: at, updatedAt: at });
    setName(''); refresh();
  };
  return <div className="page-column narrow-page">
    <section className="metric-line"><div><strong>{snapshot.categories.length}</strong><span>个分类</span></div><div><strong>{counts['cat-other'] ?? 0}</strong><span>条待分类</span></div><p>自动结果显示命中依据；人工设置会锁定，后续重分析不会覆盖。</p></section>
    <section className="plain-section"><div className="section-heading"><div><h2>分类与关键词</h2><p>关键词分数是启发式规则，不代表正确概率。</p></div><div className="inline-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="新分类名称" /><button onClick={() => void create()}><Plus size={16} />创建</button></div></div>
      <div className="category-table"><div className="table-head"><span>分类</span><span>关键词</span><span>条目</span><span>类型</span></div>{snapshot.categories.map((category) => <div className="table-row" key={category.id}><span className="category-name"><i style={{ background: category.color }} />{category.name}</span><span className="keyword-line">{category.keywords.length ? category.keywords.join('、') : '—'}</span><strong>{counts[category.id] ?? 0}</strong><span>{category.isSystem ? '基础规则' : '自定义'}</span></div>)}</div>
    </section>
  </div>;
}

function EntitiesPage({ database, snapshot, refresh }: { database: WorkbenchDatabase; snapshot: Snapshot; refresh: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(snapshot.entities[0]?.id ?? null);
  const [name, setName] = useState('');
  const [targetId, setTargetId] = useState('');
  const [items, setItems] = useState<SourceItem[]>([]);
  const selected = snapshot.entities.find((entity) => entity.id === selectedId) ?? snapshot.entities[0] ?? null;
  useEffect(() => {
    if (!selected) { setItems([]); return; }
    void database.itemEntities.where('entityId').equals(selected.id).filter((link) => link.status !== 'rejected').toArray()
      .then(async (links) => setItems((await database.items.bulkGet(links.map((link) => link.itemId))).filter(Boolean) as SourceItem[]));
  }, [database, selected, snapshot.itemEntities]);
  const create = async () => {
    if (!name.trim()) return; const at = nowIso();
    const entity: Entity = { id: `entity-${crypto.randomUUID()}`, name: name.trim().slice(0, 80), type: 'other', aliases: [], brand: null, model: null, city: null, store: null, createdAt: at, updatedAt: at };
    await database.entities.add(entity); setName(''); setSelectedId(entity.id); refresh();
  };
  const unlink = async (itemId: string) => { if (!selected) return; await database.itemEntities.delete(`${itemId}|${selected.id}`); refresh(); };
  const merge = async () => {
    if (!selected || !targetId || selected.id === targetId) return;
    const target = await database.entities.get(targetId); if (!target) return;
    const links = await database.itemEntities.where('entityId').equals(selected.id).toArray();
    await database.transaction('rw', database.entities, database.itemEntities, async () => {
      for (const link of links) await database.itemEntities.put({ ...link, id: `${link.itemId}|${target.id}`, entityId: target.id, locked: true, status: 'user_confirmed', evidence: [...link.evidence, `由 ${selected.name} 人工合并`] });
      await database.itemEntities.where('entityId').equals(selected.id).delete();
      await database.entities.update(target.id, { aliases: [...new Set([...target.aliases, selected.name, ...selected.aliases])], updatedAt: nowIso() });
      await database.entities.delete(selected.id);
    });
    setSelectedId(target.id); setTargetId(''); refresh();
  };
  return <div className="entity-layout">
    <section className="entity-index"><div className="entity-create"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="创建对象，例如门店或型号" /><button onClick={() => void create()}><Plus size={16} /></button></div>{snapshot.entities.length === 0 && <Empty icon={<Boxes />} title="还没有对象" detail="对象不是主题；它代表可跨平台核对的具体地点、门店、产品或作品。" />}{snapshot.entities.map((entity) => { const count = snapshot.itemEntities.filter((link) => link.entityId === entity.id && link.status !== 'rejected').length; return <button key={entity.id} className={selected?.id === entity.id ? 'active' : ''} onClick={() => setSelectedId(entity.id)}><span><b>{entity.name}</b><small>{entity.type} · {entity.city ?? '地域未设置'}</small></span><em>{count}</em><ChevronRight size={15} /></button>; })}</section>
    <section className="entity-detail">{selected ? <>
      <header><div><span className="kicker">CROSS-PLATFORM OBJECT</span><h2>{selected.name}</h2><p>{selected.aliases.length ? `别名：${selected.aliases.join('、')}` : '尚未设置别名'}</p></div><div className="merge-control"><select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">选择合并目标</option>{snapshot.entities.filter((entity) => entity.id !== selected.id).map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select><button disabled={!targetId} onClick={() => void merge()}><Merge size={15} />合并</button></div></header>
      <div className="comparison-grid">{(['xiaohongshu', 'douyin'] as Platform[]).map((platform) => <div key={platform} className="platform-column"><div className="column-title"><SourceDot platform={platform} />{platformLabel[platform]}<span>{items.filter((item) => item.platform === platform).length}</span></div>{items.filter((item) => item.platform === platform).map((item) => <article key={item.id}><b>{item.title}</b><p>{item.text ? item.text.slice(0, 180) : '正文未获取，暂不能形成内容摘要。'}</p><footer><button onClick={() => void browser.tabs.create({ url: item.navigationUrl })}>查看来源 <ArrowUpRight size={13} /></button><button onClick={() => void unlink(item.id)}><Split size={13} />移出对象</button></footer></article>)}{items.every((item) => item.platform !== platform) && <div className="empty-column">此平台暂无已确认来源</div>}</div>)}</div>
      <p className="comparison-caution"><CircleHelp size={15} />这里只并列来源证据，不把个别作者看法概括为整个平台立场，也不自动裁决共识或冲突。</p>
    </> : <Empty icon={<Boxes />} title="选择或创建一个具体对象" />}</section>
  </div>;
}

function SyncPage({ runs }: { runs: SyncRun[] }) {
  const latest = (platform: Platform) => runs.find((run) => run.platform === platform);
  const control = async (run: SyncRun, action: 'pause' | 'resume' | 'cancel') => { await browser.runtime.sendMessage({ type: 'CONTROL_RUN', runId: run.id, action }); };
  return <div className="page-column sync-page">
    <div className="sync-intro"><div><ShieldCheck size={22} /><h2>手动、可见、可停止</h2></div><p>同步时请保留平台标签页。当前适配器尚未完成真实账号全量验证，因此不会执行缺失项删除。</p></div>
    <div className="platform-sync-list">{(['xiaohongshu', 'douyin'] as Platform[]).map((platform) => { const run = latest(platform); const spec = adapters[platform]; return <section key={platform} className="platform-sync"><div className="platform-sign"><SourceDot platform={platform} /><div><h2>{platformLabel[platform]}</h2><p>{spec.version}</p></div></div><div className="sync-state"><span className={`status status-${run?.status ?? 'idle'}`}>{run ? runStatusLabel(run.status) : '尚未同步'}</span><strong>{run?.uniqueCount ?? 0}</strong><small>已发现</small></div><div className="sync-stats"><span>取得文字 <b>{run?.textCount ?? 0}</b></span><span>已整理 <b>{run?.organizedCount ?? 0}</b></span><span>完整性 <b>{run?.coverageStatus === 'complete_for_scope' ? '当前范围完整' : '未知'}</b></span></div><div className="known-gaps">{spec.knownGaps.map((gap) => <span key={gap}><CircleAlert size={13} />{gap}</span>)}</div><div className="sync-actions"><button className="button dark" onClick={() => void browser.tabs.create({ url: platform === 'xiaohongshu' ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/' })}>前往{platformLabel[platform]}同步 <ArrowUpRight size={15} /></button>{run && ['scanning', 'paused'].includes(run.status) && <><button onClick={() => void control(run, run.status === 'paused' ? 'resume' : 'pause')}>{run.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}{run.status === 'paused' ? '继续' : '暂停'}</button><button onClick={() => void control(run, 'cancel')}><Square size={13} />取消</button></>}</div>{run?.protectionReason && <p className="protection"><ShieldCheck size={14} />{run.protectionReason}</p>}</section>; })}</div>
    <section className="run-history plain-section"><div className="section-heading"><div><h2>任务记录</h2><p>扫描、文字取得与整理数量分别记录。</p></div></div><div className="run-table"><div className="table-head"><span>平台 / 开始时间</span><span>状态</span><span>观测 / 唯一</span><span>终止依据</span></div>{runs.map((run) => <div className="table-row" key={run.id}><span><b>{platformLabel[run.platform]}</b><small>{formatDateTime(run.startedAt)}</small></span><span>{runStatusLabel(run.status)}</span><span>{run.observedCount} / {run.uniqueCount}</span><span>{run.terminationBasis ?? '—'}</span></div>)}</div></section>
  </div>;
}

function SettingsPage({ database, demoMode, onDemo, refresh }: { database: WorkbenchDatabase; demoMode: boolean; onDemo: () => Promise<void>; refresh: () => void }) {
  const [storage, setStorage] = useState<{ usage?: number; quota?: number }>({});
  const [model, setModel] = useState<LocalModelManifest | null>(null);
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [embedStatus, setEmbedStatus] = useState('');
  const embeddingJob = useRef<{ worker: Worker; reject: (error: Error) => void } | null>(null);
  useEffect(() => { void navigator.storage.estimate().then(setStorage); void readLocalModelManifest().then(setModel); }, []);
  const download = async () => {
    const backup = await exportBackup(database); const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `拾藏备份-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setMessage('备份已保存到本机下载目录。');
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return; if (file.size > 200 * 1024 * 1024) { setMessage('文件超过 200MB 安全上限。'); return; }
    try { await restoreBackup(database, JSON.parse(await file.text())); setMessage('恢复完成，记录与关系已事务写入。'); refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : '恢复失败'); }
  };
  const clear = async () => { if (confirm !== '删除全部数据') return; await deleteAllLocalData(); setConfirm(''); setMessage('真实库、演示库与派生缓存已清空。'); refresh(); };
  const runEmbeddings = async () => {
    if (!model || embeddingJob.current) return;
    const allItems = await database.items.where('activeState').equals('active').toArray();
    const cached = new Map((await database.featureCache.where('kind').equals('embedding').toArray()).map((entry) => [entry.itemId, entry.inputHash]));
    const pending = allItems.filter((item) => cached.get(item.id) !== (item.contentHash ?? item.metadataHash));
    if (pending.length === 0) { setEmbedStatus('所有当前内容都已有对应版本的本地向量缓存。'); return; }
    const extensionOrigin = new URL(browser.runtime.getURL('/dashboard.html')).origin;
    const worker = new Worker(`${extensionOrigin}/local-embeddings.js`, { type: 'module' });
    let completed = 0;
    try {
      for (let offset = 0; offset < pending.length; offset += 8) {
        const batch = pending.slice(offset, offset + 8);
        setEmbedStatus(`本地处理中 ${completed} / ${pending.length}`);
        const response = await new Promise<{ ok: boolean; embeddings?: number[][]; error?: string }>((resolve, reject) => {
          embeddingJob.current = { worker, reject };
          const id = crypto.randomUUID();
          worker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; embeddings?: number[][]; error?: string }>) => { if (event.data.id === id) resolve(event.data); };
          worker.onerror = () => reject(new Error('LOCAL_WORKER_FAILED'));
          worker.postMessage({ id, type: 'EMBED', texts: batch.map((item) => `${item.title}\n${item.text ?? ''}`), modelBaseUrl: `${extensionOrigin}/models/`, runtimeBaseUrl: `${extensionOrigin}/wasm/` });
        });
        if (!response.ok || !response.embeddings) throw new Error(response.error ?? 'LOCAL_MODEL_FAILED');
        await database.featureCache.bulkPut(batch.map((item, index) => ({
          id: `${item.id}|embedding`, itemId: item.id, kind: 'embedding' as const,
          inputHash: item.contentHash ?? item.metadataHash, algorithmVersion: 'mean-normalized-1', modelVersion: model.revision,
          value: response.embeddings![index] ?? [], updatedAt: nowIso(),
        })));
        completed += batch.length;
      }
      setEmbedStatus(`完成：${completed} 条内容已在本机生成向量。`);
    } catch (error) {
      setEmbedStatus(error instanceof Error && error.message === 'CANCELLED' ? '已取消，已完成的批次仍保留。' : '本地模型不可用，已回退基础规则，未上传任何数据。');
    } finally {
      worker.terminate(); embeddingJob.current = null;
    }
  };
  const cancelEmbeddings = () => {
    const job = embeddingJob.current; if (!job) return;
    job.reject(new Error('CANCELLED')); job.worker.terminate(); embeddingJob.current = null;
  };
  return <div className="settings-grid">
    <section className="settings-lead"><span className="kicker">LOCAL DATA</span><h2>{formatBytes(storage.usage ?? 0)}</h2><p>当前浏览器存储估算占用</p><div className="meter"><i style={{ width: `${Math.min(100, ((storage.usage ?? 0) / Math.max(storage.quota ?? 1, 1)) * 100)}%` }} /></div><small>可用配额估算 {formatBytes(storage.quota ?? 0)}</small></section>
    <section className="settings-section"><div className="settings-icon"><Download /></div><div><h3>导出与恢复</h3><p>备份包含私人收藏，请妥善保管。导入前会校验格式、版本、大小与表结构。</p><div className="action-row"><button className="button dark" onClick={() => void download()}><Download size={15} />导出备份</button><label className="button"><Upload size={15} />选择备份<input type="file" accept="application/json,.json" onChange={(event) => void importFile(event.target.files?.[0])} /></label></div></div></section>
    <section className="settings-section"><div className="settings-icon"><BookOpenCheck /></div><div><h3>本地语义增强</h3><p>{model ? `已检测到 ${model.model}，固定版本 ${model.revision}，${model.files.length} 个文件均有 SHA-256 清单。` : '基础分类与摘录无需模型即可工作。增强模型未打包，不会在导入收藏时联网下载。'}</p><div className="action-row"><span className={`model-state ${model ? 'ready' : ''}`}>{model ? '本地模型已就绪' : '基础模式'}</span>{model && !embeddingJob.current && <button className="button" onClick={() => void runEmbeddings()}>处理变化内容</button>}{embeddingJob.current && <button className="button" onClick={cancelEmbeddings}>取消</button>}</div>{embedStatus && <p className="job-status">{embedStatus}</p>}</div></section>
    <section className="settings-section"><div className="settings-icon"><Database /></div><div><h3>合成演示库</h3><p>演示数据位于独立 IndexedDB，不会混入真实收藏计数。</p><button className="button" disabled={demoMode} onClick={() => void onDemo()}>{demoMode ? '正在查看演示库' : '载入演示数据'}</button></div></section>
    <section className="settings-section danger"><div className="settings-icon"><Trash2 /></div><div><h3>删除全部本地数据</h3><p>会清理真实数据库、演示数据库、摘录、索引和缓存。操作不可恢复，请先导出备份。</p><div className="danger-row"><input value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="输入：删除全部数据" /><button disabled={confirm !== '删除全部数据'} onClick={() => void clear()}><Trash2 size={15} />永久删除</button></div></div></section>
    {message && <div className="toast"><Check size={15} />{message}<button onClick={() => setMessage('')}><X size={14} /></button></div>}
  </div>;
}

function Empty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail?: string }) { return <div className="empty-state">{icon}<b>{title}</b>{detail && <p>{detail}</p>}</div>; }
function SourceDot({ platform }: { platform: Platform }) { return <i className={`source-dot ${platform}`} aria-label={platformLabel[platform]} />; }
function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 ** 2).toFixed(1)} MB`; }
function textStatusLabel(status: TextStatus) { return ({ metadata_only: '仅元数据', text_partial: '部分文字', text_available: '文字可用', content_unavailable: '内容不可用', extraction_failed: '解析失败' } as Record<TextStatus, string>)[status]; }
function runStatusLabel(status: SyncRun['status']) { return ({ starting: '准备中', scanning: '扫描中', paused: '已暂停', cancelled: '已取消', completed: '当前范围结束', partial: '范围未知', failed: '失败', protected: '已阻止危险对账', interrupted_needs_restart: '中断，需重启' } as Record<SyncRun['status'], string>)[status]; }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
