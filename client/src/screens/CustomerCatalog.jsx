import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getFoodImage } from '../foodPresets.js';
import { Icon, ThemeToggle, LangToggle, ModalFrame, stationLabel } from '../components/ui.jsx';
import { AlinnThitCredit } from '../components/AlinnThitPromo.jsx';
import { useI18n } from '../i18n.jsx';

const QUICK_NOTES = [
  { my: 'အစပ်လျှော့ပါ', en: 'Less spicy' },
  { my: 'အစပ်ပိုထည့်ပါ', en: 'Extra spicy' },
  { my: 'ဆီနည်းပါ', en: 'Less oil' },
  { my: 'အချိုမှုန့်မထည့်ပါနှင့်', en: 'No MSG' },
  { my: 'ကြက်သွန်ဖြူများများ', en: 'Extra garlic' },
  { my: 'အသီးအရွက်များများ', en: 'Extra veggies' },
  { my: 'ပါဆယ်သီးသန့်ထုတ်ပေးပါ', en: 'Pack separately' }
];

const CAT_TONES = ['tone-amber', 'tone-orange', 'tone-rose', 'tone-emerald', 'tone-sky', 'tone-indigo', 'tone-violet', 'tone-blue'];

const CUSTOMER_ORDERS_KEY = 'customer_orders';
const readSavedOrders = () => {
  try {
    const list = JSON.parse(localStorage.getItem(CUSTOMER_ORDERS_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export default function CustomerCatalog({ onBackToPos = null }) {
  const { t, isEn, isZh } = useI18n();
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState({});
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [stations, setStations] = useState([]);

  // Filter & Search
  const [selectedCat, setSelectedCat] = useState('all');
  const [search, setSearch] = useState('');

  // Cart / Tray state
  const [tray, setTray] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('customer_tray') || '[]');
    } catch {
      return [];
    }
  });

  // Dining Mode & Customer Info
  const [diningType, setDiningType] = useState('dine_in'); // 'dine_in' | 'takeaway'
  const [selectedTableId, setSelectedTableId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNote, setOrderNote] = useState('');

  // Modals & Drawers
  const [trayOpen, setTrayOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [detailQty, setDetailQty] = useState(1);
  const [detailNote, setDetailNote] = useState('');
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [installEvt, setInstallEvt] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [orderDetail, setOrderDetail] = useState(null);
  const [myOrders, setMyOrders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('customer_orders') || '[]'); } catch { return []; }
  });
  const [myOrdersOpen, setMyOrdersOpen] = useState(false);

  const isStandalone = typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const isIos = typeof navigator !== 'undefined' &&
    (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const showInstallBanner = !isStandalone && !installDismissed && (!!installEvt || isIos);

  // Submitted Order Tracking state
  const [activeOrder, setActiveOrder] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('customer_active_order') || 'null');
    } catch {
      return null;
    }
  });

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const headerRef = useRef(null);

  useEffect(() => {
    if (loading) return undefined;
    const el = headerRef.current;
    if (!el) return undefined;
    const apply = () => document.documentElement.style.setProperty('--catalog-header-h', `${el.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--catalog-header-h');
    };
  }, [loading]);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };
  const L = (my, en, zh) => (isZh ? (zh || t(my)) : isEn ? (en || t(my)) : (my || en));

  const orderStateLabel = (state) => ({
    pending: L('အတည်ပြုရန် စောင့်နေသည်', 'Awaiting confirmation'),
    confirmed: L('အတည်ပြုပြီး', 'Confirmed'),
    preparing: L('ချက်ပြုတ်နေသည်', 'Preparing'),
    served: L('ကျွေးပြီး', 'Served'),
    completed: L('ပြီးစီးပြီး', 'Completed'),
    cancelled: L('ပယ်ဖျက်ပြီး', 'Cancelled')
  }[state] || L('အတည်ပြုရန် စောင့်နေသည်', 'Awaiting confirmation'));

  const refreshMyOrders = async () => {
    const saved = readSavedOrders();
    if (!saved.length) { setMyOrders([]); return; }
    setMyOrders(saved);
    const tokens = saved.map(o => o.token).filter(Boolean);
    if (!tokens.length) return;
    try {
      const res = await fetch(`/api/catalog/orders?tokens=${tokens.join(',')}`);
      if (!res.ok) return;
      const live = await res.json();
      const byToken = new Map(live.map(o => [o.token, o]));
      const merged = saved.map(o => {
        const l = byToken.get(o.token);
        if (!l) return o;
        const items = l.items?.length
          ? l.items.map((it, i) => ({ ...it, id: `${o.id}_${i}` }))
          : o.items;
        return { ...o, state: l.state, total: l.total, tableName: l.tableName || o.tableName, closedAt: l.closedAt, items };
      });
      setMyOrders(merged);
      localStorage.setItem(CUSTOMER_ORDERS_KEY, JSON.stringify(merged));
    } catch {}
  };

  const promptInstall = async () => {
    if (!installEvt) {
      setInstallHelpOpen(true);
      return;
    }
    installEvt.prompt();
    try { await installEvt.userChoice; } catch {}
    setInstallEvt(null);
  };

  // PWA install + catalog-specific manifest (opens the menu when launched)
  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallEvt(e); };
    const onInstalled = () => {
      setInstallEvt(null);
      showToast(t('App အဖြစ် ထည့်သွင်းပြီးပါပြီ'));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    const link = document.querySelector('link[rel="manifest"]');
    const prevHref = link?.getAttribute('href');
    if (link) link.setAttribute('href', '/manifest-catalog.webmanifest');
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (link && prevHref) link.setAttribute('href', prevHref);
    };
  }, []);

  // Save tray to session
  useEffect(() => {
    sessionStorage.setItem('customer_tray', JSON.stringify(tray));
  }, [tray]);

  // Save active order to session
  useEffect(() => {
    if (activeOrder) {
      sessionStorage.setItem('customer_active_order', JSON.stringify(activeOrder));
    } else {
      sessionStorage.removeItem('customer_active_order');
    }
  }, [activeOrder]);

  // Load catalog data
  const loadData = async () => {
    try {
      const [menuRes, tableRes] = await Promise.all([
        fetch('/api/catalog/menu').then(r => r.json()),
        fetch('/api/catalog/tables').then(r => r.json()).catch(() => [])
      ]);
      if (menuRes.shop) setShop(menuRes.shop);
      if (menuRes.categories) setCategories(menuRes.categories);
      if (menuRes.items) setItems(menuRes.items);
      if (Array.isArray(menuRes.stations)) setStations(menuRes.stations);
      if (Array.isArray(tableRes)) setTables(tableRes);
      setLoading(false);
    } catch (e) {
      console.error('Failed to load menu catalog', e);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    refreshMyOrders();

    // Check URL params for pre-selected table (?table=2 or #/catalog?table=2)
    try {
      const hash = window.location.hash || '';
      const queryStr = hash.includes('?') ? hash.split('?')[1] : window.location.search.slice(1);
      const params = new URLSearchParams(queryStr);
      const tParam = params.get('table');
      if (tParam) {
        setSelectedTableId(String(tParam));
        setDiningType('dine_in');
      }
    } catch {}

    // Realtime events
    let es;
    try {
      es = new EventSource('/api/events');
      es.onmessage = () => {
        loadData();
        refreshMyOrders();
      };
    } catch {}
    return () => { if (es) es.close(); };
  }, []);

  useEffect(() => {
    if (myOrdersOpen) refreshMyOrders();
  }, [myOrdersOpen]);

  useEffect(() => {
    if (!shop.name) return;
    const title = isEn ? (shop.name_en || shop.name) : (shop.name || shop.name_en);
    document.title = `${title} · ${isEn ? 'Menu' : 'မီနူး'}`;
  }, [shop, isEn]);

  // Category map
  const catMap = useMemo(() => {
    const map = new Map();
    categories.forEach(c => map.set(c.id, c.name));
    return map;
  }, [categories]);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    let list = items;
    if (selectedCat !== 'all') {
      list = list.filter(i => String(i.category_id) === String(selectedCat));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i =>
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.code && i.code.toLowerCase().includes(q)) ||
        (catMap.get(i.category_id) && catMap.get(i.category_id).toLowerCase().includes(q))
      );
    }
    return list;
  }, [items, selectedCat, search, catMap]);

  // Tray helpers
  const trayCount = useMemo(() => tray.reduce((s, it) => s + it.qty, 0), [tray]);
  const traySubtotal = useMemo(() => tray.reduce((s, it) => s + (it.price * it.qty), 0), [tray]);

  const addToTray = (item, qty = 1, note = '') => {
    if (item.is_alcohol && sessionStorage.getItem('customer_age_ok') !== '1') {
      const ok = window.confirm(L(
        'အရက်ပါဝင်သော ပစ္စည်းများကို အသက် ၁၈ နှစ်ပြည့်ပြီးသူများသာ ဝယ်ယူနိုင်ပါသည်။ ဆက်လုပ်မည်လား?',
        'Alcoholic items are for customers aged 18 and over. Continue?'
      ));
      if (!ok) return;
      sessionStorage.setItem('customer_age_ok', '1');
    }
    setTray(prev => {
      const existingIdx = prev.findIndex(t => t.id === item.id && (t.note || '') === note);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].qty += qty;
        return copy;
      }
      return [...prev, {
        id: item.id,
        name: item.name,
        price: item.price,
        unit: item.unit,
        image: item.image,
        category_id: item.category_id,
        station: item.station,
        is_alcohol: item.is_alcohol,
        code: item.code,
        qty,
        note
      }];
    });
    showToast(`✓ ${L(`"${item.name}" ဗန်းထဲထည့်ပြီးပါပြီ`, `"${item.name}" added to tray`)}`);
  };

  const updateTrayQty = (idx, delta) => {
    setTray(prev => {
      const copy = [...prev];
      const newQty = copy[idx].qty + delta;
      if (newQty <= 0) {
        copy.splice(idx, 1);
      } else {
        copy[idx].qty = newQty;
      }
      return copy;
    });
  };

  const removeTrayItem = (idx) => {
    setTray(prev => prev.filter((_, i) => i !== idx));
  };

  const clearTray = () => {
    setTray([]);
  };

  const openDetail = (item) => {
    setDetailItem(item);
    setDetailQty(1);
    setDetailNote('');
  };

  const scrollToMenu = () => {
    document.querySelector('.catalog-card-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const confirmDetailAdd = () => {
    if (!detailItem) return;
    addToTray(detailItem, detailQty, detailNote);
    setDetailItem(null);
  };

  // Submit Order
  const submitOrder = async () => {
    if (tray.length === 0) {
      showToast(L('⚠️ ဗန်းထဲတွင် မည်သည့်ဟင်းပွဲမှ မရှိသေးပါ', '⚠️ Your tray is empty'));
      return;
    }
    if (diningType === 'dine_in' && !selectedTableId) {
      setTableModalOpen(true);
      showToast(L('⚠️ စားပွဲနံပါတ် ရွေးချယ်ပေးပါ', '⚠️ Please choose a table'));
      return;
    }
    if (diningType === 'takeaway' && !customerName.trim() && !customerPhone.trim()) {
      showToast(L('⚠️ ပါဆယ်မှာယူရန် ဖောက်သည်အမည် သို့မဟုတ် ဖုန်းနံပါတ် ဖြည့်ပေးပါ', '⚠️ Add a name or phone number for takeaway'));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: diningType,
        tableId: diningType === 'dine_in' ? selectedTableId : null,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        note: orderNote.trim(),
        items: tray.map(it => ({
          id: it.id,
          name: it.name,
          price: it.price,
          qty: it.qty,
          note: it.note
        }))
      };

      const res = await fetch('/api/catalog/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'အော်ဒါတင်ခြင်း မအောင်မြင်ပါ');

      // Order created!
      const now = new Date();
      const placed = {
        token: data.token,
        id: data.orderId,
        orderNo: data.orderNo,
        type: data.type,
        tableName: data.tableName || (tables.find(t => String(t.id) === String(selectedTableId))?.name || ''),
        total: data.total,
        itemCount: data.itemCount,
        items: tray.map(it => ({ id: it.id, name: it.name, price: it.price, qty: it.qty, note: it.note || '' })),
        time: now.toLocaleTimeString('my-MM', { hour: '2-digit', minute: '2-digit' }),
        date: now.toLocaleDateString('my-MM'),
        state: 'pending'
      };
      setActiveOrder({
        orderId: placed.id,
        orderNo: placed.orderNo,
        type: placed.type,
        tableName: placed.tableName,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        total: placed.total,
        itemCount: placed.itemCount,
        items: [...tray],
        time: placed.time,
        date: placed.date,
        state: 'pending'
      });

      const savedNext = [placed, ...readSavedOrders().filter(o => o.id !== placed.id && o.token !== placed.token)].slice(0, 20);
      localStorage.setItem(CUSTOMER_ORDERS_KEY, JSON.stringify(savedNext));
      setMyOrders(savedNext);

      clearTray();
      setTrayOpen(false);
      showToast(L('🎉 အော်ဒါတင်ခြင်း အောင်မြင်ပါသည်!', '🎉 Order placed successfully!'));
      refreshMyOrders();
    } catch (e) {
      showToast(`⚠️ ${e.message || L('အော်ဒါတင်ခြင်း မအောင်မြင်ပါ', 'Could not place order')}`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTableObj = tables.find(t => String(t.id) === String(selectedTableId));
  const shopTitle = isEn
    ? (shop.name_en || shop.name || 'Si Daw Gyi Restaurant')
    : (shop.name || 'စည်တော်ကြီး စားသောက်ဆိုင်');
  const shopSub = isEn ? (shop.name || '') : (shop.name_en || '');

  if (loading) {
    return (
      <div className="catalog-loading-screen">
        <img className="catalog-loading-logo" src="/icon.svg" alt="" width="56" height="56" />
        <div className="spinner" />
        <div className="catalog-loading-text">
          {L('မီနူး ကတ်တလောက် ရယူနေပါသည်…', 'Loading the menu…')}
        </div>
      </div>
    );
  }

  return (
    <div className="customer-catalog-app">
      {/* Top Floating / Sticky Restaurant Brand Header */}
      <header className="catalog-header" ref={headerRef}>
        <div className="catalog-header-inner">
          <div className="catalog-brand-info">
            <img className="catalog-logo-badge" src="/icon.svg" alt="" width="42" height="42" />
            <div className="catalog-brand-text">
              <h1 className="catalog-brand-title">{shopTitle}</h1>
              <div className="catalog-brand-subtitle">
                {shopSub && <span className="cbs-name">{shopSub}</span>}
                {shopSub && <span className="dot-sep desktop-only">·</span>}
                <span className="live-status-chip">
                  <span className="pulse-dot" /> {isEn ? 'Open' : 'ဖွင့်ထား'}
                </span>
              </div>
            </div>
          </div>

          <div className="catalog-header-actions">
            <LangToggle />
            <ThemeToggle className="catalog-theme-toggle" />

            {onBackToPos && (
              <button className="btn ghost sm" onClick={onBackToPos} title="POS သို့ ပြန်သွားရန်">
                <Icon name="back" size={14} /> POS
              </button>
            )}
          </div>
        </div>

        {/* Search & Dining Segment */}
        <div className="catalog-search-bar">
          <div className="catalog-search-wrap">
            <Icon name="search" size={16} className="search-icon" />
            <input
              type="text"
              placeholder={t('ဟင်းပွဲ/အသောက် ရှာရန်…')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="catalog-search-input"
            />
            {search && (
              <button className="clear-search" onClick={() => setSearch('')} aria-label={L('ရှာဖွေမှု ရှင်းမည်', 'Clear search')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          {/* Dining Mode & Table Indicator */}
          <button
            className={`table-selector-btn ${diningType === 'dine_in' ? 'dine' : 'take'}`}
            onClick={() => setTableModalOpen(true)}
            title={t('စားပွဲရွေးရန်')}
          >
            <Icon name={diningType === 'dine_in' ? 'table' : 'box'} size={16} />
            <span className="tsb-label">
              {diningType === 'dine_in'
                ? (selectedTableObj ? selectedTableObj.name : L('စားပွဲရွေးရန်', 'Select table'))
                : t('ပါဆယ်')}
            </span>
            <Icon name="down" size={12} />
          </button>
        </div>
      </header>

      {showInstallBanner && (
        <div className="catalog-install-banner">
          <span className="cib-icon"><Icon name="download" size={17} /></span>
          <div className="cib-text">
            <strong>{t('ဖုန်းထဲမှာ App အဖြစ် သိမ်းထားပါ')}</strong>
            <span>{t('မီနူးကို App လို အမြန်ဖွင့်နိုင်ပါသည်')}</span>
          </div>
          <button className="btn sm cib-btn" onClick={promptInstall}>
            {t('App ထည့်သွင်းရန်')}
          </button>
          <button className="cib-close" onClick={() => setInstallDismissed(true)} aria-label="close">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Main Catalog Menu Grid */}
      <main className="catalog-main">
        <section className="catalog-promo-banner">
          <img className="cpb-photo" src="/menu/grilled_chicken.webp" alt="" aria-hidden="true" />
          <div className="cpb-shade" />
          <div className="cpb-copy">
            <span className="cpb-eyebrow">🍽️ {L('ဆိုင်တွင်း · ပါဆယ်', 'Dine-in · Takeaway')}</span>
            <h2>{L('အရသာရှိ ဟင်းလျာများကို ယခုပဲ ရွေးချယ်ပါ', 'Pick your favourites from the menu')}</h2>
            <p>{L('ဟင်းပွဲများကို ရွေးပြီး ဗန်းထဲထည့်ကာ စားပွဲမှာတင် မှာယူနိုင်ပါတယ်။', 'Add dishes to your tray and order right from your table.')}</p>
            <button type="button" className="cpb-cta" onClick={scrollToMenu}>
              {L('မီနူး ကြည့်မည်', 'Browse menu')}
              <Icon name="down" size={14} />
            </button>
          </div>
        </section>

        {/* Sticky Category Tabs Bar */}
        <div className="catalog-category-bar">
          <button
            className={`cat-pill tone-cyan ${selectedCat === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCat('all')}
          >
            <span>{t('အားလုံး')}</span>
            <span className="cat-count">{items.length}</span>
          </button>
          {categories.map((cat, idx) => {
            const count = items.filter(i => i.category_id === cat.id).length;
            const cName = t(cat.name);
            return (
              <button
                key={cat.id}
                className={`cat-pill ${CAT_TONES[idx % CAT_TONES.length]} ${String(selectedCat) === String(cat.id) ? 'active' : ''}`}
                onClick={() => setSelectedCat(cat.id)}
              >
                <span>{cName}</span>
                <span className="cat-count">{count}</span>
              </button>
            );
          })}
        </div>

        {myOrders.length > 0 && (
          <button type="button" className="my-orders-bar" onClick={() => setMyOrdersOpen(true)}>
            <span className="mob-icon"><Icon name="receipt" size={17} /></span>
            <span className="mob-text">
              <strong>{L('ကျွန်ုပ်၏ အော်ဒါများ', 'My orders')}</strong>
              <small>{myOrders.length} {L('ခု', 'orders')}</small>
            </span>
            <span className={`mos-status ${myOrders[0].state || 'pending'}`}>{orderStateLabel(myOrders[0].state)}</span>
            <Icon name="chevronRight" size={16} className="mob-go" />
          </button>
        )}

        {activeOrder && (
          <div className="active-order-banner">
            <div className="aob-left">
              <span className="aob-icon">🎉</span>
              <div>
                <strong>{L(`အော်ဒါ #${activeOrder.orderNo} တင်ပြီး`, `Order #${activeOrder.orderNo} placed`)}</strong>
                <p>
                  {activeOrder.tableName ? `${activeOrder.tableName} · ` : `${L('ပါဆယ်', 'Takeaway')} · `}
                  {(() => {
                    const n = activeOrder.itemCount || activeOrder.items?.length || 0;
                    return L(`ဟင်း ${n} မျိုး`, `${n} item${n > 1 ? 's' : ''}`);
                  })()}
                  {' · '}{activeOrder.total?.toLocaleString()} Ks
                </p>
              </div>
            </div>
            <div className="aob-actions">
              <button
                className="btn sm"
                onClick={() => {
                  const live = myOrders.find(o => o.id === activeOrder.orderId);
                  setOrderDetail({ ...activeOrder, state: live?.state || activeOrder.state || 'pending' });
                }}
              >
                {L('အသေးစိတ်', 'Details')}
              </button>
              <button className="btn ghost sm" onClick={() => setActiveOrder(null)}>{L('ပိတ်', 'Close')}</button>
            </div>
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="catalog-empty">
            <div className="empty-emoji">🍽️</div>
            <h3>{t('ဟင်းပွဲမရှိပါ')}</h3>
            <p className="muted">{L('ရှာဖွေမှုနှင့် ကိုက်ညီသော ဟင်းပွဲ မတွေ့ပါ', 'No dishes match your search')}</p>
            <button className="btn outline sm" onClick={() => { setSearch(''); setSelectedCat('all'); }}>
              {L('အားလုံးပြန်ကြည့်မည်', 'Show all dishes')}
            </button>
          </div>
        ) : (
          <div className="catalog-card-grid" key={selectedCat}>
            {filteredItems.map(item => {
              const catObj = categories.find(c => c.id === item.category_id);
              const catName = isEn ? (catObj?.name_en || catObj?.name || '') : (catObj?.name || catObj?.name_en || '');
              const imgUrl = getFoodImage(item, catName);
              const trayItemsOfDish = tray.filter(t => t.id === item.id);
              const totalDishInTray = trayItemsOfDish.reduce((s, it) => s + it.qty, 0);
              const dishTitle = t(item.name);

              return (
                <div key={item.id} className={`catalog-food-card ${totalDishInTray > 0 ? 'in-tray' : ''}`} onClick={() => openDetail(item)}>
                  <div className="cfc-image-wrap">
                    <img src={imgUrl} alt={dishTitle} loading="lazy" className="cfc-img" />
                    
                    {/* Badge Badges */}
                    <div className="cfc-badges-top">
                      {item.code && <span className="cfc-code-badge">{item.code}</span>}
                      {item.station === 'bar' ? (
                        <span className="cfc-station-badge bar-station">🍹 {stationLabel(stations, item.station, isEn)}</span>
                      ) : item.station === 'kitchen' ? (
                        <span className="cfc-station-badge kitchen">🍳 {stationLabel(stations, item.station, isEn)}</span>
                      ) : (
                        <span className="cfc-station-badge custom">🏷 {stationLabel(stations, item.station, isEn)}</span>
                      )}
                      {item.is_alcohol ? <span className="cfc-alc-badge">18+</span> : null}
                    </div>

                    {totalDishInTray > 0 && (
                      <div className="cfc-tray-badge">
                        {totalDishInTray} {isEn ? 'in tray' : 'ပွဲယူထား'}
                      </div>
                    )}
                  </div>

                  <div className="cfc-body">
                    <div className="cfc-title-row">
                      <h3 className="cfc-title">{dishTitle}</h3>
                      <span className="cfc-cat">{t(catName)}</span>
                    </div>

                    <div className="cfc-foot-row">
                      <div className="cfc-price-box">
                        <strong className="cfc-price">{Number(item.price).toLocaleString()}</strong>
                        <span className="cfc-unit">Ks {item.unit ? `/${item.unit}` : ''}</span>
                      </div>

                      <button
                        type="button"
                        className={`cfc-add-btn ${totalDishInTray > 0 ? 'added' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          addToTray(item, 1, '');
                        }}
                        title={L('ဗန်းထဲထည့်မည်', 'Add to tray')}
                        aria-label={L('ဗန်းထဲထည့်မည်', 'Add to tray')}
                      >
                        <Icon name="plus" size={15} />
                        <span>{totalDishInTray > 0 ? L('ထပ်ထည့်', 'More') : L('မှာမည်', 'Add')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <AlinnThitCredit />
      </main>

      {/* Floating Bottom Cart Bar */}
      {trayCount > 0 && (
        <div className="catalog-floating-tray-bar">
          <div
            className="cftb-inner"
            onClick={() => setTrayOpen(true)}
            role="button"
            tabIndex={0}
            aria-label={L('ဗန်းကြည့်မည်', 'View tray')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setTrayOpen(true); }}
          >
            <div className="cftb-left">
              <div className="cftb-icon-wrap">
                <Icon name="receipt" size={20} />
                <span className="cftb-counter">{trayCount}</span>
              </div>
              <div className="cftb-info">
                <div className="cftb-qty">
                  {L(`${trayCount} ပွဲ ရွေးချယ်ထားသည်`, `${trayCount} item${trayCount > 1 ? 's' : ''} selected`)}
                </div>
                <div className="cftb-subtotal">{traySubtotal.toLocaleString()} Ks</div>
              </div>
            </div>

            <button type="button" className="cftb-action-btn">
              <span>{L('ဗန်းကြည့်မည်', 'View tray')}</span>
              <Icon name="forward" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Dish Detail & Customization Modal */}
      {detailItem && (
        <ModalFrame className="catalog-dish-modal" backdropClassName="catalog-sheet-layer" onClose={() => setDetailItem(null)}>
            <div className="cdm-header">
              <div className="cdm-img-hero">
                <img
                  src={getFoodImage(detailItem, catMap.get(detailItem.category_id))}
                  alt={detailItem.name}
                />
                <button className="cdm-close" onClick={() => setDetailItem(null)} aria-label={L('ပိတ်မည်', 'Close')}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>

            <div className="cdm-body">
              <div className="cdm-title-wrap">
                <h2>{isEn ? (detailItem.name_en || detailItem.name) : (detailItem.name || detailItem.name_en)}</h2>
                <div className="cdm-meta">
                  <span className="cdm-cat">{t(catMap.get(detailItem.category_id) || '')}</span>
                  {detailItem.code && <span className="cfc-code-badge">{detailItem.code}</span>}
                  {detailItem.station === 'bar' ? (
                    <span className="cfc-station-badge bar-station">🍹 {stationLabel(stations, detailItem.station, isEn)}</span>
                  ) : detailItem.station === 'kitchen' ? (
                    <span className="cfc-station-badge kitchen">🍳 {stationLabel(stations, detailItem.station, isEn)}</span>
                  ) : (
                    <span className="cfc-station-badge custom">🏷 {stationLabel(stations, detailItem.station, isEn)}</span>
                  )}
                </div>
                <div className="cdm-price">
                  {Number(detailItem.price).toLocaleString()} Ks
                  <small className="muted">{detailItem.unit ? ` (${detailItem.unit})` : ''}</small>
                </div>
              </div>

              {/* Quantity Stepper */}
              <div className="cdm-qty-section">
                <label>{L('အရေအတွက်', 'Quantity')}</label>
                <div className="stepper-box">
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => setDetailQty(Math.max(1, detailQty - 1))}
                    disabled={detailQty <= 1}
                    aria-label={L('အရေအတွက် လျှော့', 'Decrease quantity')}
                  >
                    -
                  </button>
                  <span className="stepper-val">{detailQty}</span>
                  <button
                    type="button"
                    className="stepper-btn"
                    onClick={() => setDetailQty(detailQty + 1)}
                    aria-label={L('အရေအတွက် တိုး', 'Increase quantity')}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Quick Cooking Note Chips */}
              <div className="cdm-notes-section">
                <label>{L('ချက်ပြုတ်ရန် သီးသန့်မှာကြားချက်များ', 'Cooking instructions')}</label>
                <div className="quick-note-chips">
                  {QUICK_NOTES.map(q => (
                    <button
                      key={q.my}
                      type="button"
                      className={`note-chip ${detailNote.includes(q.my) ? 'active' : ''}`}
                      onClick={() => {
                        if (detailNote.includes(q.my)) {
                          setDetailNote(detailNote.replace(q.my, '').trim());
                        } else {
                          setDetailNote(detailNote ? `${detailNote}, ${q.my}` : q.my);
                        }
                      }}
                    >
                      {isEn ? q.en : q.my}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder={L('ဥပမာ - ကြက်သွန်နီမပါ၊ ငရုတ်သီးစိမ်းများများ…', 'e.g. No onions, extra green chili…')}
                  value={detailNote}
                  onChange={e => setDetailNote(e.target.value)}
                  className="cdm-note-input"
                />
              </div>
            </div>

            <div className="cdm-footer">
              <div className="cdm-total-sum">
                <small className="muted">{L('စုစုပေါင်း', 'Total')}</small>
                <strong>{(detailItem.price * detailQty).toLocaleString()} Ks</strong>
              </div>
              <button type="button" className="btn success cdm-submit" onClick={confirmDetailAdd}>
                <Icon name="plus" size={16} /> {t('ဗန်းထဲသို့ ထည့်မည်')}
              </button>
            </div>
        </ModalFrame>
      )}

      {/* Customer Tray Drawer / Checkout Modal */}
      {trayOpen && (
        <ModalFrame className="customer-tray-drawer" backdropClassName="catalog-sheet-layer" onClose={() => setTrayOpen(false)}>
            <div className="modal-head">
              <div className="tray-title-group">
                <h3><Icon name="cart" size={18} /> {L('ဗန်းထဲက စာရင်း', 'Your Tray')}</h3>
                <span className="tray-badge-pill">
                  {trayCount} {isEn ? (trayCount === 1 ? 'item' : 'items') : 'ပွဲ'}
                </span>
              </div>
              <button type="button" className="icon-btn" onClick={() => setTrayOpen(false)} aria-label={L('ပိတ်မည်', 'Close')}>
                <Icon name="close" size={18} />
              </button>
            </div>

            {/* Tray Content */}
            <div className="tray-drawer-body">
              {tray.length === 0 ? (
                <div className="tray-empty">
                  <div className="tray-empty-icon">🍽️</div>
                  <h4>{isEn ? 'Your tray is empty' : 'ဗန်းထဲတွင် ဟင်းပွဲမရှိပါ'}</h4>
                  <p className="muted">{isEn ? 'Select dishes from the menu' : 'ဟင်းပွဲများ ရွေးချယ်ပါ'}</p>
                  <button className="btn outline sm" onClick={() => setTrayOpen(false)}>
                    {isEn ? 'Browse Menu' : 'မီနူးကြည့်မည်'}
                  </button>
                </div>
              ) : (
                <>
                  {/* Dining Mode Quick Pill */}
                  <div className="tray-dining-summary" onClick={() => setTableModalOpen(true)}>
                    <div className="tds-left">
                      <span className="tds-icon">
                        <Icon name={diningType === 'dine_in' ? 'table' : 'box'} size={17} />
                      </span>
                      <div>
                        <strong>{diningType === 'dine_in' ? L('ဆိုင်ထိုင်စားမည်', 'Dine-In') : L('ပါဆယ်ယူမည်', 'Takeaway')}</strong>
                        <p className="muted">
                          {diningType === 'dine_in'
                            ? (selectedTableObj ? `${L('စားပွဲ', 'Table')}: ${selectedTableObj.name}` : L('⚠️ စားပွဲရွေးပါ', '⚠️ Choose a table'))
                            : L('ထုပ်ပိုး၍ ယူဆောင်မည်', 'Pack and collect')}
                        </p>
                      </div>
                    </div>
                    <button type="button" className="btn ghost sm">{L('ပြင်ဆင်', 'Edit')}</button>
                  </div>

                  {/* Customer Information Section */}
                  <div className="tray-customer-inputs">
                    <div className="input-group">
                      <label>{L('ဖောက်သည် အမည်', 'Customer name')}</label>
                      <input
                        type="text"
                        placeholder={L('ဥပမာ - မောင်မောင်', 'e.g. Aung Aung')}
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label>{L('ဖုန်းနံပါတ်', 'Phone number')}</label>
                      <input
                        type="tel"
                        placeholder="09xxxxxxxxx"
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                      />
                    </div>
                    <div className="input-group full">
                      <label>{L('အော်ဒါ အထွေထွေ မှတ်ချက်', 'Order note')}</label>
                      <input
                        type="text"
                        placeholder={L('ဥပမာ - အားလုံး အစပ်မထည့်ပါနှင့်…', 'e.g. Not spicy for the whole order…')}
                        value={orderNote}
                        onChange={e => setOrderNote(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Tray Items List */}
                  <div className="tray-items-list">
                    <div className="tray-list-header">
                      <span>{L('ရွေးချယ်ထားသော ဟင်းပွဲများ', 'Selected dishes')}</span>
                      <button type="button" className="text-danger-btn" onClick={clearTray}>{L('အားလုံးဖျက်မည်', 'Clear all')}</button>
                    </div>

                    {tray.map((it, idx) => (
                      <div key={`${it.id}_${idx}`} className="tray-item-row">
                        <img
                          src={it.image || getFoodImage(it, catMap.get(it.category_id))}
                          alt={it.name}
                          className="tray-item-thumb"
                        />
                        <div className="tray-item-info">
                          <div className="tray-item-name">{t(it.name)}</div>
                          {it.note && <div className="tray-item-note">✍️ {it.note}</div>}
                          <div className="tray-item-price">
                            {it.price.toLocaleString()} Ks × {it.qty} = <b>{(it.price * it.qty).toLocaleString()} Ks</b>
                          </div>
                        </div>

                        {/* Stepper */}
                        <div className="tray-item-stepper">
                          <button
                            type="button"
                            className="tis-btn"
                            onClick={() => updateTrayQty(idx, -1)}
                            title={L('လျော့မည်', 'Decrease')}
                            aria-label={L('လျော့မည်', 'Decrease')}
                          >
                            -
                          </button>
                          <span className="tis-qty">{it.qty}</span>
                          <button
                            type="button"
                            className="tis-btn"
                            onClick={() => updateTrayQty(idx, 1)}
                            title={L('တိုးမည်', 'Increase')}
                            aria-label={L('တိုးမည်', 'Increase')}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="tis-del-btn"
                            onClick={() => removeTrayItem(idx)}
                            title={L('ပယ်ဖျက်', 'Remove')}
                            aria-label={L('ပယ်ဖျက်', 'Remove')}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bill Summary Breakdown */}
                  <div className="tray-bill-breakdown">
                    <div className="tbb-row">
                      <span>{L(`ဟင်းပွဲ စုစုပေါင်း (${trayCount} ပွဲ)`, `Subtotal (${trayCount} item${trayCount > 1 ? 's' : ''})`)}</span>
                      <strong>{traySubtotal.toLocaleString()} Ks</strong>
                    </div>
                    {Number(shop.tax_rate) > 0 && (
                      <div className="tbb-row muted">
                        <span>{L('ကုန်သွယ်ခွန်', 'Tax')} ({shop.tax_rate}%)</span>
                        <span>{Math.round(traySubtotal * shop.tax_rate / 100).toLocaleString()} Ks</span>
                      </div>
                    )}
                    {Number(shop.service_rate) > 0 && (
                      <div className="tbb-row muted">
                        <span>{L('ဝန်ဆောင်ခ', 'Service charge')} ({shop.service_rate}%)</span>
                        <span>{Math.round(traySubtotal * shop.service_rate / 100).toLocaleString()} Ks</span>
                      </div>
                    )}
                    <div className="tbb-row total">
                      <span>{L('ကျသင့်ငွေ စုစုပေါင်း', 'Grand total')}</span>
                      <span className="tbb-grand-total">
                        {(
                          traySubtotal +
                          Math.round(traySubtotal * (Number(shop.tax_rate) || 0) / 100) +
                          Math.round(traySubtotal * (Number(shop.service_rate) || 0) / 100)
                        ).toLocaleString()} Ks
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Drawer Footer Actions */}
            {tray.length > 0 && (
              <div className="tray-drawer-foot">
                <button
                  className="btn success lg full confirm-order-btn"
                  disabled={submitting}
                  onClick={submitOrder}
                >
                  {submitting ? (
                    L('ပို့နေသည်…', 'Sending…')
                  ) : (
                    <>
                      <Icon name="check" size={18} />
                      <span>{L(`အော်ဒါတင်မည် (${traySubtotal.toLocaleString()} Ks)`, `Place Order (${traySubtotal.toLocaleString()} Ks)`)}</span>
                    </>
                  )}
                </button>
              </div>
            )}
        </ModalFrame>
      )}

      {/* Table & Dining Mode Picker Modal (Rendered after Tray to overlay cleanly) */}
      {tableModalOpen && (
        <ModalFrame className="table-picker-modal" backdropClassName="table-modal-layer catalog-sheet-layer" onClose={() => setTableModalOpen(false)}>
            <div className="modal-head tp-head">
              <div className="tp-head-title">
                <span className="tp-head-icon"><Icon name="table" size={18} /></span>
                <div>
                  <h3>{L('စားသုံးမည့်ပုံစံ ရွေးပါ', 'Choose Dining Mode')}</h3>
                  <p>{L('စားပွဲရွေးပြီး မှာယူပါ — သို့မဟုတ် ပါဆယ်ထုပ်ပါ', 'Pick a table or pack and collect')}</p>
                </div>
              </div>
              <button type="button" className="icon-btn" onClick={() => setTableModalOpen(false)} aria-label={L('ပိတ်မည်', 'Close')}>
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="tp-body">
              <div className="dining-type-toggle">
                <button
                  className={`dtt-btn ${diningType === 'dine_in' ? 'active' : ''}`}
                  onClick={() => setDiningType('dine_in')}
                >
                  <span className="dtt-icon"><Icon name="table" size={19} /></span>
                  <span className="dtt-text">
                    <strong>{L('ဆိုင်ထိုင်စားမည်', 'Dine-In')}</strong>
                    <small className="muted">{L('စားပွဲနံပါတ် သတ်မှတ်၍ မှာယူမည်', 'Pick a table and order')}</small>
                  </span>
                  {diningType === 'dine_in' && <span className="dtt-check"><Icon name="check" size={11} /></span>}
                </button>
                <button
                  className={`dtt-btn take ${diningType === 'takeaway' ? 'active' : ''}`}
                  onClick={() => {
                    setDiningType('takeaway');
                    setSelectedTableId('');
                  }}
                >
                  <span className="dtt-icon"><Icon name="box" size={19} /></span>
                  <span className="dtt-text">
                    <strong>{L('ပါဆယ် ယူမည်', 'Takeaway')}</strong>
                    <small className="muted">{L('ထုပ်ပိုး၍ ယူဆောင်မည်', 'Pack and collect')}</small>
                  </span>
                  {diningType === 'takeaway' && <span className="dtt-check"><Icon name="check" size={11} /></span>}
                </button>
              </div>

              {diningType === 'dine_in' && (
                <div className="table-grid-selection">
                  <div className="tgs-head">
                    <span className="section-title">{L('ဆိုင်တွင်း စားပွဲများ', 'Dine-in tables')}</span>
                    <span className="tgs-free-count">
                      {tables.filter(t => !t.is_busy).length} {L('လွတ်', 'free')}
                    </span>
                  </div>
                  <div className="tgs-grid">
                    {tables.map(t => {
                      const isSelected = String(selectedTableId) === String(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`tgs-card ${isSelected ? 'selected' : ''} ${t.is_busy ? 'busy' : 'free'}`}
                          onClick={() => setSelectedTableId(String(t.id))}
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedTableId(String(t.id)); }}
                        >
                          {isSelected && <span className="tgs-check"><Icon name="check" size={11} /></span>}
                          <div className="tgs-table-name">{t.name}</div>
                          <div className="tgs-zone-seats">
                            <span>{t.zone || L('အပြင်', 'Outdoor')}</span> · <span>{t.seats || 4} {L('ယောက်', 'seats')}</span>
                          </div>
                          <span className={`tgs-status-dot ${t.is_busy ? 'busy' : 'free'}`}>
                            {t.is_busy ? L('လက်ရှိလူရှိ', 'Occupied') : L('လွတ်', 'Free')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="tp-footer">
              <button
                type="button"
                className="btn success full"
                disabled={diningType === 'dine_in' && !selectedTableId}
                onClick={() => {
                  setTableModalOpen(false);
                  showToast(L('✓ စားသုံးမည့်ပုံစံ အတည်ပြုပြီးပါပြီ', '✓ Dining mode confirmed'));
                }}
              >
                {L('အတည်ပြုမည်', 'Confirm')}
              </button>
            </div>
        </ModalFrame>
      )}

      {installHelpOpen && (
        <ModalFrame className="install-help-modal" onClose={() => setInstallHelpOpen(false)}>
          <div className="modal-head">
            <h3>{t('App အဖြစ် ထည့်သွင်းနည်း')}</h3>
            <button className="icon-btn" onClick={() => setInstallHelpOpen(false)}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="install-help-body">
            <div className="ih-step">
              <span className="ih-num">1</span>
              <p>{isIos
                ? t('Safari တွင် Share ခလုတ် နှိပ်ပြီး "Add to Home Screen" ရွေးပါ။')
                : t('ဘရောက်ဇာ မီနူး (⋮) မှ "Install app" သို့မဟုတ် "Add to Home screen" ရွေးပါ။')}</p>
            </div>
            <div className="ih-step">
              <span className="ih-num">2</span>
              <p>{t('ဖုန်း home screen မှ မီနူးကို အမြန်ဖွင့်နိုင်ပါသည်။')}</p>
            </div>
            <button className="btn success full" onClick={() => setInstallHelpOpen(false)}>
              {t('ရပါပြီ')}
            </button>
          </div>
        </ModalFrame>
      )}

      {myOrdersOpen && (
        <ModalFrame className="my-orders-modal" backdropClassName="catalog-sheet-layer" onClose={() => setMyOrdersOpen(false)}>
          <div className="modal-head">
            <h3>{L('ကျွန်ုပ်၏ အော်ဒါများ', 'My orders')}</h3>
            <button type="button" className="icon-btn" onClick={() => setMyOrdersOpen(false)} aria-label={L('ပိတ်မည်', 'Close')}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="my-orders-body">
            {myOrders.map(o => (
              <button
                key={o.token || o.id}
                type="button"
                className="my-order-row"
                onClick={() => { setMyOrdersOpen(false); setOrderDetail(o); }}
              >
                <span className={`mor-ico ${o.type === 'dine_in' ? 'dine' : 'take'}`}>
                  <Icon name={o.type === 'dine_in' ? 'table' : 'box'} size={17} />
                </span>
                <span className="mor-main">
                  <strong>#{o.orderNo}</strong>
                  <small>
                    {o.tableName || L('ပါဆယ်', 'Takeaway')} · {o.itemCount || o.items?.length || 0} {L('မျိုး', 'items')} · {o.date} {o.time}
                  </small>
                </span>
                <span className="mor-right">
                  <span className={`mor-status ${o.state || 'pending'}`}>{orderStateLabel(o.state)}</span>
                  <strong>{Number(o.total || 0).toLocaleString()} Ks</strong>
                </span>
              </button>
            ))}
          </div>
          <div className="my-orders-foot">
            <button type="button" className="btn ghost full" onClick={() => setMyOrdersOpen(false)}>
              {L('ပိတ်မည်', 'Close')}
            </button>
          </div>
        </ModalFrame>
      )}

      {orderDetail && (
        <ModalFrame className="order-detail-modal" backdropClassName="catalog-sheet-layer" onClose={() => setOrderDetail(null)}>
          <div className="modal-head">
            <h3>{L('အော်ဒါ အသေးစိတ်', 'Order details')}</h3>
            <button type="button" className="icon-btn" onClick={() => setOrderDetail(null)} aria-label={L('ပိတ်မည်', 'Close')}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <div className="order-detail-body">
            <div className="od-summary">
              <div>
                <div className="od-no">#{orderDetail.orderNo}</div>
                <div className="od-meta">
                  {orderDetail.tableName || L('ပါဆယ်', 'Takeaway')} · {orderDetail.date} {orderDetail.time}
                </div>
              </div>
              <span className={`od-status ${orderDetail.state || 'pending'}`}>
                <Icon name={orderDetail.state === 'pending' ? 'clock' : orderDetail.state === 'cancelled' ? 'close' : 'check'} size={12} />
                {orderStateLabel(orderDetail.state)}
              </span>
            </div>
            <div className="od-items">
              {(orderDetail.items || []).map((it, i) => (
                <div className="od-row" key={`${it.id}_${i}`}>
                  <span className="od-qty">{it.qty}×</span>
                  <span className="od-name">
                    {it.name}
                    {it.note ? <small> · {it.note}</small> : null}
                  </span>
                  <strong className="od-amt">{(it.price * it.qty).toLocaleString()} Ks</strong>
                </div>
              ))}
            </div>
            <div className="od-total">
              <span>{L('စုစုပေါင်း', 'Total')}</span>
              <strong>{orderDetail.total?.toLocaleString()} Ks</strong>
            </div>
            <button type="button" className="btn success full" onClick={() => setOrderDetail(null)}>
              {L('ရပါပြီ', 'Got it')}
            </button>
          </div>
        </ModalFrame>
      )}

      {toast && <div className={`catalog-toast ${trayCount > 0 ? 'over-tray' : ''}`}>{toast}</div>}
    </div>
  );
}
