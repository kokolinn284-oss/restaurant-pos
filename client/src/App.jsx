import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, setAuth, setUnauthorizedHandler } from './api.js';
import { useI18n } from './i18n.jsx';
import Login from './screens/Login.jsx';
import Tables from './screens/Tables.jsx';
import Order from './screens/Order.jsx';
import Dashboard from './screens/Dashboard.jsx';
import Kitchen from './screens/Kitchen.jsx';
import MenuAdmin from './screens/MenuAdmin.jsx';
import Inventory from './screens/Inventory.jsx';
import Members from './screens/Members.jsx';
import Reports from './screens/Reports.jsx';
import Settings from './screens/Settings.jsx';
import { Icon, ThemeToggle, LangToggle } from './components/ui.jsx';

const NAV = [
  { key: 'tables', label: 'စားပွဲ & အရောင်း', short: 'စားပွဲ', icon: 'table', tone: 'sky' },
  { key: 'dashboard', label: 'ဒက်ရှ်ဘုတ်', short: 'ဒက်ရှ်', icon: 'home', tone: 'indigo' },
  { key: 'kitchen', label: 'မီးဖိုချောင်', short: 'မီးဖိုချောင်', icon: 'fire', tone: 'orange' },
  { key: 'menu', label: 'မီနူး', short: 'မီနူး', icon: 'menu', tone: 'emerald' },
  { key: 'inventory', label: 'ဂိုဒေါင်း', short: 'ဂိုဒေါင်း', icon: 'box', tone: 'amber' },
  { key: 'members', label: 'အဖွဲ့ဝင်', short: 'အဖွဲ့ဝင်', icon: 'users', tone: 'cyan' },
  { key: 'reports', label: 'အစီရင်ခံစာ', short: 'အစီရင်ခံစာ', icon: 'chart', tone: 'violet' },
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
  const [online, setOnline] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(() => localStorage.getItem('pos_side_collapsed') === '1');
  const [userOpen, setUserOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const toastTimer = useRef(null);

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
      setOnline(true);
      return d;
    } catch (e) {
      if (e.status === 401) logout();
      else setOnline(false);
      return null;
    }
  }, [logout]);

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
    return 0;
  };

  const renderView = () => {
    if (!data) return <div className="loading">{t('ဒေတာ ရယူနေသည်…')}</div>;
    if (view === 'order' && orderId) {
      return <Order orderId={orderId} data={data} reload={reload} showToast={showToast} openOrder={openOrder}
        onBack={() => { setOrderId(null); setView('tables'); }} />;
    }
    switch (view) {
      case 'dashboard': return <Dashboard data={data} go={goto} />;
      case 'kitchen': return <Kitchen data={data} reload={reload} showToast={showToast} />;
      case 'menu': return <MenuAdmin data={data} reload={reload} showToast={showToast} />;
      case 'inventory': return <Inventory reload={reload} showToast={showToast} />;
      case 'members': return <Members data={data} reload={reload} showToast={showToast} />;
      case 'reports': return <Reports data={data} showToast={showToast} />;
      case 'settings': return <Settings data={data} reload={reload} showToast={showToast} onLogout={logout} />;
      default:
        return <Tables data={data} openOrder={openOrder} reload={reload} showToast={showToast} staff={staff} />;
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
            <button key={n.key}
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
              {view === 'order' && <div className="page-title">{t('အရောင်း')}</div>}
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
            <span className={`conn ${online ? '' : 'offline'}`} title={online ? t('ချိတ်ဆက်ထားသည်') : t('ချိတ်ဆက်မှု ပြတ်နေသည်')}>
              <Icon name="wifi" size={15} />
              <span className="txt">{online ? t('ချိတ်ဆက်ထားသည်') : t('ချိတ်ဆက်မှု ပြတ်နေသည်')}</span>
            </span>
            <div className="desktop-only"><LangToggle /></div>
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

        <main className="content">{renderView()}</main>
      </div>

      <nav className="bottom-nav">
        {navItems.filter(n => ['tables', 'kitchen', 'menu'].includes(n.key)).map(n => (
          <button key={n.key}
            className={`bn-item ${view === n.key || (n.key === 'tables' && view === 'order') ? 'active' : ''}`}
            onClick={() => goto(n.key)}>
            <span className="bi"><Icon name={n.icon} size={20} /></span>
            <span>{t(n.short)}</span>
            {badge(n.key) > 0 && <span className="nav-count">{badge(n.key)}</span>}
          </button>
        ))}
        <button className={`bn-item ${navOpen || !['tables', 'kitchen', 'menu', 'order'].includes(view) ? 'active' : ''}`} onClick={() => setNavOpen(true)}>
          <span className="bi"><Icon name="more" size={20} /></span>
          <span>{t('ပိုမို')}</span>
        </button>
      </nav>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
