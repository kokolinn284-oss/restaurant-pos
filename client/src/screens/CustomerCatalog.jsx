import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getFoodImage } from '../foodPresets.js';
import { Icon, ThemeToggle, LangToggle } from '../components/ui.jsx';
import { useI18n } from '../i18n.jsx';

const QUICK_NOTES = [
  'အစပ်လျှော့ပါ',
  'အစပ်ပိုထည့်ပါ',
  'ဆီနည်းပါ',
  'အချိုမှုန့်မထည့်ပါနှင့်',
  'ကြက်သွန်ဖြူများများ',
  'အသီးအရွက်များများ',
  'ပါဆယ်သီးသန့်ထုတ်ပေးပါ'
];

export default function CustomerCatalog({ onBackToPos = null }) {
  const { t, isEn } = useI18n();
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState({});
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState([]);

  // Filter & Search
  const [selectedCat, setSelectedCat] = useState('all');
  const [search, setSearch] = useState('');
  const [dietary, setDietary] = useState('all'); // 'all', 'non_alcohol', 'alcohol'

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

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

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
      if (Array.isArray(tableRes)) setTables(tableRes);
      setLoading(false);
    } catch (e) {
      console.error('Failed to load menu catalog', e);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

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
      };
    } catch {}
    return () => { if (es) es.close(); };
  }, []);

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
    if (dietary === 'alcohol') {
      list = list.filter(i => i.is_alcohol);
    } else if (dietary === 'non_alcohol') {
      list = list.filter(i => !i.is_alcohol);
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
  }, [items, selectedCat, dietary, search, catMap]);

  // Tray helpers
  const trayCount = useMemo(() => tray.reduce((s, it) => s + it.qty, 0), [tray]);
  const traySubtotal = useMemo(() => tray.reduce((s, it) => s + (it.price * it.qty), 0), [tray]);

  const addToTray = (item, qty = 1, note = '') => {
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
    showToast(`✓ "${item.name}" ဗန်းထဲထည့်ပြီးပါပြီ`);
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

  const confirmDetailAdd = () => {
    if (!detailItem) return;
    addToTray(detailItem, detailQty, detailNote);
    setDetailItem(null);
  };

  // Submit Order
  const submitOrder = async () => {
    if (tray.length === 0) {
      showToast('⚠️ ဗန်းထဲတွင် မည်သည့်ဟင်းပွဲမှ မရှိသေးပါ');
      return;
    }
    if (diningType === 'dine_in' && !selectedTableId) {
      setTableModalOpen(true);
      showToast('⚠️ စားပွဲနံပါတ် ရွေးချယ်ပေးပါ');
      return;
    }
    if (diningType === 'takeaway' && !customerName.trim() && !customerPhone.trim()) {
      showToast('⚠️ ပါဆယ်မှာယူရန် ဖောက်သည်အမည် သို့မဟုတ် ဖုန်းနံပါတ် ဖြည့်ပေးပါ');
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
      setActiveOrder({
        orderId: data.orderId,
        orderNo: data.orderNo,
        type: data.type,
        tableName: data.tableName || (tables.find(t => String(t.id) === String(selectedTableId))?.name || ''),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        total: data.total,
        itemCount: data.itemCount,
        items: [...tray],
        time: new Date().toLocaleTimeString('my-MM', { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('my-MM')
      });

      clearTray();
      setTrayOpen(false);
      showToast('🎉 အော်ဒါတင်ခြင်း အောင်မြင်ပါသည်!');
    } catch (e) {
      alert(e.message || 'Error placing order');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTableObj = tables.find(t => String(t.id) === String(selectedTableId));

  if (loading) {
    return (
      <div className="catalog-loading-screen">
        <div className="spinner" />
        <div style={{ marginTop: 12, fontWeight: 600 }}>မီနူး ကတ်တလောက် ရယူနေပါသည်…</div>
      </div>
    );
  }

  return (
    <div className="customer-catalog-app">
      {/* Top Floating / Sticky Restaurant Brand Header */}
      <header className="catalog-header">
        <div className="catalog-header-inner">
          <div className="catalog-brand-info">
            <div className="catalog-logo-badge">စည်</div>
            <div>
              <h1 className="catalog-brand-title">{shop.name || 'စည်တော်ကြီး စားသောက်ဆိုင်'}</h1>
              <div className="catalog-brand-subtitle">
                <span>{shop.name_en || 'Sintawgyi Restaurant'}</span>
                <span className="dot-sep desktop-only">·</span>
                <span className="live-status-chip desktop-only">
                  <span className="pulse-dot" /> {isEn ? 'Open' : 'ဖွင့်ထား'}
                </span>
              </div>
            </div>
          </div>

          <div className="catalog-header-actions">
            {/* Dining Mode & Table Indicator */}
            <button
              className={`table-selector-btn ${diningType === 'dine_in' ? 'dine' : 'take'}`}
              onClick={() => setTableModalOpen(true)}
              title={t('စားပွဲရွေးရန်')}
            >
              <Icon name={diningType === 'dine_in' ? 'table' : 'box'} size={16} />
              <span>
                {diningType === 'dine_in'
                  ? (selectedTableObj ? selectedTableObj.name : t('စားပွဲရွေးရန်'))
                  : t('ပါဆယ်')}
              </span>
              <Icon name="down" size={12} />
            </button>

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
              <button className="clear-search" onClick={() => setSearch('')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <div className="dietary-filter-chips">
            <button
              className={`filter-chip ${dietary === 'all' ? 'active' : ''}`}
              onClick={() => setDietary('all')}
            >
              {t('အားလုံး')}
            </button>
            <button
              className={`filter-chip ${dietary === 'non_alcohol' ? 'active' : ''}`}
              onClick={() => setDietary('non_alcohol')}
            >
              {isEn ? 'Food / Drinks' : 'အစားအသောက်'}
            </button>
            <button
              className={`filter-chip ${dietary === 'alcohol' ? 'active' : ''}`}
              onClick={() => setDietary('alcohol')}
            >
              {isEn ? 'Beer & Alcohol' : 'ဘီယာ & အရက်'}
            </button>
          </div>
        </div>

        {/* Sticky Category Tabs Bar */}
        <div className="catalog-category-bar">
          <button
            className={`cat-pill ${selectedCat === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedCat('all')}
          >
            <span>{t('အားလုံး')}</span>
            <span className="cat-count">{items.length}</span>
          </button>
          {categories.map(cat => {
            const count = items.filter(i => i.category_id === cat.id).length;
            const cName = isEn ? (cat.name_en || cat.name) : (cat.name || cat.name_en);
            return (
              <button
                key={cat.id}
                className={`cat-pill ${String(selectedCat) === String(cat.id) ? 'active' : ''}`}
                onClick={() => setSelectedCat(cat.id)}
              >
                <span>{cName}</span>
                <span className="cat-count">{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Catalog Menu Grid */}
      <main className="catalog-main">
        {activeOrder && (
          <div className="active-order-banner">
            <div className="aob-left">
              <span className="aob-icon">🎉</span>
              <div>
                <strong>အော်ဒါ #{activeOrder.orderNo} တင်ပြီး</strong>
                <p>
                  {activeOrder.tableName ? `${activeOrder.tableName} · ` : 'ပါဆယ် · '}
                  ဟင်း {activeOrder.items?.length || 0} မျိုး ({activeOrder.total?.toLocaleString()} Ks)
                </p>
              </div>
            </div>
            <div className="aob-actions">
              <button className="btn sm" onClick={() => setTrayOpen(true)}>အသေးစိတ်</button>
              <button className="btn ghost sm" onClick={() => setActiveOrder(null)}>ပိတ်</button>
            </div>
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="catalog-empty">
            <div className="empty-emoji">🍽️</div>
            <h3>ဟင်းပွဲမရှိပါ</h3>
            <p className="muted">အခြားအမည်ဖြင့် ရှာဖွေပါ</p>
            <button className="btn outline sm" onClick={() => { setSearch(''); setSelectedCat('all'); setDietary('all'); }}>
              အားလုံးပြန်ကြည့်မည်
            </button>
          </div>
        ) : (
          <div className="catalog-card-grid" key={`${selectedCat}_${dietary}`}>
            {filteredItems.map(item => {
              const catObj = categories.find(c => c.id === item.category_id);
              const catName = isEn ? (catObj?.name_en || catObj?.name || '') : (catObj?.name || catObj?.name_en || '');
              const imgUrl = getFoodImage(item, catName);
              const trayItemsOfDish = tray.filter(t => t.id === item.id);
              const totalDishInTray = trayItemsOfDish.reduce((s, it) => s + it.qty, 0);
              const dishTitle = isEn ? (item.name_en || item.name) : (item.name || item.name_en);

              return (
                <div key={item.id} className="catalog-food-card" onClick={() => openDetail(item)}>
                  <div className="cfc-image-wrap">
                    <img src={imgUrl} alt={dishTitle} loading="lazy" className="cfc-img" />
                    
                    {/* Badge Badges */}
                    <div className="cfc-badges-top">
                      {item.code && <span className="cfc-code-badge">{item.code}</span>}
                      {item.station === 'bar' ? (
                        <span className="cfc-station-badge bar">🍹 {isEn ? 'Bar' : 'ဘား'}</span>
                      ) : (
                        <span className="cfc-station-badge kitchen">🍳 {isEn ? 'Kitchen' : 'မီးဖို'}</span>
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
                      <span className="cfc-cat">{catName}</span>
                    </div>

                    <div className="cfc-foot-row">
                      <div className="cfc-price-box">
                        <strong className="cfc-price">{Number(item.price).toLocaleString()}</strong>
                        <span className="cfc-unit">Ks {item.unit ? `/${item.unit}` : ''}</span>
                      </div>

                      <button
                        className={`cfc-add-btn ${totalDishInTray > 0 ? 'added' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          addToTray(item, 1, '');
                        }}
                        title="ဗန်းထဲထည့်မည်"
                      >
                        <Icon name="plus" size={15} />
                        <span>{totalDishInTray > 0 ? 'ထပ်ထည့်' : 'မှာမည်'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Bar */}
      {trayCount > 0 && (
        <div className="catalog-floating-tray-bar">
          <div className="cftb-inner" onClick={() => setTrayOpen(true)}>
            <div className="cftb-left">
              <div className="cftb-icon-wrap">
                <Icon name="receipt" size={20} />
                <span className="cftb-counter">{trayCount}</span>
              </div>
              <div className="cftb-info">
                <div className="cftb-qty">{trayCount} ပွဲ ရွေးချယ်ထားပါသည်</div>
                <div className="cftb-subtotal">{traySubtotal.toLocaleString()} Ks</div>
              </div>
            </div>

            <button className="cftb-action-btn">
              <span>ဗန်းကြည့်မည် / အော်ဒါတင်မည်</span>
              <Icon name="forward" size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Dish Detail & Customization Modal */}
      {detailItem && (
        <div className="modal-backdrop" onClick={() => setDetailItem(null)}>
          <div className="modal-panel catalog-dish-modal" onClick={e => e.stopPropagation()}>
            <div className="cdm-header">
              <div className="cdm-img-hero">
                <img
                  src={getFoodImage(detailItem, catMap.get(detailItem.category_id))}
                  alt={detailItem.name}
                />
                <button className="cdm-close" onClick={() => setDetailItem(null)}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>

            <div className="cdm-body">
              <div className="cdm-title-wrap">
                <h2>{isEn ? (detailItem.name_en || detailItem.name) : (detailItem.name || detailItem.name_en)}</h2>
                <div className="cdm-meta">
                  <span className="cdm-cat">{isEn ? (categories.find(c => c.id === detailItem.category_id)?.name_en || catMap.get(detailItem.category_id)) : catMap.get(detailItem.category_id)}</span>
                  {detailItem.code && <span className="cfc-code-badge">{detailItem.code}</span>}
                  {detailItem.station === 'bar' ? (
                    <span className="cfc-station-badge bar">🍹 {isEn ? 'Bar Beverage' : 'ဘားဖျော်ရည်'}</span>
                  ) : (
                    <span className="cfc-station-badge kitchen">🍳 {isEn ? 'Kitchen Station' : 'မီးဖိုချောင်'}</span>
                  )}
                </div>
                <div className="cdm-price">
                  {Number(detailItem.price).toLocaleString()} Ks
                  <small className="muted">{detailItem.unit ? ` (${detailItem.unit})` : ''}</small>
                </div>
              </div>

              {/* Quantity Stepper */}
              <div className="cdm-qty-section">
                <label>အရေအတွက် (Quantity)</label>
                <div className="stepper-box">
                  <button
                    className="stepper-btn"
                    onClick={() => setDetailQty(Math.max(1, detailQty - 1))}
                    disabled={detailQty <= 1}
                  >
                    -
                  </button>
                  <span className="stepper-val">{detailQty}</span>
                  <button
                    className="stepper-btn"
                    onClick={() => setDetailQty(detailQty + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Quick Cooking Note Chips */}
              <div className="cdm-notes-section">
                <label>ချက်ပြုတ်ရန် သီးသန့်မှာကြားချက်များ (Cooking Instructions)</label>
                <div className="quick-note-chips">
                  {QUICK_NOTES.map(q => (
                    <button
                      key={q}
                      type="button"
                      className={`note-chip ${detailNote.includes(q) ? 'active' : ''}`}
                      onClick={() => {
                        if (detailNote.includes(q)) {
                          setDetailNote(detailNote.replace(q, '').trim());
                        } else {
                          setDetailNote(detailNote ? `${detailNote}, ${q}` : q);
                        }
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="ဥပမာ - ကြက်သွန်နီမပါ၊ ငရုတ်သီးစိမ်းများများ…"
                  value={detailNote}
                  onChange={e => setDetailNote(e.target.value)}
                  className="cdm-note-input"
                />
              </div>

              <div className="cdm-footer">
                <div className="cdm-total-sum">
                  <small className="muted">{isEn ? 'Total' : 'စုစုပေါင်း'}</small>
                  <strong>{(detailItem.price * detailQty).toLocaleString()} Ks</strong>
                </div>
                <button className="btn success cdm-submit" onClick={confirmDetailAdd}>
                  <Icon name="plus" size={16} /> {t('ဗန်းထဲသို့ ထည့်မည်')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Tray Drawer / Checkout Modal */}
      {trayOpen && (
        <div className="modal-backdrop" onClick={() => setTrayOpen(false)}>
          <div className="modal-panel customer-tray-drawer" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="tray-title-group">
                <h3>🛒 {isEn ? 'Your Tray' : 'ဗန်းထဲက စာရင်း'}</h3>
                <span className="tray-badge-pill">{trayCount} ပွဲ</span>
              </div>
              <button className="icon-btn" onClick={() => setTrayOpen(false)}>
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
                      <Icon name={diningType === 'dine_in' ? 'table' : 'box'} size={18} />
                      <div>
                        <strong>{diningType === 'dine_in' ? (isEn ? 'Dine-In' : 'ဆိုင်ထိုင်စားမည်') : (isEn ? 'Takeaway' : 'ပါဆယ်ယူမည်')}</strong>
                        <p className="muted">
                          {diningType === 'dine_in'
                            ? (selectedTableObj ? `စားပွဲ: ${selectedTableObj.name}` : '⚠️ စားပွဲရွေးပါ')
                            : 'ပါဆယ်'}
                        </p>
                      </div>
                    </div>
                    <button className="btn ghost sm">ပြင်ဆင်</button>
                  </div>

                  {/* Customer Information Section */}
                  <div className="tray-customer-inputs">
                    <div className="input-group">
                      <label>ဖောက်သည် အမည် (Customer Name)</label>
                      <input
                        type="text"
                        placeholder="ဥပမာ - မောင်မောင်"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div className="input-group">
                      <label>ဖုန်းနံပါတ် (Phone Number)</label>
                      <input
                        type="tel"
                        placeholder="ဥပမာ - 09xxxxxxxxx"
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                      />
                    </div>
                    <div className="input-group full">
                      <label>အော်ဒါ အထွေထွေ မှတ်ချက် (General Kitchen Note)</label>
                      <input
                        type="text"
                        placeholder="ဥပမာ - အားလုံး အစပ်မထည့်ပါနှင့်…"
                        value={orderNote}
                        onChange={e => setOrderNote(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Tray Items List */}
                  <div className="tray-items-list">
                    <div className="tray-list-header">
                      <span>ရွေးချယ်ထားသော ဟင်းပွဲများ</span>
                      <button className="text-danger-btn" onClick={clearTray}>အားလုံးဖျက်မည်</button>
                    </div>

                    {tray.map((it, idx) => (
                      <div key={`${it.id}_${idx}`} className="tray-item-row">
                        <img
                          src={it.image || getFoodImage(it, catMap.get(it.category_id))}
                          alt={it.name}
                          className="tray-item-thumb"
                        />
                        <div className="tray-item-info">
                          <div className="tray-item-name">{it.name}</div>
                          {it.note && <div className="tray-item-note">✍️ {it.note}</div>}
                          <div className="tray-item-price">
                            {it.price.toLocaleString()} Ks × {it.qty} = <b>{(it.price * it.qty).toLocaleString()} Ks</b>
                          </div>
                        </div>

                        {/* Stepper */}
                        <div className="tray-item-stepper">
                          <button
                            className="tis-btn"
                            onClick={() => updateTrayQty(idx, -1)}
                            title="လျော့မည်"
                          >
                            -
                          </button>
                          <span className="tis-qty">{it.qty}</span>
                          <button
                            className="tis-btn"
                            onClick={() => updateTrayQty(idx, 1)}
                            title="တိုးမည်"
                          >
                            +
                          </button>
                          <button
                            className="tis-del-btn"
                            onClick={() => removeTrayItem(idx)}
                            title="ပယ်ဖျက်"
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
                      <span>ဟင်းပွဲ စုစုပေါင်း ({trayCount} ပွဲ)</span>
                      <strong>{traySubtotal.toLocaleString()} Ks</strong>
                    </div>
                    {Number(shop.tax_rate) > 0 && (
                      <div className="tbb-row muted">
                        <span>ကုန်သွယ်ခွန် ({shop.tax_rate}%)</span>
                        <span>{Math.round(traySubtotal * shop.tax_rate / 100).toLocaleString()} Ks</span>
                      </div>
                    )}
                    {Number(shop.service_rate) > 0 && (
                      <div className="tbb-row muted">
                        <span>ဝန်ဆောင်ခ ({shop.service_rate}%)</span>
                        <span>{Math.round(traySubtotal * shop.service_rate / 100).toLocaleString()} Ks</span>
                      </div>
                    )}
                    <div className="tbb-row total">
                      <span>ကျသင့်ငွေ စုစုပေါင်း</span>
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
                    'ပို့နေသည်…'
                  ) : (
                    <>
                      <Icon name="check" size={18} />
                      <span>{isEn ? `Place Order (${traySubtotal.toLocaleString()} Ks)` : `အော်ဒါတင်မည် (${traySubtotal.toLocaleString()} Ks)`}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table & Dining Mode Picker Modal (Rendered after Tray to overlay cleanly) */}
      {tableModalOpen && (
        <div className="modal-backdrop table-modal-layer" onClick={() => setTableModalOpen(false)}>
          <div className="modal-panel table-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>🍽️ {isEn ? 'Choose Dining Mode' : 'စားသုံးမည့်ပုံစံ ရွေးပါ'}</h3>
              <button className="icon-btn" onClick={() => setTableModalOpen(false)}>
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="dining-type-toggle">
              <button
                className={`dtt-btn ${diningType === 'dine_in' ? 'active' : ''}`}
                onClick={() => setDiningType('dine_in')}
              >
                <Icon name="table" size={18} />
                <div>
                  <strong>{isEn ? 'Dine-In' : 'ဆိုင်ထိုင်စားမည်'}</strong>
                  <small className="muted">စားပွဲနံပါတ် သတ်မှတ်၍ မှာယူမည်</small>
                </div>
              </button>
              <button
                className={`dtt-btn ${diningType === 'takeaway' ? 'active' : ''}`}
                onClick={() => {
                  setDiningType('takeaway');
                  setSelectedTableId('');
                }}
              >
                <Icon name="box" size={18} />
                <div>
                  <strong>ပါဆယ် ယူမည် (Takeaway)</strong>
                  <small className="muted">ထုပ်ပိုး၍ ယူဆောင်မည်</small>
                </div>
              </button>
            </div>

            {diningType === 'dine_in' && (
              <div className="table-grid-selection">
                <label className="section-title">ဆိုင်တွင်း စားပွဲများ (Tables)</label>
                <div className="tgs-grid">
                  {tables.map(t => {
                    const isSelected = String(selectedTableId) === String(t.id);
                    return (
                      <div
                        key={t.id}
                        className={`tgs-card ${isSelected ? 'selected' : ''} ${t.is_busy ? 'busy' : 'free'}`}
                        onClick={() => setSelectedTableId(String(t.id))}
                      >
                        <div className="tgs-table-name">{t.name}</div>
                        <div className="tgs-zone-seats">
                          <span>{t.zone || 'အပြင်'}</span> · <span>{t.seats || 4} ယောက်</span>
                        </div>
                        <span className={`tgs-status-dot ${t.is_busy ? 'busy' : 'free'}`}>
                          {t.is_busy ? 'လက်ရှိလူရှိ' : 'လွတ်'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 18 }}>
              <button
                className="btn success full"
                onClick={() => {
                  if (diningType === 'dine_in' && !selectedTableId) {
                    showToast('⚠️ စားပွဲတစ်ခုခုကို ရွေးပေးပါ');
                    return;
                  }
                  setTableModalOpen(false);
                  showToast('✓ စားသုံးမည့်ပုံစံ အတည်ပြုပြီးပါပြီ');
                }}
              >
                အတည်ပြုမည်
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="catalog-toast">{toast}</div>}
    </div>
  );
}
