import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, money, PAY_METHODS_FALLBACK } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty, stationLabel } from '../components/ui.jsx';
import Receipt from '../components/Receipt.jsx';
import { getFoodImage } from '../foodPresets.js';
import {
  getDraft, draftToOrder, addDraftItem, changeDraftQty, saveDraftItem,
  removeDraftItem, sendDraftKitchen, payDraft, removeDraft
} from '../offline.js';

const TINTS = ['#0e9f6e', '#f59e0b', '#5b5bd6', '#0d94d2', '#ef4444', '#8b5cf6'];
const PAY_FALLBACK = PAY_METHODS_FALLBACK;

export default function Order({ orderId, data, reload, showToast, onBack, openOrder, online = true, drafts = [], syncNow }) {
  const { t, isEn } = useI18n();
  const [order, setOrder] = useState(null);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [splitMode, setSplitMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const catsRef = useRef(null);

  const isLocal = String(orderId || '').startsWith('offline-');

  const loadOrder = async () => {
    if (isLocal) {
      const d = getDraft(orderId);
      if (d) setOrder(draftToOrder(d));
      else { showToast(t('အော့ဖ်လိုင်း order မတွေ့ပါ')); onBack(); }
      return;
    }
    try { setOrder(await api(`/orders/${orderId}`)); }
    catch (e) {
      if (e.offline || e.status === 401) return;
      showToast(e.message);
      onBack();
    }
  };

  useEffect(() => { loadOrder(); }, [orderId]);
  useEffect(() => {
    if (!isLocal) return;
    const d = drafts.find(x => x.key === orderId);
    if (d) setOrder(draftToOrder(d));
  }, [drafts, isLocal, orderId]);
  useEffect(() => { setSplitMode(false); setSelected([]); }, [orderId]);
  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setCartOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cartOpen]);
  useEffect(() => {
    const el = catsRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0 || e.shiftKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const atStart = el.scrollLeft <= 0 && step < 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && step > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += step;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [order]);
  useEffect(() => {
    const el = catsRef.current;
    if (!el) return;
    let down = false, moved = false, startX = 0, startLeft = 0, quietUntil = 0;
    const onDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      down = true;
      moved = false;
      startX = e.clientX;
      startLeft = el.scrollLeft;
    };
    const onMove = (e) => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (!moved) {
        if (Math.abs(dx) < 6) return;
        moved = true;
        el.classList.add('dragging');
      }
      e.preventDefault();
      el.scrollLeft = startLeft - dx;
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      el.classList.remove('dragging');
      if (moved) quietUntil = Date.now() + 260;
      moved = false;
    };
    const onClick = (e) => {
      if (Date.now() < quietUntil) { e.preventDefault(); e.stopPropagation(); }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onClick, true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [order]);
  useEffect(() => {
    if (isLocal) return;
    const timer = setInterval(loadOrder, 12000);
    return () => clearInterval(timer);
  }, [orderId, isLocal]);

  const settings = data.settings;
  const categories = data.categories;
  const saleItems = useMemo(() => (data.items || []).filter(i => i.available), [data.items]);
  const items = useMemo(() => saleItems.filter(i => (cat === 'all' || i.category_id === cat)
    && (!q || i.name.toLowerCase().includes(q.toLowerCase()))), [saleItems, cat, q]);
  const catCount = (id) => id === 'all'
    ? saleItems.length
    : saleItems.filter(i => i.category_id === id).length;

  const activeItems = order?.items?.filter(i => i.status !== 'cancelled') || [];
  const voidedItems = order?.items?.filter(i => i.status === 'cancelled') || [];
  const itemAmount = (it) => {
    const modSum = (it.modifiers || []).reduce((a, m) => a + m.price, 0);
    return Math.round((it.price + modSum) * it.qty);
  };
  const subtotal = activeItems.reduce((s, it) => s + itemAmount(it), 0);
  const selectedTotal = activeItems.filter(it => selected.includes(it.id)).reduce((s, it) => s + itemAmount(it), 0);

  const addItem = async (item) => {
    if (!order || order.status !== 'open') return;
    if (isLocal) {
      addDraftItem(orderId, item);
      showToast(`${item.name} ${t('ထည့်ပြီး')}`);
      return;
    }
    if (!online) return showToast(t('ချိတ်ဆက်မှု ပြန်ရမှ ဒီ order ကို ပြင်နိုင်မည်'));
    try {
      await api(`/orders/${orderId}/items`, { method: 'POST', body: JSON.stringify({ itemId: item.id, qty: 1 }) });
      await loadOrder();
      showToast(`${item.name} ${t('ထည့်ပြီး')}`);
    } catch (e) { showToast(e.message); }
  };

  const changeQty = async (it, delta) => {
    const qty = it.qty + delta;
    if (isLocal) {
      changeDraftQty(orderId, it.id, qty);
      return;
    }
    if (!online) return showToast(t('ချိတ်ဆက်မှု ပြန်ရမှ ဒီ order ကို ပြင်နိုင်မည်'));
    try {
      if (qty <= 0) {
        if (it.status === 'cooking' || it.status === 'served') {
          setEditItem({ ...it });
          showToast(t('မီးဖိုပို့ပြီး ဟင်းကို ပယ်ဖျက်ရန် အကြောင်းပြချက် ဖြည့်ပါ'));
          return;
        }
        await api(`/order-items/${it.id}`, { method: 'DELETE' });
      } else {
        await api(`/order-items/${it.id}`, { method: 'PATCH', body: JSON.stringify({ qty }) });
      }
      await loadOrder();
    } catch (e) { showToast(e.message); }
  };

  const saveItem = async () => {
    if (!editItem) return;
    if (isLocal) {
      saveDraftItem(orderId, editItem.id, { qty: Number(editItem.qty) || 1, note: editItem.note || '' });
      setEditItem(null);
      return;
    }
    if (!online) return showToast(t('ချိတ်ဆက်မှု ပြန်ရမှ ဒီ order ကို ပြင်နိုင်မည်'));
    try {
      await api(`/order-items/${editItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ qty: Number(editItem.qty) || 1, note: editItem.note || '' })
      });
      setEditItem(null);
      await loadOrder();
    } catch (e) { showToast(e.message); }
  };

  const removeItem = async () => {
    if (!editItem) return;
    if (isLocal) {
      removeDraftItem(orderId, editItem.id);
      setEditItem(null);
      return;
    }
    if (!online) return showToast(t('ချိတ်ဆက်မှု ပြန်ရမှ ဒီ order ကို ပြင်နိုင်မည်'));
    const sent = editItem.status === 'cooking' || editItem.status === 'served';
    const why = String(editItem.cancel_reason || '').trim();
    if (sent && !why) return showToast(t('ပယ်ဖျက်ရသည့် အကြောင်းပြချက် ထည့်ပါ'));
    try {
      if (sent) {
        await api(`/order-items/${editItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelled', reason: why })
        });
        showToast(t('ဟင်း ပယ်ဖျက်ပြီးပါပြီ'));
      } else {
        await api(`/order-items/${editItem.id}`, { method: 'DELETE' });
      }
      setEditItem(null);
      await loadOrder();
    } catch (e) { showToast(e.message); }
  };

  const sendKitchen = async () => {
    if (isLocal) {
      const sent = sendDraftKitchen(orderId);
      if (sent) showToast(t('မီးဖိုချောင်သို့ ပို့ပြီး — ချိတ်ဆက်ချိန် sync ဖြစ်မည်'));
      return;
    }
    if (!online) return showToast(t('ချိတ်ဆက်မှု ပြန်ရမှ မီးဖိုချောင်ပို့နိုင်မည်'));
    try {
      const r = await api(`/orders/${orderId}/send-kitchen`, { method: 'POST' });
      await loadOrder();
      if (r.warnings?.length) showToast(r.warnings.join(' · '));
      else showToast(t('မီးဖိုချောင်သို့ ပို့ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const voidOrder = () => {
    if (isLocal) {
      if (!window.confirm(t('ဒီ order ကို ပယ်ဖျက်မှာ သေချာပါသလား?'))) return;
      removeDraft(orderId);
      showToast(t('ဖျက်ပြီးပါပြီ'));
      onBack();
      return;
    }
    if (!online) return showToast(t('ချိတ်ဆက်မှု ပြန်ရမှ ပယ်ဖျက်နိုင်မည်'));
    setVoidReason('');
    setVoidOpen(true);
  };

  const confirmVoidOrder = async () => {
    const why = voidReason.trim();
    if (activeItems.length > 0 && !why) {
      return showToast(t('ဘီလ်ပယ်ဖျက်ရသည့် အကြောင်းပြချက် ထည့်ပါ'));
    }
    setBusyAction(true);
    try {
      await api(`/orders/${orderId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: why })
      });
      setVoidOpen(false);
      await reload();
      onBack();
    } catch (e) { showToast(e.message); }
    setBusyAction(false);
  };

  const toggleSel = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const splitBill = async () => {
    if (isLocal || !online) return showToast(t('အော့ဖ်လိုင်းမှာ ဘီလ်ခွဲလို့ မရပါ'));
    if (!selected.length) return showToast(t('ခွဲမည့် ဟင်း ရွေးပါ'));
    if (selected.length === activeItems.length) return showToast(t('အနည်းဆုံး တစ်ခု မူလဘီလ်တွင် ချန်ထားပါ'));
    try {
      const r = await api(`/orders/${orderId}/split`, { method: 'POST', body: JSON.stringify({ itemIds: selected }) });
      setSplitMode(false);
      setSelected([]);
      await reload();
      showToast(`${t('ဘီလ်ခွဲပြီး')} · #${r.order_no}`);
      openOrder?.(r.id);
    } catch (e) { showToast(e.message); }
  };

  const moveOrder = async (tb) => {
    if (busyAction || isLocal || !online) return;
    setBusyAction(true);
    try {
      await api(`/orders/${orderId}/move`, { method: 'POST', body: JSON.stringify({ tableId: tb.id }) });
      setMoveOpen(false);
      await reload();
      await loadOrder();
      showToast(`${tb.name} ${t('သို့ ရွှေ့ပြီးပါပြီ')}`);
    } catch (e) { showToast(e.message); }
    finally { setBusyAction(false); }
  };

  const mergeOrder = async (into) => {
    if (busyAction || isLocal || !online) return;
    if (!window.confirm(`${t('ဤဘီလ်ကို ရွေးထားသော ဘီလ်ထဲ ပေါင်းမှာ သေချာပါသလား?')}\n#${into.order_no} · ${money(into.total)}`)) return;
    setBusyAction(true);
    try {
      const r = await api(`/orders/${orderId}/merge`, { method: 'POST', body: JSON.stringify({ intoId: into.id }) });
      setMergeOpen(false);
      await reload();
      showToast(`${t('ဘီလ် ပေါင်းပြီးပါပြီ')} · #${r.order_no}`);
      openOrder?.(r.id);
    } catch (e) { showToast(e.message); }
    finally { setBusyAction(false); }
  };

  const paid = async (result) => {
    const o = await api(`/orders/${orderId}`);
    setOrder(o);
    setReceipt(o);
    setPayOpen(false);
    setCartOpen(false);
    await reload();
    showToast(`${t('ငွေရှင်းပြီးပါပြီ')} · ${money(result.total)}`);
  };

  const offlinePaid = (info) => {
    const d = payDraft(orderId, info);
    if (!d) return showToast(t('အော့ဖ်လိုင်း order မတွေ့ပါ'));
    const o = draftToOrder(d);
    setOrder(o);
    setReceipt(o);
    setPayOpen(false);
    setCartOpen(false);
    showToast(`${t('အော့ဖ်လိုင်း ငွေရှင်းပြီး')} · ${money(o.total)}`);
    reload?.();
    syncNow?.(true);
  };

  const printDirect = async () => {
    if (!receipt) return;
    if (isLocal || !online) return showToast(t('အော့ဖ်လိုင်းမှာ တိုက်ရိုက် ပရင့် မရပါ — ဘရောက်ဇာ ပရင့် သုံးပါ'));
    try {
      await api(`/print/receipt/${receipt.id}`, { method: 'POST' });
      showToast(t('ပရင့် ပို့ပြီးပါပြီ'));
    } catch (e) {
      showToast(`${t('ပရင့် မအောင်မြင်ပါ')} — ${e.message}`);
    }
  };

  const closeReceipt = () => {
    setReceipt(null);
    if (order?.status !== 'open') onBack();
  };

  const openCheckBill = () => {
    if (!order || !activeItems.length) return;
    const taxRate = Number(settings.tax_rate || 0);
    const serviceRate = Number(settings.service_rate || 0);
    const tax = Math.round(subtotal * taxRate / 100);
    const service = Math.round(subtotal * serviceRate / 100);
    setReceipt({
      ...order,
      items: activeItems,
      subtotal,
      discount: 0,
      tax,
      service,
      total: subtotal + tax + service,
      payments: []
    });
  };

  const catTint = (categoryId) => {
    const idx = categories.findIndex(c => c.id === categoryId);
    return TINTS[(idx < 0 ? 0 : idx) % TINTS.length];
  };

  if (!order) return <div className="loading">{t('Order ရယူနေသည်…')}</div>;

  const isOpen = order.status === 'open';
  const title = order.type === 'dine_in'
    ? (data.tables.find(tb => tb.id === order.table_id)?.name || t('စားပွဲ'))
    : order.type === 'delivery' ? t('ပို့ဆောင်') : t('ပါဆယ်');

  return (
    <div className="order-screen">
      <div className="menu-pane">
        <div className="menu-tools">
          <div className="pos-tools">
            <div className="pos-tools-top">
              <div className="search">
                <Icon name="search" size={18} />
                <input placeholder={t('ဟင်း ရှာရန်…')} value={q} onChange={e => setQ(e.target.value)}
                  aria-label={t('ဟင်း ရှာရန်…')} />
                {q ? (
                  <button className="search-clear" onClick={() => setQ('')} aria-label={t('ဖျက်')} title={t('ဖျက်')}>
                    <Icon name="close" size={14} />
                  </button>
                ) : null}
              </div>
              <span className={`pos-count ${q ? 'on' : ''}`}>
                <strong>{items.length}</strong>
                <span>{t('မျိုး')}</span>
              </span>
            </div>
            <div className="pos-cats" ref={catsRef} role="group" aria-label={t('အမျိုးအစား')}>
              <button aria-pressed={cat === 'all'} className={`pos-chip ${cat === 'all' ? 'on' : ''}`}
                onClick={() => setCat('all')}>
                <span className="pos-chip-dot" />
                <span className="pos-chip-name">{t('အားလုံး')}</span>
                <span className="pos-chip-n">{saleItems.length}</span>
              </button>
              {categories.map(c => {
                const n = catCount(c.id);
                return (
                  <button key={c.id} aria-pressed={cat === c.id}
                    className={`pos-chip ${cat === c.id ? 'on' : ''} ${n === 0 ? 'is-empty' : ''}`}
                    style={{ '--dot': catTint(c.id) }} onClick={() => setCat(c.id)}>
                    <span className="pos-chip-dot" />
                    <span className="pos-chip-name">{t(c.name)}</span>
                    <span className="pos-chip-n">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="item-grid">
          {items.map(i => {
            const catObj = categories.find(c => c.id === i.category_id);
            const imgUrl = getFoodImage(i, catObj?.name);
            return (
              <button key={i.id} className={`item-card ${i.is_alcohol ? 'alc' : ''} has-img`}
                style={{ '--tint': i.is_alcohol ? '#ef4444' : catTint(i.category_id) }}
                onClick={() => addItem(i)} disabled={!isOpen} title={i.name}
                aria-label={`${i.name} · ${money(i.price)}`}>
                <div className="item-card-media">
                  <img src={imgUrl} alt="" className="item-card-img" loading="lazy" />
                  {i.is_alcohol ? <span className="alc-flag">18+</span> : null}
                  {i.code ? <span className="item-code-badge">{i.code}</span> : null}
                </div>
                <div className="item-card-content">
                  <span className="item-name">{t(i.name)}</span>
                  <span className="item-price">{money(i.price)}</span>
                </div>
                <span className="item-add"><Icon name="plus" size={14} /></span>
              </button>
            );
          })}
          {items.length === 0 && (
            <div className="empty span-all pos-empty">
              <Icon name="search" size={22} />
              <span>{t('ဟင်း မတွေ့ပါ')}</span>
              {(q || cat !== 'all') && (
                <button className="link-btn" onClick={() => { setQ(''); setCat('all'); }}>
                  {t('ရှာဖွေမှု အားလုံး ရှင်းလင်းမည်')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <aside className={`cart-pane ${cartOpen ? 'open' : ''}`}>
        <div className="cart-sheet-handle mobile-only" onClick={() => setCartOpen(false)}><span /></div>
        <div className="cart-head">
          <div>
            <div className="cart-title-row">
              <h3>{title}</h3>
              <span className="cart-count-pill">{activeItems.length} {t('မျိုး')}</span>
            </div>
            <div className="order-tag">
              #{order.order_no} · {t('ထိုင်ခုံ')} {order.guests}
              {isLocal && (
                <span className={`tag ${online ? 'local' : 'offline'}`}>
                  {online ? t('local') : t('အော့ဖ်လိုင်း')}
                </span>
              )}
            </div>
          </div>
          <button className="icon-btn mobile-only" onClick={() => setCartOpen(false)} aria-label={t('ပိတ်')}><Icon name="close" size={18} /></button>
        </div>

        {isLocal && (
          <div className="offline-note" style={{ margin: '10px 14px 0' }}>
            <Icon name="wifi" size={14} />
            {online ? t('local order — sync မလုပ်ရသေးပါ') : t('အော့ဖ်လိုင်း — ငွေရှင်းပြီး sync စောင့်ထားမည်')}
          </div>
        )}

        <div className="cart-items">
          {activeItems.length === 0 ? (
            <div className="cart-empty">
              <span className="cart-empty-ico"><Icon name="cart" size={26} /></span>
              <strong>{t('ပစ္စည်း ရွေးချယ်ပါ')}</strong>
              <span className="cart-empty-hint">{t('ဟင်းလျာကို နှိပ်ပြီး ဘီလ်ထဲ ထည့်ပါ')}</span>
            </div>
          ) : activeItems.map(it => (
            <div key={it.id} className="cart-item">
              {splitMode && (
                <input type="checkbox" className="split-check" checked={selected.includes(it.id)}
                  onChange={() => toggleSel(it.id)} aria-label={t('ခွဲရန် ရွေး')} />
              )}
              <div className="ci-main">
                <div className="ci-top">
                  <span className="ci-name">{t(it.name)}</span>
                  <span className="ci-amount">{money(itemAmount(it))}</span>
                </div>
                {(it.is_alcohol || it.status === 'cooking' || it.status === 'served') && (
                  <div className="ci-tags">
                    {it.is_alcohol ? <span className="tag alc">18+</span> : null}
                    {it.status === 'cooking' ? <span className="tag">{stationLabel(data?.stations, it.station, isEn)}</span> : null}
                    {it.status === 'served' ? <span className="tag ok">{t('ကျွေးပြီး')}</span> : null}
                  </div>
                )}
                <div className="ci-sub">
                  <span className="ci-price">{money(it.price)}</span>
                  <div className="qty-stepper">
                    <button className="qty-btn" onClick={() => changeQty(it, -0.5)}
                      aria-label={t('အရေအတွက် လျှော့')} title={t('အရေအတွက် လျှော့')}>−</button>
                    <span className="qty">{it.qty}</span>
                    <button className="qty-btn" onClick={() => changeQty(it, 0.5)}
                      aria-label={t('အရေအတွက် တိုး')} title={t('အရေအတွက် တိုး')}>+</button>
                  </div>
                  <button className="link-btn ci-note-btn" onClick={() => setEditItem({ ...it })}>
                    <Icon name="edit" size={13} /> {t('မှတ်ချက်')}
                  </button>
                </div>
                {it.note && <div className="ci-note">{it.note}</div>}
              </div>
            </div>
          ))}
        </div>

        {voidedItems.length > 0 && (
          <div className="cart-voided">
            <div className="cv-head"><Icon name="close" size={13} /> {t('ပယ်ဖျက်ပြီး')} · {voidedItems.length}</div>
            {voidedItems.map(it => (
              <div className="cv-row" key={it.id}>
                <span>{it.name} × {it.qty}</span>
                {it.cancel_reason && <small>{it.cancel_reason}</small>}
              </div>
            ))}
          </div>
        )}

        <div className="cart-foot">
          <div className="cart-total-line">
            <span>{splitMode ? t('ခွဲမည့် ပစ္စည်း') : t('စုစုပေါင်း')}</span>
            <strong>{money(splitMode ? selectedTotal : subtotal)}</strong>
          </div>
          {splitMode ? (
            <div className="cart-actions">
              <button className="btn ghost" onClick={() => { setSplitMode(false); setSelected([]); }}>{t('မလုပ်တော့')}</button>
              <button className="btn" disabled={!selected.length} onClick={splitBill}>{t('ဘီလ်ခွဲမည်')}</button>
            </div>
          ) : (
            <>
              <div className="cart-actions">
                <button className="btn ghost" onClick={sendKitchen} disabled={!isOpen || !activeItems.length}>
                  <Icon name="fire" size={17} /> {t('မီးဖိုချောင်ပို့')}
                </button>
                <button className="btn" data-action="pay" onClick={() => setPayOpen(true)}
                  disabled={!isOpen || !activeItems.length || (!online && !isLocal)}
                  title={!online && !isLocal ? t('ချိတ်ဆက်မှု ပြန်ရမှ ငွေရှင်းနိုင်မည်') : undefined}>
                  <Icon name="cash" size={17} /> {t('ငွေရှင်း')}
                </button>
              </div>
              <div className="cart-actions cart-actions-grid">
                <button className="btn ghost sm" onClick={openCheckBill} disabled={!activeItems.length}>
                  <Icon name="receipt" size={15} /> {t('ဘေလ်စစ်မည်')}
                </button>
                <button className="btn danger sm" onClick={voidOrder} disabled={!isOpen}>{t('ပယ်ဖျက်')}</button>
                <button className="btn ghost sm" onClick={() => setSplitMode(true)} disabled={!isOpen || activeItems.length < 2 || isLocal || !online}>{t('ဘီလ်ခွဲ')}</button>
                {order.type === 'dine_in' && (
                  <button className="btn ghost sm" onClick={() => setMoveOpen(true)} disabled={!isOpen || isLocal || !online}>
                    <Icon name="table" size={15} /> {t('စားပွဲရွှေ့')}
                  </button>
                )}
                <button className="btn ghost sm" onClick={() => setMergeOpen(true)}
                  disabled={!isOpen || isLocal || !online || !(data.openOrders || []).some(o => o.id !== order.id)}>
                  <Icon name="plus" size={15} /> {t('ဘီလ်ပေါင်း')}
                </button>
                <button className="btn ghost sm" onClick={onBack}>{t('နောက်သို့')}</button>
              </div>
            </>
          )}
        </div>
      </aside>

      <button className="cart-fab mobile-only" onClick={() => setCartOpen(true)}
        aria-label={`${t('ဟင်းလျာ')} · ${activeItems.length} ${t('မျိုး')}`}>
        <span className="fab-left">
          <span className="fab-ico"><Icon name="cart" size={18} /></span>
          <span className="fab-label">{activeItems.length} {t('မျိုး')}</span>
        </span>
        <span className="fab-right">
          {money(subtotal)}
          <Icon name="chevronRight" size={17} />
        </span>
      </button>

      {editItem && (
        <Modal title={t('ပစ္စည်း ပြင်ဆင်')} onClose={() => setEditItem(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setEditItem(null)}>{t('မလုပ်တော့')}</button>
            <button className="btn" onClick={saveItem}>{t('သိမ်းမည်')}</button>
          </>}>
          <Field label={t('အရေအတွက်')}>
            <input type="number" step="0.5" min="0" value={editItem.qty}
              onChange={e => setEditItem({ ...editItem, qty: e.target.value })} />
          </Field>
          <Field label={t('မှတ်ချက်')} hint={t('ဥပမာ — အစပ်လျှော့၊ ဆီမပါ')}>
            <input value={editItem.note || ''} onChange={e => setEditItem({ ...editItem, note: e.target.value })} />
          </Field>
          {(editItem.status === 'cooking' || editItem.status === 'served') && (
            <Field label={t('ပယ်ဖျက်ရသည့် အကြောင်းပြချက်')} hint={t('မီးဖိုပို့ပြီး ဟင်းကို ပယ်ဖျက်ရန် မဖြစ်မနေ ဖြည့်ပါ')}>
              <input value={editItem.cancel_reason || ''} onChange={e => setEditItem({ ...editItem, cancel_reason: e.target.value })} />
              <div className="chips" style={{ marginTop: 8 }}>
                {['ဧည့်သည် မစားတော့ပါ', 'မှားရိုက်မိသည်', 'ဟင်းကုန်သွားသည်', 'ကြာလွန်း၍ ဖျက်သည်'].map(r => (
                  <button key={r} type="button" className="chip"
                    onClick={() => setEditItem({ ...editItem, cancel_reason: t(r) })}>{t(r)}</button>
                ))}
              </div>
            </Field>
          )}
          <button className="btn danger sm" onClick={removeItem}>
            <Icon name="trash" size={16} /> {editItem.status === 'cooking' || editItem.status === 'served' ? t('ဟင်းပယ်ဖျက်မည်') : t('ဖျက်မည်')}
          </button>
        </Modal>
      )}

      {voidOpen && (
        <Modal title={t('ဘီလ်တစ်ခုလုံး ပယ်ဖျက်မည်')} onClose={() => setVoidOpen(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setVoidOpen(false)}>{t('မလုပ်တော့')}</button>
            <button className="btn danger" disabled={busyAction || (activeItems.length > 0 && !voidReason.trim())} onClick={confirmVoidOrder}>
              <Icon name="trash" size={15} /> {t('ပယ်ဖျက်မည်')}
            </button>
          </>}>
          <p className="hint mt-0">
            #{order.order_no} · {title} · <strong>{money(subtotal)}</strong>
          </p>
          <Field label={t('ပယ်ဖျက်ရသည့် အကြောင်းပြချက်')} hint={t('စစ်ဆေးရေး မှတ်တမ်းအတွက် မဖြစ်မနေ ဖြည့်ပါ')}>
            <input value={voidReason} onChange={e => setVoidReason(e.target.value)}
              placeholder={t('ဥပမာ — ဧည့်သည် ပြန်ထွက်သွားသည်')} autoFocus />
            <div className="chips" style={{ marginTop: 8 }}>
              {['ဧည့်သည် ပြန်ထွက်သွားသည်', 'မှားရိုက်မိသည်', 'ဟင်းကုန်သွားသည်', 'စားပွဲပြောင်း/ပေါင်း'].map(r => (
                <button key={r} type="button" className="chip"
                  onClick={() => setVoidReason(t(r))}>{t(r)}</button>
              ))}
            </div>
          </Field>
        </Modal>
      )}

      {moveOpen && (
        <Modal title={t('စားပွဲရွှေ့မည်')} onClose={() => setMoveOpen(false)}
          footer={<button className="btn ghost" onClick={() => setMoveOpen(false)}>{t('မလုပ်တော့')}</button>}>
          <p className="hint mt-0">{t('ဤဘီလ်ကို ရွှေ့မည့် လွတ်နေသော စားပွဲကို ရွေးပါ')}</p>
          <div className="list">
            {data.tables.filter(tb => !tb.order_id && !drafts.some(d => d.status === 'open' && d.table_id === tb.id)).map(tb => (
              <button key={tb.id} className="list-row" disabled={busyAction} onClick={() => moveOrder(tb)}>
                <span className="quick-ico sm"><Icon name="table" size={17} /></span>
                <div className="grow">
                  <strong>{tb.name}</strong>
                  <small className="muted">{tb.zone} · {tb.seats} {t('ထိုင်ခုံ')}</small>
                </div>
                <Icon name="arrow" size={16} />
              </button>
            ))}
            {!data.tables.some(tb => !tb.order_id) && <Empty text={t('လွတ်နေသော စားပွဲ မရှိပါ')} />}
          </div>
        </Modal>
      )}

      {mergeOpen && (
        <Modal title={t('ဘီလ်ပေါင်းမည်')} onClose={() => setMergeOpen(false)}
          footer={<button className="btn ghost" onClick={() => setMergeOpen(false)}>{t('မလုပ်တော့')}</button>}>
          <p className="hint mt-0">{t('ဤဘီလ်၏ ပစ္စည်းများကို ရွေးထားသော ဘီလ်ထဲ ပေါင်းထည့်မည်')}</p>
          <div className="list">
            {(data.openOrders || []).filter(o => o.id !== order.id).map(o => (
              <button key={o.id} className="list-row" disabled={busyAction} onClick={() => mergeOrder(o)}>
                <span className="quick-ico sm"><Icon name="receipt" size={17} /></span>
                <div className="grow">
                  <strong>#{o.order_no}</strong>
                  <small className="muted">
                    {o.type === 'dine_in' ? (o.table_name || t('စားပွဲ')) : o.type === 'delivery' ? t('ပို့ဆောင်') : t('ပါဆယ်')}
                    {' · '}{o.item_count} {t('မျိုး')}
                  </small>
                </div>
                <span className="amount">{money(o.total)}</span>
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {payOpen && (
        <PayModal order={order} subtotal={subtotal} shiftOpen={!!data.shift}
          settings={isLocal ? { ...settings, ...(order.settings || {}) } : settings}
          customers={data.customers} promotions={data.promotions || []}
          offline={isLocal} onOffline={offlinePaid}
          onClose={() => setPayOpen(false)} onPaid={paid} />
      )}

      {receipt && (
        <Modal title={receipt.status === 'open' ? t('ကြိုတင်ဘေလ် (Check Bill)') : t('ဘောက်ချာ')} wide onClose={closeReceipt}
          footer={<>
            <button className="btn ghost" onClick={closeReceipt}>{t('ပိတ်')}</button>
            <button className="btn ghost" onClick={() => window.print()}><Icon name="print" size={16} /> {t('ပရင့်ထုတ်')}</button>
            {settings.printer_mode !== 'browser' && !isLocal && online && (
              <button className="btn ghost" onClick={printDirect}><Icon name="print" size={16} /> {t('တိုက်ရိုက် ပရင့်')}</button>
            )}
            {receipt.status === 'open' && isOpen && (online || isLocal) && (
              <button className="btn" onClick={() => { setReceipt(null); setPayOpen(true); }}>
                <Icon name="cash" size={16} /> {t('ငွေရှင်းမည်')}
              </button>
            )}
          </>}>
          <Receipt order={receipt} settings={settings} tableName={title} />
        </Modal>
      )}
    </div>
  );
}

function PayModal({ order, subtotal, settings, customers = [], promotions = [], offline = false, shiftOpen = true, onOffline, onClose, onPaid }) {
  const { t } = useI18n();
  const taxRate = Number(settings.tax_rate || 0);
  const serviceRate = Number(settings.service_rate || 0);
  const baseTotal = subtotal + Math.round(subtotal * taxRate / 100) + Math.round(subtotal * serviceRate / 100);
  const [discount, setDiscount] = useState(0);
  const [promotionId, setPromotionId] = useState('');
  const [rows, setRows] = useState([{ method: 'cash', amount: String(baseTotal) }]);
  const [methods, setMethods] = useState(PAY_FALLBACK);
  const [customerId, setCustomerId] = useState(order.customer_id || '');
  const [pointsUsed, setPointsUsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/payment-methods')
      .then(list => {
        if (Array.isArray(list) && list.length) setMethods(list.map(m => ({ code: m.code, name: m.name })));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    setRows(rs => {
      if (rs.every(r => methods.some(m => m.code === r.method))) return rs;
      return rs.map(r => methods.some(m => m.code === r.method) ? r : { ...r, method: methods[0].code });
    });
  }, [methods]);

  const amountOf = (r) => Math.round(Number(r.amount) || 0);
  const disc = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const taxable = subtotal - disc;
  const tax = Math.round(taxable * taxRate / 100);
  const service = Math.round(taxable * serviceRate / 100);
  const grossTotal = taxable + tax + service;
  const pointValue = Math.max(0, Math.round(Number(settings.point_value ?? 1)));
  const customer = customers.find(c => String(c.id) === String(customerId));
  const maxPoints = customer && pointValue > 0
    ? Math.max(0, Math.min(Number(customer.points || 0), Math.floor(grossTotal / pointValue)))
    : 0;
  const usedPoints = Math.min(Math.max(0, Math.round(Number(pointsUsed) || 0)), maxPoints);
  const pointsAmount = usedPoints * pointValue;
  const total = grossTotal - pointsAmount;
  const paidSum = rows.reduce((s, r) => s + amountOf(r), 0);
  const remaining = Math.max(0, total - paidSum);
  const hasCash = rows.some(r => r.method === 'cash' && amountOf(r) > 0);
  const change = hasCash ? Math.max(0, paidSum - total) : 0;
  const creditAmount = rows.filter(r => r.method === 'credit').reduce((s, r) => s + amountOf(r), 0);
  const hasCredit = creditAmount > 0;

  const nowHM = new Date().toTimeString().slice(0, 5);
  const usable = useMemo(() => promotions.filter(p => {
    if (!p.active) return false;
    if (subtotal < Number(p.min_subtotal || 0)) return false;
    if (p.start_time && nowHM < p.start_time) return false;
    if (p.end_time && nowHM > p.end_time) return false;
    return true;
  }), [promotions, subtotal, nowHM]);

  const promoValue = (p) => p.type === 'percent'
    ? Math.round(subtotal * Number(p.value || 0) / 100)
    : Number(p.value || 0);

  useEffect(() => {
    setPointsUsed(p => Math.min(Math.max(0, Math.round(Number(p) || 0)), maxPoints));
  }, [maxPoints]);
  useEffect(() => {
    setRows(rs => {
      if (rs.length !== 1 || rs[0].method !== 'cash') return rs;
      const v = String(total);
      return rs[0].amount === v ? rs : [{ ...rs[0], amount: v }];
    });
  }, [total]);
  useEffect(() => { setPointsUsed(0); }, [customerId]);

  const applyPromo = (p) => {
    if (promotionId === p.id) {
      setPromotionId('');
      setDiscount(0);
      return;
    }
    setPromotionId(p.id);
    setDiscount(Math.min(subtotal, promoValue(p)));
  };

  const changeDiscount = (v) => {
    setDiscount(v);
    setPromotionId('');
  };

  const setRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, {
    method: methods[0]?.code || 'cash',
    amount: String(Math.max(0, total - rs.reduce((s, r) => s + amountOf(r), 0)))
  }]);
  const removeRow = (i) => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs);
  const fillRow = (i) => setRows(rs => {
    const others = rs.reduce((s, r, idx) => idx === i ? s : s + amountOf(r), 0);
    return rs.map((r, idx) => idx === i ? { ...r, amount: String(Math.max(0, total - others)) } : r);
  });

  const submit = async () => {
    if (!paidSum) {
      setErr(t('ငွေပမာဏ ထည့်ပါ'));
      return;
    }
    if (paidSum < total) {
      setErr(t('လက်ခံငွေ မလုံလောက်ပါ'));
      return;
    }
    if (hasCredit && !customerId) {
      setErr(t('အကြွေးအတွက် အဖွဲ့ဝင် ရွေးပါ'));
      return;
    }
    if (creditAmount > total) {
      setErr(t('အကြွေးပမာဏ မမှန်ပါ'));
      return;
    }
    const payments = rows
      .map(r => ({ method: r.method, amount: amountOf(r) }))
      .filter(p => p.amount > 0);
    if (offline) {
      onOffline?.({
        discount: disc,
        promotionId: promotionId || null,
        customerId: customerId || null,
        payments
      });
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const result = await api(`/orders/${order.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          discount: disc,
          promotionId: promotionId || null,
          customerId: customerId || null,
          pointsUsed: usedPoints,
          payments
        })
      });
      await onPaid(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const selectedPromo = usable.find(p => p.id === promotionId);

  return (
    <Modal title={t('ငွေရှင်း')} onClose={onClose} footer={<>
      <button className="btn ghost" onClick={onClose}>{t('မလုပ်တော့')}</button>
      <button className="btn" disabled={busy || (!offline && !shiftOpen)} onClick={submit}>{t('ငွေရှင်းမည်')} · {money(total)}</button>
    </>}>
      {!offline && !shiftOpen && (
        <div className="offline-note mt-0 shift-warn">
          <Icon name="clock" size={15} />
          {t('ဆိုင်မဖွင့်ရသေးပါ — ငွေရှင်းမီ ဆိုင်ဖွင့်ပါ')}
        </div>
      )}
      {offline && (
        <div className="offline-note mt-0">
          <Icon name="wifi" size={15} />
          {t('အော့ဖ်လိုင်း ငွေရှင်း — ချိတ်ဆက်ချိန် အလိုအလျောက် sync ဖြစ်မည်')}
        </div>
      )}
      <div className="pay-summary">
        <div className="row between"><span>{t('စုစုပေါင်း')}</span><span>{money(subtotal)}</span></div>
        <div className="row between">
          <span>{t('လျော့ငွေ')}</span>
          <div className="inline">
            <input type="number" min="0" value={discount} onChange={e => changeDiscount(e.target.value)} style={{ width: 110 }} />
            {[5, 10].map(p => (
              <button key={p} className={`chip ${promotionId ? '' : ''}`} onClick={() => changeDiscount(Math.round(subtotal * p / 100))}>{p}%</button>
            ))}
          </div>
        </div>
        {tax > 0 && <div className="row between"><span>{t('အခွန်')} ({taxRate}%)</span><span>{money(tax)}</span></div>}
        {service > 0 && <div className="row between"><span>{t('ဝန်ဆောင်ခ')} ({serviceRate}%)</span><span>{money(service)}</span></div>}
        {pointsAmount > 0 && <div className="row between"><span>{t('အမှတ် အသုံးပြု')} ({usedPoints})</span><span>-{money(pointsAmount)}</span></div>}
        <div className="row between total"><span>{t('ကျသင့်ငွေ')}</span><strong>{money(total)}</strong></div>
      </div>

      {usable.length > 0 && (
        <div>
          <div className="section-title mb-8"><Icon name="tag" size={15} /> {t('ပရိုမိုးရှင်း')}</div>
          <div className="pay-promos">
            {usable.map(p => (
              <button key={p.id} className={`promo-chip ${promotionId === p.id ? 'on' : ''}`} onClick={() => applyPromo(p)}>
                <Icon name="spark" size={14} />
                <span>{t(p.name)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedPromo && (
        <div className="row between small muted">
          <span>{selectedPromo.name}</span>
          <span>-{money(promoValue(selectedPromo))}</span>
        </div>
      )}

      <div className="pay-rows">
        {rows.map((r, i) => (
          <div className="pay-row" key={i}>
            <select value={r.method} onChange={e => setRow(i, { method: e.target.value })}>
              {methods.map(m => <option key={m.code} value={m.code}>{t(m.name)}</option>)}
            </select>
            <input type="number" min="0" inputMode="numeric" value={r.amount}
              onChange={e => setRow(i, { amount: e.target.value })} placeholder={t('ပမာဏ')} />
            <button type="button" className="link-btn" onClick={() => fillRow(i)}>{t('ကျန်ကို ဖြည့်')}</button>
            {rows.length > 1 && (
              <button type="button" className="icon-btn act-delete" onClick={() => removeRow(i)} aria-label={t('ဖျက်')}>
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="btn ghost sm" onClick={addRow}>
        <Icon name="plus" size={15} /> {t('ငွေပေးချေမှု ထပ်ထည့်')}
      </button>

      {(() => {
        const cashIdx = rows.findIndex(r => r.method === 'cash');
        if (cashIdx === -1) return null;
        const otherSum = rows.reduce((s, r, idx) => idx === cashIdx ? s : s + amountOf(r), 0);
        const cashDue = Math.max(0, total - otherSum);
        const currentCash = amountOf(rows[cashIdx]);
        const presets = [
          cashDue,
          Math.ceil(cashDue / 1000) * 1000,
          Math.ceil(cashDue / 5000) * 5000,
          Math.ceil(cashDue / 10000) * 10000,
          20000,
          50000,
          100000
        ].filter((v, i, arr) => v >= cashDue && v > 0 && v <= Math.max(cashDue * 4, 100000) && arr.indexOf(v) === i)
          .sort((a, b) => a - b)
          .slice(0, 6);
        const addNotes = [1000, 5000, 10000, 20000, 50000];
        return (
          <div className="stack" style={{ gap: 8 }}>
            {presets.length > 0 && (
              <div className="chips">
                {presets.map(v => (
                  <button
                    key={v}
                    type="button"
                    className={`chip ${currentCash === v ? 'on' : ''}`}
                    onClick={() => setRow(cashIdx, { amount: String(v) })}
                  >
                    {v === cashDue ? `${t('အတိအကျ')} · ${money(v)}` : money(v)}
                  </button>
                ))}
              </div>
            )}
            <div className="chips">
              {addNotes.map(n => (
                <button
                  key={`add-${n}`}
                  type="button"
                  className="chip add"
                  onClick={() => setRow(cashIdx, { amount: String(currentCash + n) })}
                >
                  +{Number(n).toLocaleString()}
                </button>
              ))}
              <button
                type="button"
                className="chip"
                onClick={() => setRow(cashIdx, { amount: '0' })}
                title={t('သုညပြန်ထား')}
              >
                0
              </button>
            </div>
          </div>
        );
      })()}

      <div className="pay-tally">
        <div className="row between"><span>{t('ကျန်ငွေ')}</span><strong>{money(remaining)}</strong></div>
        {change > 0 && <div className="row between"><span>{t('ပြန်အမ်းငွေ')}</span><strong>{money(change)}</strong></div>}
      </div>

      {customers.length > 0 && (
        <Field label={t('အသင်းဝင် (မလိုအပ်ပါ)')}>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">{t('— ရွေးချယ်ပါ —')}</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>
            ))}
          </select>
        </Field>
      )}
      {!offline && customer && Number(customer.points || 0) > 0 && pointValue > 0 && (
        <Field
          label={`${t('အမှတ် အသုံးပြုမည်')} · ${t('လက်ကျန်')} ${Number(customer.points).toLocaleString()}`}
          hint={`1 ${t('အမှတ်')} = ${money(pointValue)} · ${t('အများဆုံး')} ${maxPoints}`}
        >
          <input type="number" min="0" max={maxPoints} value={pointsUsed}
            onChange={e => setPointsUsed(e.target.value)} />
        </Field>
      )}

      {err && <div className="error-text">{err}</div>}
    </Modal>
  );
}
