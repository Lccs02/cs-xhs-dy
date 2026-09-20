import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, CircleAlert, Database, LoaderCircle, Play, SquareArrowOutUpRight } from 'lucide-react';
import { browser } from 'wxt/browser';
import { detectPlatform } from '../../src/adapters/shared';
import { db } from '../../src/core/db';
import type { ExtensionMessage, MessageResponse } from '../../src/core/messages';
import { platformLabel, type Platform, type SyncRun } from '../../src/core/types';
import './style.css';

function Popup() {
  const [tab, setTab] = useState<Browser.tabs.Tab | null>(null);
  const [latest, setLatest] = useState<SyncRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platform = tab?.url ? detectPlatform(tab.url) : null;

  useEffect(() => {
    void browser.tabs.query({ active: true, currentWindow: true }).then(([active]) => setTab(active ?? null));
    void db.syncRuns.orderBy('startedAt').last().then((run) => setLatest(run ?? null));
  }, []);

  const send = (message: ExtensionMessage) => browser.runtime.sendMessage<ExtensionMessage, MessageResponse>(message);
  const start = async (selected: Platform) => {
    if (!tab?.id || !tab.url) return;
    setBusy(true);
    setError(null);
    const response = await send({ type: 'START_TAB_SYNC', tabId: tab.id, url: tab.url, platform: selected });
    setBusy(false);
    if (!response.ok) setError(humanError(response.error));
    else window.close();
  };

  return <main>
    <header>
      <div className="mark">拾</div>
      <div><strong>拾藏</strong><span>本地收藏工作台</span></div>
      <button className="icon-button" onClick={() => void send({ type: 'OPEN_DASHBOARD', hash: '#/library' })} aria-label="打开工作台">
        <SquareArrowOutUpRight size={18} />
      </button>
    </header>

    {platform ? <section className="current">
      <span className="eyebrow">当前页面</span>
      <h1>{platformLabel[platform]}</h1>
      <p>保持此标签页打开。扫描会逐批写入本机，未知结束依据不会触发移除。</p>
      <button className="primary" disabled={busy} onClick={() => void start(platform)}>
        {busy ? <LoaderCircle className="spin" size={17} /> : <Play size={17} fill="currentColor" />}
        同步当前账号可见收藏
      </button>
    </section> : <section className="current neutral">
      <CircleAlert size={20} />
      <h1>请先打开收藏页</h1>
      <p>前往官方网页并正常登录，进入收藏区域后再次点击扩展。</p>
      <div className="platform-actions">
        <button onClick={() => void browser.tabs.create({ url: 'https://www.xiaohongshu.com/' })}>小红书 <ArrowRight size={15} /></button>
        <button onClick={() => void browser.tabs.create({ url: 'https://www.douyin.com/' })}>抖音 <ArrowRight size={15} /></button>
      </div>
    </section>}

    {error && <p className="error">{error}</p>}
    <footer>
      <Database size={14} />
      <span>{latest ? `上次任务：${statusLabel(latest.status)} · 已发现 ${latest.uniqueCount}` : '数据仅保存在此浏览器扩展中'}</span>
    </footer>
  </main>;
}

function humanError(code?: string) {
  const labels: Record<string, string> = {
    SYNC_ALREADY_RUNNING: '这个平台已有同步任务，请先到同步中心处理。',
    ACTIVE_TAB_CHANGED: '当前标签页已经变化，请重新打开扩展。',
    IDENTITY_UNVERIFIED: '无法可靠确认账号身份，已安全停止。请在个人收藏页重试。',
  };
  return labels[code ?? ''] ?? `无法开始同步：${code ?? '未知错误'}`;
}

function statusLabel(status: SyncRun['status']) {
  return ({ completed: '已完成', partial: '范围未知', scanning: '扫描中', starting: '准备中', paused: '已暂停', cancelled: '已取消', failed: '失败', protected: '保护拦截', interrupted_needs_restart: '需重新开始' } as Record<string, string>)[status] ?? status;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Popup /></React.StrictMode>);
