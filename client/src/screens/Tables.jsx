import React, { useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';

function nextHour() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function Tables({ data, openOrder, reload, showToast }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [billsFor, setBillsFor] = useState(null);
  const [resOpen, setResOpen] = useState(false);
  const [resForm, setResForm] = useState({ customer_name: '', phone: '', party_size: 2, table_id: '', reserved_at: nextHour(), note: '' });

  const zones = [...new Set(data.tables.map(tb => tb.zone || 'အခြား'))];
  const reservations = data.reservations || [];
  const openValue = (data.openOrders || []).reduce((s, o) => s + (o.total || 0), 0);

  const openTable = async (tb) => {
    if (busy) return;
    if (tb.order_id) {
      const bills = data.openOrders.filter(o => o.table_id === tb.id);
      if (bills.length > 1) {
        setBillsFor({ table: tb, bills });
        return;
      }
      return openOrder(tb.order_id);
    }
    setBusy(true);
    try {
      const r = await api('/orders', { method: 'POST', body: JSON.stringify({ type: 'dine_in', tableId: tb.id }) });
      await reload();
      openOrder(r.id);
    } catch (e) { showToast(e.message); }
    setBusy(false);
  };

  const newOrder = async (type) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api('/orders', { method: 'POST', body: JSON.stringify({ type }) });
      await reload();
      openOrder(r.id);
    } catch (e) { showToast(e.message); }
    setBusy(false);
  };

  const takeawayOrders = data.openOrders.filter(o => o.type !== 'dine_in');

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
          <p className="muted small">{t('စားပွဲ ရွေးပြီး order ဖွင့်ပါ — ပါဆယ်နှင့် ပို့ဆောင်လည်း ဒီကနေ စနိုင်သည်')}</p>
        </div>
        <div className="row gap">
          <button className="btn amber" onClick={() => newOrder('takeaway')}><Icon name="cart" size={17} /> {t('ပါဆယ်')}</button>
          <button className="btn" onClick={() => newOrder('delivery')}><Icon name="phone" size={17} /> {t('ပို့ဆောင်')}</button>
        </div>
      </div>

      <div className="quick-row">
        <button className="quick-card takeaway" onClick={() => newOrder('takeaway')}>
          <span className="quick-ico"><Icon name="cart" /></span>
          <div>
            <strong>{t('ပါဆယ်')}</strong>
            <small>{t('အပြင်ယူ အရောင်း')}</small>
          </div>
        </button>
        <button className="quick-card delivery" onClick={() => newOrder('delivery')}>
          <span className="quick-ico"><Icon name="phone" /></span>
          <div>
            <strong>{t('ပို့ဆောင်')}</strong>
            <small>{t('အိမ်အရောက် ပို့')}</small>
          </div>
        </button>
        <div className="quick-stat">
          <span>{t('ဖွင့်ထားသော Order')}</span>
          <strong>{data.openOrders.length}</strong>
        </div>
        <div className="quick-stat">
          <span>{t('ဖွင့်ထားသော တန်ကြေး')}</span>
          <strong>{money(openValue)}</strong>
        </div>
      </div>

      <section className="zone">
        <div className="zone-head">
          <h3>{t('ကြိုတင်မှာယူမှုများ')}</h3>
          <button className="btn ghost sm" onClick={() => setResOpen(true)}><Icon name="plus" size={14} /> {t('ကြိုတင်မှာယူ')}</button>
        </div>
        {reservations.length === 0 ? <Empty text={t('ကြိုတင်မှာယူမှု မရှိပါ')} /> : (
          <div className="list">
            {reservations.map(r => (
              <div className="list-row static" key={r.id}>
                <div className="avatar" style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}>
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

      {zones.map(zone => (
        <section key={zone} className="zone">
          <div className="zone-head">
            <h3>{t(zone)}</h3>
            <span className="muted small">
              {data.tables.filter(tb => (tb.zone || 'အခြား') === zone && tb.order_id).length} / {data.tables.filter(tb => (tb.zone || 'အခြား') === zone).length} {t('အသုံးပြုနေသည်')}
            </span>
          </div>
          <div className="table-grid">
            {data.tables.filter(tb => (tb.zone || 'အခြား') === zone).map(tb => (
              <button key={tb.id} className={`table-card ${tb.order_id ? 'busy' : ''}`} onClick={() => openTable(tb)}>
                <div className="tc-top">
                  <span className="tc-name">{tb.name}</span>
                  <span className={`badge ${tb.order_id ? 'bad' : 'ok'}`}>{tb.order_id ? t('အသုံးပြုနေသည်') : t('လွတ်နေသည်')}</span>
                </div>
                <div className="tc-seats">{t('ထိုင်ခုံ')} {tb.seats} · {t(tb.zone || 'အခြား')}</div>
                {tb.order_id ? (
                  <div className="tc-order">
                    <span>#{tb.order_no}{tb.bills > 1 ? ` +${tb.bills - 1}` : ''}</span>
                    <strong>{money(tb.bills > 1 ? tb.open_total : tb.total)}</strong>
                  </div>
                ) : (
                  <div className="tc-open"><Icon name="plus" /> {t('Order ဖွင့်ရန်')}</div>
                )}
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="zone">
        <div className="zone-head"><h3>{t('ပါဆယ် / ပို့ဆောင် Order များ')}</h3></div>
        {takeawayOrders.length === 0 ? <Empty text={t('ဖွင့်ထားသော ပါဆယ် order မရှိပါ')} /> : (
          <div className="list">
            {takeawayOrders.map(o => (
              <button key={o.id} className="list-row" onClick={() => openOrder(o.id)}>
                <span className="quick-ico" style={{ width: 38, height: 38, flexBasis: 38, borderRadius: 11 }}>
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
          <p className="hint" style={{ marginTop: 0 }}>{t('ဒီစားပွဲမှာ ဘီလ် နှစ်ခုရှိနေပါတယ် — ဖွင့်မည့် ဘီလ်ကို ရွေးပါ။')}</p>
          <div className="list">
            {billsFor.bills.map(o => (
              <button key={o.id} className="list-row" onClick={() => { setBillsFor(null); openOrder(o.id); }}>
                <span className="quick-ico" style={{ width: 38, height: 38, flexBasis: 38, borderRadius: 11 }}>
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
