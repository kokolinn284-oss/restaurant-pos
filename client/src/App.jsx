import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, money, setAuth, setUnauthorizedHandler } from './api.js';
import { useI18n } from './i18n.jsx';
import Login from './screens/Login.jsx';
import Tables from './screens/Tables.jsx';
import Order from './screens/Order.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Kitchen from './screens/Kitchen.jsx';
import MenuAdmin from './screens/MenuAdmin.jsx';
import Inventory from './screens/Inventory.jsx';
import Members from './screens/Members.jsx';
import Expenses from './screens/Expenses.jsx';
import Reports from './screens/Reports.jsx';
import Settings from './screens/Settings.jsx';
import CustomerCatalog from './screens/CustomerCatalog.jsx';
import CalculatorModal from './components/CalculatorModal.jsx';
import { Icon, ThemeToggle, LangToggle, Modal, Empty } from './components/ui.jsx';
import {
  getDrafts, subscribeDrafts, pendingCount, syncDrafts, cacheBootstrap, getCachedBootstrap, removeDraft
} from './offline.js';

const NAV = [
  { key: 'tables', label: 'စားပွဲ & အရောင်း', short: 'စားပွဲ', icon: 'table', tone: 'sky' },
  { key: 'dashboard', label: 'ဒက်ရှ်ဘုတ်', short: 'ဒက်ရှ်', icon: 'home', tone: 'indigo' },
  { key: 'catalog', label: 'အွန်လိုင်း ကတ်တလောက်', short: 'ကတ်တလောက်', icon: 'menu', tone: 'emerald' },
  { key: 'kitchen', label: 'မီးဖိုချောင်', short: 'မီးဖို', icon: 'fire', tone: 'orange' },
  { key: 'menu', label: 'မီနူး', short: 'မီနူး', icon: 'menu', tone: 'emerald' },
  { key: 'inventory', label: 'ဂိုဒေါင်း', short: 'ဂိုဒေါင်း', icon: 'box', tone: 'amber' },
  { key: 'members', label: 'အဖွဲ့ဝင်', short: 'အဖွဲ့ဝင်', icon: 'users', tone: 'cyan' },
  { key: 'expenses', label: 'အသုံးစရိတ်', short: 'အသုံးစရိတ်', icon: 'cash', tone: 'rose' },
  { key: 'reports', label: 'အစီရင်ခံစာ', short: 'စာရင်း', icon: 'chart', tone: 'violet' },
  { key: 'settings', label: 'ဆက်တင်', short: 'ဆက်တင်', icon: 'gear', tone: 'slate' }
];

const ROLE_KEY = { owner: 'ပိုင်ရှင်', cashier: 'ကောင်တာ', waiter: 'စားပွဲထိုး' };
const ROLE_NAV = {
  owner: NAV.map(n => n.key),
  cashier: NAV.map(n => n.key).filter(k => k !== 'settings'),
  waiter: ['tables', 'kitchen']
};
const MY_DAYS = ['တနင်္ဂနွေ', 'တနင်္လာ', 'အင်္ဂါ', 'ဗုဒ္ဓဟူး', 'ကြာသပတေး', 'သောကြာ', 'စနေ'];
const MY_MONTHS = ['ဇန်', 'ဖေ', 'မတ်', 'ဧ', 'မေ', 'ဇွန်', 'ဇူ', 'ဩ', 'စက်', 'အောက်', 'နို', 'ဒီ'];

export default function App() {
  const { t, isEn } = useI18n();
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pos_auth')); } catch { return null; }
  });
  const staff = session?.staff || null;
  const [data, setData] = useState(null);
  const [view, setView] = useState('tables');
  const [orderId, setOrderId] = useState(null);
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  const [navOpen, setNavOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(() => localStorage.getItem('pos_side_collapsed') === '1');
  const [userOpen, setUserOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [drafts, setDrafts] = useState(() => getDrafts());
  const [syncing, setSyncing] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const toastTimer = useRef(null);
  const syncBusy = useRef(false);
  const lastAutoSync = useRef(0);
  const tRef = useRef(t);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  const logout = useCallback(() => {
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('pos_auth');
    setSession(null);
    setData(null);
    setOrderId(null);
    setNavOpen(false);
    setUserOpen(false);
  }, []);

  useEffect(() => { setAuth(session); }, [session]);
  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);
  useEffect(() => subscribeDrafts(setDrafts), []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 20000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!navOpen && !userOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') { setNavOpen(false); setUserOpen(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen, userOpen]);

  const reload = useCallback(async () => {
    try {
      const d = await api('/bootstrap');
      setData(d);
      cacheBootstrap(d);
      setOnline(true);
      return d;
    } catch (e) {
      if (e.status === 401) logout();
      else {
        setOnline(false);
        setData(prev => prev || getCachedBootstrap());
      }
      return null;
    }
  }, [logout]);

  const runSync = useCallback(async (silent = false) => {
    if (syncBusy.current) return { busy: true, synced: 0, failed: 0 };
    if (!getDrafts().some(d => d.status === 'paid' && d.items.length)) {
      if (!silent) {
        await reload();
        showToast(tRef.current('Sync လုပ်ရန် အော်ဒါ မရှိပါ'));
      }
      return { synced: 0, failed: 0 };
    }
    syncBusy.current = true;
    setSyncing(true);
    try {
      const r = await syncDrafts(api);
      if (r.fatal?.status === 401) { logout(); return r; }
      if (r.fatal?.offline) setOnline(false);
      if (r.synced || !r.failed) await reload();
      if (r.synced) showToast(`${r.synced} ${tRef.current('အော်ဒါ sync ပြီးပါပြီ')}`);
      else if (r.failed) showToast(tRef.current('Sync မအောင်သော အော်ဒါ ရှိပါသည် — အသေးစိတ် စစ်ပါ'));
      else if (!silent) showToast(tRef.current('Sync ပြီးပါပြီ'));
      return r;
    } finally {
      syncBusy.current = false;
      setSyncing(false);
    }
  }, [reload, showToast, logout]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      reload().then(d => { if (d) runSync(true); });
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [reload, runSync]);

  useEffect(() => {
    if (!staff || !data || !online) return;
    if (!getDrafts().some(d => d.status === 'paid' && d.items.length)) return;
    if (Date.now() - lastAutoSync.current < 30000) return;
    lastAutoSync.current = Date.now();
    runSync(true);
  }, [data, online, staff, runSync]);

  useEffect(() => {
    if (!staff) return;
    let alive = true;
    const tick = () => { if (alive) reload(); };
    tick();
    const timer = setInterval(tick, 25000);
    let es;
    try {
      es = new EventSource('/api/events');
      es.onmessage = () => tick();
    } catch {}
    return () => { alive = false; clearInterval(timer); if (es) es.close(); };
  }, [staff, reload]);

  useEffect(() => { if (data) document.title = `${data.settings.shop_name} · POS`; }, [data]);

  const login = (sessionData) => {
    localStorage.setItem('pos_auth', JSON.stringify(sessionData));
    setSession(sessionData);
  };

  useEffect(() => {
    if (!staff) return;
    const allowed = ROLE_NAV[staff.role] || ROLE_NAV.cashier;
    if (view !== 'order' && !allowed.includes(view)) setView('tables');
  }, [staff, view]);

  const [route, setRoute] = useState(() => {
    const h = window.location.hash || '';
    if (h.startsWith('#/catalog') || window.location.search.includes('catalog')) return 'catalog';
    return '';
  });

  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash || '';
      if (h.startsWith('#/catalog') || window.location.search.includes('catalog')) {
        setRoute('catalog');
      } else {
        setRoute('');
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (route === 'catalog') {
    return <CustomerCatalog onBackToPos={staff ? () => { window.location.hash = ''; setRoute(''); } : null} />;
  }

  if (!staff) return <Login onLogin={login} />;

  const openOrder = (id) => { setOrderId(id); setView('order'); setNavOpen(false); setUserOpen(false); };
  const goto = (key) => {
    setView(key);
    if (key !== 'order') setOrderId(null);
    setNavOpen(false);
    setUserOpen(false);
  };
  const toggleSide = () => setSideCollapsed(v => {
    const next = !v;
    localStorage.setItem('pos_side_collapsed', next ? '1' : '0');
    return next;
  });

  const settings = data?.settings || {};
  const navItems = NAV.filter(n => (ROLE_NAV[staff.role] || ROLE_NAV.cashier).includes(n.key));
  const shopName = isEn ? (settings.shop_name_en || 'Sintawgyi Restaurant') : (settings.shop_name || 'စည်တော်ကြီး စားသောက်ဆိုင်');
  const shopSub = isEn ? (settings.shop_name || 'စည်တော်ကြီး စားသောက်ဆိုင်') : (settings.shop_name_en || 'Sintawgyi Restaurant');
  const pageNav = view === 'order' ? NAV[0] : (NAV.find(n => n.key === view) || NAV[0]);
  const roleLabel = t(ROLE_KEY[staff.role] || 'ကောင်တာ');
  const dateText = isEn
    ? now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', weekday: 'short' })
    : `${MY_DAYS[now.getDay()]} · ${now.getDate()} ${MY_MONTHS[now.getMonth()]}`;
  const timeText = isEn
    ? now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const badge = (key) => {
    if (!data) return 0;
    if (key === 'tables') return data.openOrders?.length || 0;
    if (key === 'kitchen') return (data.kitchenCount || 0) + (data.barCount || 0);
    if (key === 'inventory') return data.lowStockCount || 0;
    return 0;
  };

  const pendingSync = pendingCount(drafts);
  const localOpen = drafts.filter(d => d.status === 'open').length;

  const discardDraft = (key) => {
    if (!window.confirm(t('ဒီ အော့ဖ်လိုင်း order ကို ဖျက်မှာ သေချာပါသလား?'))) return;
    removeDraft(key);
    if (orderId === key) { setOrderId(null); setView('tables'); }
    showToast(t('ဖျက်ပြီးပါပြီ'));
  };

  const renderView = () => {
    if (!data) return <AppSkeleton />;
    if (view === 'order' && orderId) {
      return <Order orderId={orderId} data={data} reload={reload} showToast={showToast} openOrder={openOrder}
        online={online} drafts={drafts} syncNow={runSync}
        onBack={() => { setOrderId(null); setView('tables'); }} />;
    }
    switch (view) {
      case 'dashboard': return <Dashboard data={data} go={goto} />;
      case 'catalog': return <CustomerCatalog onBackToPos={() => goto('dashboard')} />;
      case 'kitchen': return <Kitchen data={data} reload={reload} showToast={showToast} />;
      case 'menu': return <MenuAdmin data={data} reload={reload} showToast={showToast} />;
      case 'inventory': return <Inventory reload={reload} showToast={showToast} go={goto} />;
      case 'members': return <Members data={data} reload={reload} showToast={showToast} />;
      case 'expenses': return <Expenses staff={staff} reload={reload} showToast={showToast} />;
      case 'reports': return <Reports data={data} showToast={showToast} />;
      case 'settings': return <Settings data={data} reload={reload} showToast={showToast} onLogout={logout} />;
      default:
        return <Tables data={data} openOrder={openOrder} reload={reload} showToast={showToast} staff={staff}
          online={online} drafts={drafts} syncNow={runSync} />;
    }
  };

  return (
    <div className={`app ${view === 'order' ? 'in-order' : ''} ${navOpen ? 'nav-open' : ''} ${sideCollapsed ? 'side-collapsed' : ''}`}>
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">စည်</div>
          <div className="brand-text">
            <div className="brand-name">{shopName}</div>
            <div className="brand-sub">{shopSub}</div>
          </div>
          <button className="sidebar-close" onClick={() => setNavOpen(false)} aria-label={t('ပိတ်')}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <button className="side-collapse" onClick={toggleSide}
          title={sideCollapsed ? t('ဘေးဘား ဖွင့်') : t('ဘေးဘား ပိတ်')}
          aria-label={sideCollapsed ? t('ဘေးဘား ဖွင့်') : t('ဘေးဘား ပိတ်')}>
          <Icon name="back" size={14} />
        </button>

        <div className="nav-cap">{t('စီမံခန့်ခွဲမှု')}</div>
        <nav>
          {navItems.map(n => (
            <button key={n.key} data-nav={n.key}
              className={`nav-btn ${view === n.key || (n.key === 'tables' && view === 'order') ? 'active' : ''}`}
              onClick={() => goto(n.key)} title={t(n.label)}>
              <span className={`ni t-${n.tone}`}><Icon name={n.icon} size={17} /></span>
              <span className="nav-label">{t(n.label)}</span>
              {badge(n.key) > 0 && <span className="nav-count">{badge(n.key)}</span>}
              <span className="nav-chev" aria-hidden="true">›</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-tools">
          <ThemeToggle className="side-toggle" />
          <LangToggle />
        </div>
        <div className="sidebar-foot">
          <div className="profile">
            <div className="avatar">{(staff.name || '?').slice(0, 1)}</div>
            <div className="profile-text">
              <strong>{staff.name}</strong>
              <span>{roleLabel}</span>
            </div>
          </div>
          <button className="icon-btn side-logout" onClick={logout} title={t('အကောင့် ထွက်')} aria-label={t('အကောင့် ထွက်')}>
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="main">
        <header className={`topbar ${view === 'order' ? 'order-mode' : ''}`}>
          <div className="topbar-left">
            <button className="icon-btn menu-btn mobile-only" onClick={() => setNavOpen(true)} aria-label={t('မီနူး')}>
              <Icon name="menu" />
            </button>
            {view === 'order' ? (
              <button className="icon-btn" onClick={() => { setOrderId(null); setView('tables'); }} aria-label={t('နောက်သို့')}>
                <Icon name="back" />
              </button>
            ) : (
              <span className={`ctx-ico t-${pageNav.tone}`}><Icon name={pageNav.icon} size={17} /></span>
            )}
            <div className="page-id">
              <div className="page-title">{view === 'order' ? t('အရောင်း') : t(pageNav.label)}</div>
              <div className="page-sub">
                <span className="date-chip">
                  <Icon name="calendar" size={13} />
                  <span className="dc-date">{dateText}</span>
                  <span className="sep">·</span>
                  <b>{timeText}</b>
                </span>
                <span className="role-chip">{roleLabel} · {staff.name}</span>
              </div>
            </div>
          </div>
          <div className="topbar-right">
            {drafts.length > 0 && (
              <button className={`sync-pill ${pendingSync > 0 ? 'has-pending' : ''}`} onClick={() => setSyncOpen(true)}
                title={t('အော့ဖ်လိုင်း အော်ဒါများ')}>
                <Icon name="wifi" size={14} />
                <span className="txt">
                  {pendingSync > 0 ? `${pendingSync} ${t('sync စောင့်')}` : `${localOpen} ${t('local အော်ဒါ')}`}
                </span>
              </button>
            )}
            <button
              className="icon-btn calc-launch-btn"
              onClick={() => setCalcOpen(true)}
              title={t('ဂဏန်းတွက်စက်')}
              aria-label={t('ဂဏန်းတွက်စက်')}
            >
              <Icon name="calculator" size={17} />
              <span className="calc-pill-txt desktop-only">{t('တွက်ချက်')}</span>
            </button>
            <span className={`conn ${online ? '' : 'offline'}`} title={online ? t('ချိတ်ဆက်ထားသည်') : t('ချိတ်ဆက်မှု ပြတ်နေသည်')}>
              <Icon name="wifi" size={15} />
              <span className="txt">{online ? t('ချိတ်ဆက်ထားသည်') : t('ချိတ်ဆက်မှု ပြတ်နေသည်')}</span>
            </span>
            <LangToggle />
            <ThemeToggle className="tone-gold" />
            <div className="user-menu">
              <button className="avatar-tile" onClick={() => setUserOpen(v => !v)}
                aria-haspopup="menu" aria-expanded={userOpen} title={staff.name}>
                {(staff.name || '?').slice(0, 1)}
              </button>
              {userOpen && (
                <>
                  <div className="user-scrim" onClick={() => setUserOpen(false)} />
                  <div className="user-pop" role="menu">
                    <div className="up-head">
                      <div className="avatar">{(staff.name || '?').slice(0, 1)}</div>
                      <div className="profile-text">
                        <strong>{staff.name}</strong>
                        <span>{roleLabel}</span>
                      </div>
                    </div>
                    <button className="up-item danger" role="menuitem" onClick={logout}>
                      <Icon name="logout" size={16} /> {t('အကောင့် ထွက်')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {(!online || pendingSync > 0) && (
          <div className={`offline-bar ${online ? 'pending' : 'offline'}`} role="status">
            <span className="ob-dot" />
            <span className="ob-text">
              {online
                ? `${pendingSync} ${t('အော်ဒါ sync စောင့်ဆိုင်းနေသည်')}`
                : t('အော့ဖ်လိုင်း — အရောင်းဆက်လုပ်နိုင်သည်၊ ချိတ်ဆက်မှု ပြန်ရချိန် အလိုအလျောက် sync လုပ်ပါမယ်')}
            </span>
            {online && pendingSync > 0 && (
              <button className="ob-btn" disabled={syncing} onClick={() => runSync()}>
                {syncing ? t('Sync လုပ်နေသည်…') : t('Sync လုပ်မည်')}
              </button>
            )}
            <button className="ob-link" onClick={() => setSyncOpen(true)}>{t('ကြည့်မည်')}</button>
          </div>
        )}

        <main className="content">
          <div className="view-anim" key={`${view}-${orderId || ''}`}>{renderView()}</div>
        </main>
      </div>

      <nav className="bottom-nav">
        {navItems.filter(n => (staff.role === 'owner' ? ['tables', 'dashboard', 'reports', 'kitchen'] : staff.role === 'waiter' ? ['tables', 'kitchen'] : ['tables', 'dashboard', 'kitchen', 'menu']).includes(n.key)).map(n => (
          <button key={n.key} data-bn={n.key}
            className={`bn-item ${view === n.key || (n.key === 'tables' && view === 'order') ? 'active' : ''}`}
            onClick={() => goto(n.key)}>
            <span className="bi"><Icon name={n.icon} size={20} /></span>
            <span>{t(n.short)}</span>
            {badge(n.key) > 0 && <span className="nav-count">{badge(n.key)}</span>}
          </button>
        ))}
        <button data-bn="more" className={`bn-item ${navOpen || !(staff.role === 'owner' ? ['tables', 'dashboard', 'reports', 'kitchen', 'order'] : staff.role === 'waiter' ? ['tables', 'kitchen', 'order'] : ['tables', 'dashboard', 'kitchen', 'menu', 'order']).includes(view) ? 'active' : ''}`} onClick={() => setNavOpen(true)}>
          <span className="bi"><Icon name="more" size={20} /></span>
          <span>{t('ပိုမို')}</span>
        </button>
      </nav>

      {calcOpen && <CalculatorModal isOpen={calcOpen} onClose={() => setCalcOpen(false)} />}
      {syncOpen && (
        <SyncPanel drafts={drafts} online={online} syncing={syncing}
          onSync={runSync} onClose={() => setSyncOpen(false)}
          onOpen={(key) => { setSyncOpen(false); openOrder(key); }}
          onRemove={discardDraft} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SyncPanel({ drafts, online, syncing, onSync, onClose, onOpen, onRemove }) {
  const { t } = useI18n();
  const paidCount = drafts.filter(d => d.status === 'paid').length;
  return (
    <Modal title={t('အော့ဖ်လိုင်း အော်ဒါများ')} wide onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t('ပိတ်')}</button>
      <button className="btn" disabled={!online || syncing || !paidCount} onClick={() => onSync()}>
        <Icon name="wifi" size={16} />
        {syncing ? t('Sync လုပ်နေသည်…') : `${t('Sync လုပ်မည်')}${paidCount ? ` (${paidCount})` : ''}`}
      </button>
    </>}>
      <p className="hint mt-0">
        {t('အော့ဖ်လိုင်းမှာ ရောင်းထားသော order များကို ဤနေရာတွင် စောင့်ကြည့်နိုင်သည်။ ငွေရှင်းပြီး order များ ချိတ်ဆက်မှု ရချိန် အလိုအလျောက် sync ဖြစ်ပါမည်။')}
      </p>
      {!online && (
        <div className="offline-note">
          <Icon name="wifi" size={15} />
          {t('အော့ဖ်လိုင်း ဖြစ်နေသည် — ချိတ်ဆက်မှု ပြန်ရမှ sync လုပ်နိုင်မည်')}
        </div>
      )}
      {drafts.length === 0 ? <Empty text={t('အော့ဖ်လိုင်း အော်ဒါ မရှိပါ')} /> : (
        <div className="list sync-list">
          {drafts.map(d => (
            <div className={`list-row static sync-row ${d.status}`} key={d.key}>
              <span className="quick-ico sm">
                <Icon name={d.type === 'delivery' ? 'phone' : d.type === 'takeaway' ? 'cart' : 'table'} size={17} />
              </span>
              <div className="grow">
                <strong>#{d.order_no} · {money(d.total)}</strong>
                <small className="muted">
                  {d.items.length} {t('မျိုး')} · {d.opened_at?.slice(11, 16)}
                </small>
                {d.error && <div className="error-text">{d.error}</div>}
              </div>
              <span className={`badge ${d.status === 'paid' ? 'bad' : 'ok'}`}>
                {d.status === 'paid' ? t('sync စောင့်') : t('local အော်ဒါ')}
              </span>
              {d.status === 'open' && <button className="btn ghost sm" onClick={() => onOpen(d.key)}>{t('ဖွင့်')}</button>}
              {d.status === 'open' && <button className="btn danger sm" onClick={() => onRemove(d.key)}>{t('ဖျက်')}</button>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function AppSkeleton() {
  return (
    <div className="skeleton-page" aria-busy="true" aria-label="Loading">
      <div className="sk-row"><span className="sk sk-title" /><span className="sk sk-pill" /></div>
      <div className="sk-cards">
        {[0, 1, 2, 3].map(i => (
          <div className="sk-card" key={i}>
            <span className="sk sk-line w40" />
            <span className="sk sk-line w70" />
            <span className="sk sk-line w55" />
          </div>
        ))}
      </div>
      <div className="sk-panel">
        <span className="sk sk-line w30" />
        {[0, 1, 2, 3, 4].map(i => (
          <div className="sk-list-row" key={i}>
            <span className="sk sk-dot" />
            <span className="sk sk-line w60" />
            <span className="sk sk-line w15" />
          </div>
        ))}
      </div>
    </div>
  );
}
