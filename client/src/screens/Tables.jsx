import React, { useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';
import { createDraft } from '../offline.js';

function nextHour() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Tables({ data, openOrder, reload, showToast, staff, online = true, drafts = [], syncNow }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const [billsFor, setBillsFor] = useState(null);
  const [resOpen, setResOpen] = useState(false);
  const [resForm, setResForm] = useState({ customer_name: '', phone: '', party_size: 2, table_id: '', reserved_at: nextHour(), note: '' });

  const zones = [...new Set(data.tables.map(tb => tb.zone || 'အခြား'))];
  const reservations = data.reservations || [];
  const openValue = (data.openOrders || []).reduce((s, o) => s + (o.total || 0), 0);
  const openDrafts = drafts.filter(d => d.status === 'open');
  const hasLocal = (tb) => openDrafts.some(d => d.table_id === tb.id);
  const busyTables = data.tables.filter(tb => tb.order_id || hasLocal(tb)).length;
  const freeTables = data.tables.length - busyTables;

  const openTable = async (tb) => {
    if (busy) return;
    const local = drafts.filter(d => d.table_id === tb.id && d.status === 'open').slice(-1)[0];
    if (local) return openOrder(local.key);
    if (tb.order_id) {
      if (!online) {
        const d = createDraft({ type: 'dine_in', tableId: tb.id, guests: tb.guests || 2, staff, data });
        openOrder(d.key);
        showToast(t('အော့ဖ်လိုင်း ဘီလ်အသစ် ဖွင့်ထားသည် — ချိတ်ဆက်ချိန် sync ဖြစ်မည်'));
        return;
      }
      const bills = data.openOrders.filter(o => o.table_id === tb.id);
      if (bills.length > 1) {
        setBillsFor({ table: tb, bills });
        return;
      }
      return openOrder(tb.order_id);
    }
    if (!online) {
      const d = createDraft({ type: 'dine_in', tableId: tb.id, guests: tb.seats ? Math.min(tb.seats, 4) : 2, staff, data });
      openOrder(d.key);
      return;
    }
    setBusy(true);
    try {
      const r = await api('/orders', { method: 'POST', body: JSON.stringify({ type: 'dine_in', tableId: tb.id }) });
      await reload();
      openOrder(r.id);
    } catch (e) {
      if (e.offline) {
        const d = createDraft({ type: 'dine_in', tableId: tb.id, guests: tb.seats ? Math.min(tb.seats, 4) : 2, staff, data });
        openOrder(d.key);
        showToast(t('အော့ဖ်လိုင်း — order ကို device မှာ သိမ်းထားသည်'));
      } else showToast(e.message);
    }
    setBusy(false);
  };

  const newOrder = async (type) => {
    if (busy) return;
    if (!online) {
      const d = createDraft({ type, staff, data });
      openOrder(d.key);
      return;
    }
    setBusy(true);
    try {
      const r = await api('/orders', { method: 'POST', body: JSON.stringify({ type }) });
      await reload();
      openOrder(r.id);
    } catch (e) {
      if (e.offline) {
        const d = createDraft({ type, staff, data });
        openOrder(d.key);
        showToast(t('အော့ဖ်လိုင်း — order ကို device မှာ သိမ်းထားသည်'));
      } else showToast(e.message);
    }
    setBusy(false);
  };

  const takeawayOrders = data.openOrders.filter(o => o.type !== 'dine_in');

  const onlineOrders = (data.openOrders || [])
    .filter(o => o.source === 'online')
    .sort((a, b) => (a.confirmed_at ? 1 : 0) - (b.confirmed_at ? 1 : 0) || a.id - b.id);
  const pendingOnline = onlineOrders.filter(o => !o.confirmed_at);

  const confirmOnline = async (o) => {
    setConfirmingId(o.id);
    try {
      const r = await api(`/orders/${o.id}/confirm`, { method: 'POST' });
      await reload();
      showToast(r.warnings?.length
        ? `${t('အော်ဒါ အတည်ပြုပြီး')} · ${r.warnings.length} ${t('လက်ကျန် သတိပေးချက်')}`
        : t('အော်ဒါ အတည်ပြုပြီး မီးဖိုချောင်သို့ ပို့ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
    setConfirmingId(null);
  };

  const declineOnline = async (o) => {
    if (!window.confirm(t('ဤအွန်လိုင်းအော်ဒါကို ပယ်ဖျက်မှာ သေချာပါသလား?'))) return;
    try {
      await api(`/orders/${o.id}/void`, { method: 'POST' });
      await reload();
      showToast(t('အော်ဒါ ပယ်ဖျက်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const addReservation = async () => {
    try {
      await api('/reservations', {
        method: 'POST',
        body: JSON.stringify({ ...resForm, table_id: resForm.table_id || null })
      });
      setResOpen(false);
      setResForm({ customer_name: '', phone: '', party_size: 2, table_id: '', reserved_at: nextHour(), note: '' });
      await reload();
      showToast(t('ကြိုတင်မှာယူ သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const seatReservation = async (r) => {
    try {
      await api(`/reservations/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'seated' }) });
      if (r.table_id) {
        const order = await api('/orders', { method: 'POST', body: JSON.stringify({ type: 'dine_in', tableId: r.table_id, guests: r.party_size }) });
        await reload();
        openOrder(order.id);
      } else {
        await reload();
        showToast(t('ဧည့်သည် ရောက်ပါပြီ'));
      }
    } catch (e) { showToast(e.message); }
  };

  const cancelReservation = async (r) => {
    try {
      await api(`/reservations/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
      await reload();
    } catch (e) { showToast(e.message); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>{t('စားပွဲ & အရောင်း')}</h2>
          <p className="muted small">{t('စားပွဲရွေးချယ်ပြီး အရောင်းစတင်ပါ')}</p>
        </div>
        <div className="row gap">
          <button className="btn amber" onClick={() => newOrder('takeaway')}><Icon name="cart" size={17} /> {t('ပါဆယ်')}</button>
          <button className="btn" onClick={() => newOrder('delivery')}><Icon name="phone" size={17} /> {t('ပို့ဆောင်')}</button>
        </div>
      </div>

      <div className="glance-row">
        <div className="glance-card is-amber">
          <span className="glance-ico"><Icon name="receipt" size={18} /></span>
          <div className="glance-txt">
            <span className="glance-cap">{t('လက်ရှိ အော်ဒါ')}</span>
            <strong className="glance-val">{data.openOrders.length}</strong>
          </div>
        </div>
        <div className="glance-card is-brand">
          <span className="glance-ico"><Icon name="table" size={18} /></span>
          <div className="glance-txt">
            <span className="glance-cap">{t('လွတ်နေသော စားပွဲ')}</span>
            <strong className="glance-val">{freeTables}<small>/ {data.tables.length}</small></strong>
          </div>
        </div>
        <div className="glance-card is-indigo">
          <span className="glance-ico"><Icon name="calendar" size={18} /></span>
          <div className="glance-txt">
            <span className="glance-cap">{t('ကြိုတင်မှာယူမှု')}</span>
            <strong className="glance-val">{reservations.length}</strong>
          </div>
        </div>
        <div className="glance-card is-sky">
          <span className="glance-ico"><Icon name="cash" size={18} /></span>
          <div className="glance-txt">
            <span className="glance-cap">{t('လက်ကျန် တန်ဖိုး')}</span>
            <strong className="glance-val is-money" title={money(openValue)}>{money(openValue)}</strong>
          </div>
        </div>
      </div>

      {onlineOrders.length > 0 && (
        <section className="zone online-orders-zone">
          <div className="zone-head">
            <h3>
              <Icon name="receipt" size={16} /> {t('အွန်လိုင်း အော်ဒါများ')}
              <span className={`online-count ${pendingOnline.length ? 'hot' : ''}`}>{pendingOnline.length}</span>
            </h3>
            <span className="online-hint small">
              {pendingOnline.length > 0 ? t('အတည်ပြုရန် စောင့်နေသည်') : t('အားလုံး အတည်ပြုပြီး')}
            </span>
          </div>
          <div className="list">
            {onlineOrders.map(o => {
              const pending = !o.confirmed_at;
              return (
                <div
                  key={o.id}
                  className={`list-row online-order-row ${pending ? 'is-pending' : ''}`}
                  onClick={() => openOrder(o.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openOrder(o.id); }}
                >
                  <span className={`online-ico ${o.type === 'dine_in' ? 'dine' : 'take'}`}>
                    <Icon name={o.type === 'dine_in' ? 'table' : 'box'} size={17} />
                  </span>
                  <div className="grow">
                    <strong>#{o.order_no} · {o.customer_name || t('အွန်လိုင်း ဖောက်သည်')}</strong>
                    <small className="muted">
                      {o.type === 'dine_in' ? (o.table_name || t('စားပွဲ')) : t('ပါဆယ်')} · {o.item_count} {t('မျိုး')} · {o.opened_at?.slice(11, 16)}
                      {o.customer_phone ? ` · ${o.customer_phone}` : ''}
                    </small>
                  </div>
                  <div className="online-side">
                    <span className="amount">{money(o.total)}</span>
                    {pending ? (
                      <div className="online-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn sm" disabled={confirmingId === o.id} onClick={() => confirmOnline(o)}>
                          <Icon name="check" size={14} /> {t('အတည်ပြု')}
                        </button>
                        {staff?.role !== 'waiter' && (
                          <button className="btn ghost sm" onClick={() => declineOnline(o)}>{t('ပယ်')}</button>
                        )}
                      </div>
                    ) : (
                      <span className="badge ok">{t('အတည်ပြုပြီး')}</span>
                    )}
                  </div>
                  <Icon name="chevronRight" size={16} className="online-go" />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="zone">
        <div className="zone-head">
          <h3>{t('ကြိုတင်မှာယူမှု')}</h3>
          <button className="btn ghost sm act-add" onClick={() => setResOpen(true)}><Icon name="plus" size={14} /> {t('ကြိုတင်မှာယူ')}</button>
        </div>
        {reservations.length === 0 ? <Empty text={t('ကြိုတင်မှာယူမှု မရှိပါ')} /> : (
          <div className="list">
            {reservations.map(r => (
              <div className="list-row static" key={r.id}>
                <div className="avatar amber">
                  {(r.customer_name || '?').slice(0, 1)}
                </div>
                <div className="grow">
                  <strong>{r.customer_name} · {r.party_size} {t('ဦး')}</strong>
                  <small className="muted">
                    {r.reserved_at?.slice(0, 16).replace('T', ' ')} · {r.table_name || t('မသတ်မှတ်')}
                    {r.phone ? ` · ${r.phone}` : ''}
                  </small>
                </div>
                <button className="btn sm" onClick={() => seatReservation(r)}>{t('ရောက်ပြီ')}</button>
                <button className="btn ghost sm" onClick={() => cancelReservation(r)}>{t('ပယ်')}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      {drafts.length > 0 && (
        <section className="zone">
          <div className="zone-head">
            <h3>{t('အော့ဖ်လိုင်း အော်ဒါများ')}</h3>
            <button className="btn ghost sm" onClick={() => syncNow?.()} disabled={!online}>
              <Icon name="wifi" size={14} /> {t('Sync လုပ်မည်')}
            </button>
          </div>
          <div className="list">
            {drafts.map(d => (
              <button key={d.key} className="list-row" onClick={() => openOrder(d.key)}>
                <span className="quick-ico sm">
                  <Icon name={d.type === 'delivery' ? 'phone' : d.type === 'takeaway' ? 'cart' : 'table'} size={17} />
                </span>
                <div className="grow">
                  <strong>#{d.order_no} · {d.status === 'paid' ? t('ငွေရှင်းပြီး') : t('local အော်ဒါ')}</strong>
                  <small className="muted">
                    {d.items.length} {t('မျိုး')} · {d.table_id
                      ? (data.tables.find(tb => tb.id === d.table_id)?.name || t('စားပွဲ'))
                      : d.type === 'delivery' ? t('ပို့ဆောင်') : t('ပါဆယ်')} · {money(d.total)}
                  </small>
                  {d.error && <small className="error-text">{d.error}</small>}
                </div>
                <span className={`badge ${d.status === 'paid' ? 'bad' : 'ok'}`}>
                  {d.status === 'paid' ? t('sync စောင့်') : t('local')}
                </span>
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        </section>
      )}

      {zones.map(zone => {
        const zoneTables = data.tables.filter(tb => (tb.zone || 'အခြား') === zone);
        const zoneBusy = zoneTables.filter(tb => tb.order_id || hasLocal(tb)).length;
        return (
          <section key={zone} className="zone">
            <div className="zone-head">
              <h3>{t(zone)}</h3>
              <span className="zone-meta">
                <span className="zone-meter" aria-hidden="true">
                  <span style={{ width: `${zoneTables.length ? Math.round((zoneBusy / zoneTables.length) * 100) : 0}%` }} />
                </span>
                <span className="zone-stat"><b>{zoneBusy}</b> / {zoneTables.length} · {t('အသုံးပြုနေသည်')}</span>
              </span>
            </div>
            <div className="table-grid">
              {zoneTables.map(tb => {
                const locals = openDrafts.filter(d => d.table_id === tb.id);
                const local = locals[locals.length - 1];
                const busy = !!(tb.order_id || local);
                return (
                  <button key={tb.id} className={`table-card ${busy ? 'busy' : ''}`} onClick={() => openTable(tb)}>
                    <div className="tc-top">
                      <span className="tc-name">{tb.name}</span>
                      <span className={`badge ${busy ? 'bad' : 'ok'}`}>
                        {local ? t('local အော်ဒါ') : tb.order_id ? t('အသုံးပြုနေသည်') : t('လွတ်နေသည်')}
                      </span>
                    </div>
                    <div className="tc-seats">
                      <Icon name="users" size={13} />
                      <span>{tb.seats} {t('ထိုင်ခုံ')}</span>
                      <span className="tc-zone">{t(tb.zone || 'အခြား')}</span>
                    </div>
                    {local ? (
                      <div className="tc-order local">
                        <span>#{local.order_no}{locals.length > 1 ? ` +${locals.length - 1}` : ''}</span>
                        <strong>{money(local.total)}</strong>
                      </div>
                    ) : tb.order_id ? (
                      <div className="tc-order">
                        <span>#{tb.order_no}{tb.bills > 1 ? ` +${tb.bills - 1}` : ''}</span>
                        <strong>{money(tb.bills > 1 ? tb.open_total : tb.total)}</strong>
                      </div>
                    ) : (
                      <div className="tc-open">
                        <Icon name="plus" size={14} />
                        <span>{t('Order ဖွင့်ရန်')}</span>
                        <Icon name="chevronRight" size={14} className="tc-go" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="zone">
        <div className="zone-head"><h3>{t('ပါဆယ် / ပို့ဆောင် Order များ')}</h3></div>
        {takeawayOrders.length === 0 ? <Empty text={t('ဖွင့်ထားသော ပါဆယ် order မရှိပါ')} /> : (
          <div className="list">
            {takeawayOrders.map(o => (
              <button key={o.id} className="list-row" onClick={() => openOrder(o.id)}>
                <span className="quick-ico sm">
                  <Icon name={o.type === 'delivery' ? 'phone' : 'cart'} size={17} />
                </span>
                <div className="grow">
                  <strong>{o.type === 'delivery' ? t('ပို့ဆောင်') : t('ပါဆယ်')} · #{o.order_no}</strong>
                  <small className="muted">{t('ပစ္စည်း')} {o.item_count} {t('မျိုး')} · {o.opened_at?.slice(11, 16)}</small>
                </div>
                <span className="amount">{money(o.total)}</span>
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        )}
      </section>

      {billsFor && (
        <Modal title={`${billsFor.table.name} — ${t('ဘီလ်များ')}`} onClose={() => setBillsFor(null)}
          footer={<button className="btn ghost" onClick={() => setBillsFor(null)}>{t('ပိတ်')}</button>}>
          <p className="hint mt-0">{t('ဒီစားပွဲမှာ ဘီလ် နှစ်ခုရှိနေပါတယ် — ဖွင့်မည့် ဘီလ်ကို ရွေးပါ။')}</p>
          <div className="list">
            {billsFor.bills.map(o => (
              <button key={o.id} className="list-row" onClick={() => { setBillsFor(null); openOrder(o.id); }}>
                <span className="quick-ico sm">
                  <Icon name="receipt" size={17} />
                </span>
                <div className="grow">
                  <strong>#{o.order_no}</strong>
                  <small className="muted">{o.item_count} {t('မျိုး')} · {o.opened_at?.slice(11, 16)}</small>
                </div>
                <span className="amount">{money(o.total)}</span>
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
        </Modal>
      )}

      {resOpen && (
        <Modal title={t('ကြိုတင်မှာယူ အသစ်')} onClose={() => setResOpen(false)} footer={<>
          <button className="btn ghost" onClick={() => setResOpen(false)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={addReservation}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('ဧည့်သည် အမည်')}><input value={resForm.customer_name} onChange={e => setResForm({ ...resForm, customer_name: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label={t('ဖုန်း')}><input value={resForm.phone} onChange={e => setResForm({ ...resForm, phone: e.target.value })} /></Field>
            <Field label={t('အရေအတွက်')}><input type="number" value={resForm.party_size} onChange={e => setResForm({ ...resForm, party_size: e.target.value })} /></Field>
          </div>
          <Field label={t('စားပွဲ')}>
            <select value={resForm.table_id} onChange={e => setResForm({ ...resForm, table_id: e.target.value })}>
              <option value="">{t('မသတ်မှတ်')}</option>
              {data.tables.map(tb => <option key={tb.id} value={tb.id}>{tb.name} · {tb.zone}</option>)}
            </select>
          </Field>
          <Field label={t('အချိန်')}><input type="datetime-local" value={resForm.reserved_at} onChange={e => setResForm({ ...resForm, reserved_at: e.target.value })} /></Field>
          <Field label={t('မှတ်ချက်')}><input value={resForm.note} onChange={e => setResForm({ ...resForm, note: e.target.value })} /></Field>
        </Modal>
      )}
    </div>
  );
}
