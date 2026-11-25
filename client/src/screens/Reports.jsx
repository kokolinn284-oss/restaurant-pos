import React, { useEffect, useState } from 'react';
import { api, money, today, METHOD_KEY } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field } from '../components/ui.jsx';
import { downloadCsv } from '../csv.js';

export default function Reports({ showToast }) {
  const { t } = useI18n();
  const [date, setDate] = useState(today());
  const [sum, setSum] = useState(null);
  const [daily, setDaily] = useState([]);
  const [items, setItems] = useState([]);
  const [alcohol, setAlcohol] = useState([]);
  const [shift, setShift] = useState(null);
  const [shiftHistory, setShiftHistory] = useState([]);
  const [shiftModal, setShiftModal] = useState(null);
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [staffSales, setStaffSales] = useState([]);
  const [voids, setVoids] = useState({ cancelledItems: [], voidedOrders: [] });

  const load = async (d) => {
    try {
      const [s, it, sh, alc, st, hist, vd] = await Promise.all([
        api(`/reports/summary?date=${d}`),
        api(`/reports/items?from=${d}&to=${d}`),
        api('/shifts/current'),
        api(`/reports/items?from=${d}&to=${d}&alcohol=1`),
        api(`/reports/staff?from=${d}&to=${d}`),
        api('/shifts'),
        api(`/reports/voids?from=${d}&to=${d}`)
      ]);
      setSum(s);
      setItems(it);
      setAlcohol(alc);
      setShift(sh);
      setStaffSales(st);
      setShiftHistory(hist);
      setVoids(vd || { cancelledItems: [], voidedOrders: [] });
      const from = new Date(d);
      from.setDate(from.getDate() - 6);
      const f = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      setDaily(await api(`/reports/daily?from=${f}&to=${d}`));
    } catch {}
  };

  useEffect(() => { load(date); }, [date]);

  const exportItems = () => {
    downloadCsv(`dishes-${date}.csv`,
      [t('ဟင်း'), t('အရေအတွက်'), t('အရောင်း'), t('ကုန်ကျစရိတ်'), t('အမြတ်')],
      items.map(it => [it.name, it.qty, it.amount, it.cost || 0, it.amount - (it.cost || 0)]));
    showToast(t('CSV ရယူပြီးပါပြီ'));
  };

  const exportStaff = () => {
    downloadCsv(`staff-${date}.csv`,
      [t('ဝန်ထမ်း'), 'Order', t('အရောင်း')],
      staffSales.map(s => [s.name, s.orders, s.total]));
    showToast(t('CSV ရယူပြီးပါပြီ'));
  };

  const exportDaily = () => {
    downloadCsv(`daily-${date}.csv`,
      [t('ရက်စွဲ'), 'Order', t('စုစုပေါင်း'), t('လျော့ငွေ'), t('အရောင်း')],
      daily.map(d => [d.date, d.orders, d.subtotal, d.discount, d.total]));
    showToast(t('CSV ရယူပြီးပါပြီ'));
  };

  const submitShift = async () => {
    try {
      if (shiftModal === 'open') {
        await api('/shifts/open', { method: 'POST', body: JSON.stringify({ opening_cash: cash }) });
        showToast(t('ဆိုင်ဖွင့်ပြီးပါပြီ'));
      } else {
        const r = await api('/shifts/close', { method: 'POST', body: JSON.stringify({ closing_cash: cash, note }) });
        showToast(`${t('ဆိုင်ပိတ်ပြီး')} · ${t('ကွာခြားငွေ')} ${money(r.difference || 0)}`);
      }
      setShiftModal(null);
      setCash('');
      setNote('');
      load(date);
    } catch (e) { showToast(e.message); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>{t('အရောင်း အစီရင်ခံစာ')}</h2>
          <p className="muted small">{t('နေ့စဉ် အရောင်း၊ ငွေပေးချေမှုနှင့် ဆိုင်ဖွင့်/ပိတ် ငွေရှင်းချက်')}</p>
        </div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w180" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3><Icon name="clock" size={16} /> {t('ဆိုင် ဖွင့်/ပိတ် · ငွေရှင်း')}</h3>
          {shift ? (
            <button className="btn sm" onClick={() => { setCash(''); setNote(''); setShiftModal('close'); }}>{t('ဆိုင်ပိတ်')}</button>
          ) : (
            <button className="btn sm" onClick={() => { setCash(''); setShiftModal('open'); }}>{t('ဆိုင်ဖွင့်')}</button>
          )}
        </div>
        {!shift ? <div className="empty">{t('ဆိုင် မဖွင့်ရသေးပါ')}</div> : (
          <div className="shift-grid">
            <div><span>{t('ဖွင့်ချိန်')}</span><strong>{shift.shift.opened_at?.slice(11, 16)}</strong></div>
            <div><span>{t('ဝင်ငွေ')}</span><strong>{money(shift.sales)}</strong></div>
            <div><span>Order</span><strong>{shift.orderCount}</strong></div>
            <div><span>{t('လက်ငင်း ငွေ')}</span><strong>{money(shift.cash)}</strong></div>
            <div><span>{t('အကြွေး')}</span><strong>{money(shift.byMethod.find(m => m.method === 'credit')?.amount || 0)}</strong></div>
            <div><span>{t('အကြွေး ပြန်ရငွေ')}</span><strong>{money(shift.creditTotal || 0)}</strong></div>
            <div><span>{t('ပိတ်ရန် မျှော်မှန်း')}</span><strong>{money(shift.expectedCash)}</strong></div>
          </div>
        )}
      </section>

      <div className="stat-grid fluid">
        <div className="stat-card"><span>{t('အရောင်း')}</span><strong>{money(sum?.total || 0)}</strong><small className="muted">{sum?.orderCount || 0} order</small></div>
        <div className="stat-card amber"><span>{t('လျော့ငွေ')}</span><strong>{money(sum?.discount || 0)}</strong><small className="muted">{t('ပေးထားသော လျှော့ငွေ')}</small></div>
        <div className="stat-card indigo"><span>{t('အခွန်')} + {t('ဝန်ဆောင်ခ')}</span><strong>{money((sum?.tax || 0) + (sum?.service || 0))}</strong></div>
        <div className="stat-card rose"><span>{t('အသုံးစရိတ်')}</span><strong>{money(sum?.expenses || 0)}</strong></div>
        <div className="stat-card indigo"><span>{t('အရက်/ဘီယာ အရောင်း')}</span><strong>{money(sum?.alcoholSales || 0)}</strong><small className="muted">{sum?.alcoholQty || 0} {t('ခု')}</small></div>
        <div className="stat-card"><span>{t('အကြွေး ကျန်ငွေ')}</span><strong>{money(sum?.creditOutstanding || 0)}</strong></div>
        <div className="stat-card"><span>{t('အကြွေး ပြန်ရငွေ')}</span><strong>{money(sum?.creditPaid || 0)}</strong><small className="muted">{t('အကြွေး ဖြတ်ပြီး')}</small></div>
        <div className="stat-card rose"><span>{t('ဟင်းခ ကုန်ကျစရိတ်')}</span><strong>{money(sum?.cost || 0)}</strong><small className="muted">{t('ယနေ့')}</small></div>
        <div className="stat-card"><span>{t('အသားတင် အမြတ်')}</span><strong>{money(sum?.netProfit || 0)}</strong><small className="muted">{sum?.netMargin || 0}% {t('အမြတ်နှုန်း')} · {t('အသုံးစရိတ် နုတ်ပြီး')}</small></div>
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><h3>{t('ငွေပေးချေမှု အမျိုးအစား')}</h3></div>
          {(!sum || sum.byMethod.length === 0) ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
            <div className="list">
              {sum.byMethod.map(m => (
                <div className="list-row static" key={m.method}>
                  <div className="grow"><strong>{t(m.method_name || METHOD_KEY[m.method] || m.method)}</strong><small className="muted">{m.count} {t('ကြိမ်')}</small></div>
                  <span className="amount">{money(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>{t('ဟင်း အရောင်း')}</h3>
            <button className="btn ghost sm" onClick={exportItems} disabled={!items.length}>CSV</button>
          </div>
          {items.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
            <div className="list">
              {items.slice(0, 12).map((it, i) => (
                <div className="list-row static" key={it.name}>
                  <div className={`rank ${i === 0 ? 'gold' : ''}`}>{i + 1}</div>
                  <div className="grow">
                    <strong>{t(it.name)}</strong>
                    <small className="muted">{it.qty} {t('ပွဲ')} · {t('အမြတ်')} {money(it.amount - (it.cost || 0))}</small>
                  </div>
                  <span className="amount">{money(it.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3><Icon name="users" size={16} /> {t('ဝန်ထမ်း အရောင်း')}</h3>
          <button className="btn ghost sm" onClick={exportStaff} disabled={!staffSales.length}>CSV</button>
        </div>
        {staffSales.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('ဝန်ထမ်း')}</th><th>Order</th><th>{t('အရောင်း')}</th></tr></thead>
              <tbody>
                {staffSales.map(s => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{s.orders}</td>
                    <td><strong>{money(s.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3><Icon name="beer" size={16} /> {t('အရက် & ဘီယာ အရောင်း')}</h3>
          <span className="badge bad">18+</span>
        </div>
        {alcohol.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
          <div className="list">
            {alcohol.map(it => (
              <div className="list-row static" key={it.name}>
                <div className="rank"><Icon name="beer" size={14} /></div>
                <div className="grow"><strong>{t(it.name)}</strong><small className="muted">{it.qty} {t('ခု')}</small></div>
                <span className="amount">{money(it.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>{t('နောက်ဆုံး ၇ ရက်')}</h3>
          <button className="btn ghost sm" onClick={exportDaily} disabled={!daily.length}>CSV</button>
        </div>
        {daily.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('ရက်စွဲ')}</th><th>Order</th><th>{t('စုစုပေါင်း')}</th><th>{t('လျော့ငွေ')}</th><th>{t('အရောင်း')}</th></tr></thead>
              <tbody>
                {daily.map(d => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td>{d.orders}</td>
                    <td>{money(d.subtotal)}</td>
                    <td>{money(d.discount)}</td>
                    <td><strong>{money(d.total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3><Icon name="clock" size={16} /> {t('ဆိုင်ဖွင့်/ပိတ် မှတ်တမ်း')}</h3>
          <span className="badge">{shiftHistory.length}</span>
        </div>
        {shiftHistory.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('ဖွင့်ချိန်')}</th>
                  <th>{t('ဝန်ထမ်း')}</th>
                  <th>{t('အရောင်း')}</th>
                  <th>{t('လက်ငင်း ငွေ')}</th>
                  <th>{t('အကြွေး ပြန်ရငွေ')}</th>
                  <th>{t('မျှော်မှန်း')}</th>
                  <th>{t('ပိတ်ငွေ')}</th>
                  <th>{t('ကွာခြားငွေ')}</th>
                </tr>
              </thead>
              <tbody>
                {shiftHistory.map(h => (
                  <tr key={h.shift.id}>
                    <td>
                      <div>{h.shift.opened_at?.slice(0, 10)}</div>
                      <small className="muted">{h.shift.opened_at?.slice(11, 16)}{h.shift.closed_at ? ` → ${h.shift.closed_at.slice(11, 16)}` : ` · ${t('ဖွင့်ထားဆဲ')}`}</small>
                    </td>
                    <td>{h.staff_name || '—'}</td>
                    <td>{money(h.sales)}</td>
                    <td>{money(h.cash)}</td>
                    <td>{money(h.creditTotal || 0)}</td>
                    <td>{money(h.expectedCash)}</td>
                    <td>{h.shift.closing_cash != null ? money(h.shift.closing_cash) : '—'}</td>
                    <td><strong className={h.difference ? (h.difference < 0 ? 'neg' : 'pos') : ''}>{h.difference != null ? money(h.difference) : '—'}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3><Icon name="close" size={16} /> {t('ပယ်ဖျက်မှု စစ်ဆေးချက်')}</h3>
          <div className="inline">
            {voids.summary && (
              <>
                <span className="badge bad">{t('ဟင်းပယ်ဖျက်')}: {voids.summary.itemCancelCount} ({money(voids.summary.itemCancelAmount)})</span>
                <span className="badge bad">{t('ဘီလ်ပယ်ဖျက်')}: {voids.summary.orderVoidCount} ({money(voids.summary.orderVoidAmount)})</span>
              </>
            )}
            <button
              className="btn ghost sm"
              disabled={!((voids.auditLogs?.length || 0) + voids.cancelledItems.length + voids.voidedOrders.length)}
              onClick={() => {
                const rows = (voids.auditLogs?.length ? voids.auditLogs : [
                  ...voids.cancelledItems.map(c => ({
                    created_at: c.cancelled_at || '', action: 'item_cancel', order_no: c.order_no,
                    table_name: c.table_name || t('ပါဆယ်'), item_name: `${c.name} × ${c.qty}`,
                    amount: Math.round(c.price * c.qty), actor_name: c.cancelled_by_name || '—', reason: c.cancel_reason || '—'
                  })),
                  ...voids.voidedOrders.map(v => ({
                    created_at: v.closed_at || v.opened_at || '', action: 'order_void', order_no: v.order_no,
                    table_name: v.table_name || t('ပါဆယ်'), item_name: t('ဘီလ်တစ်ခုလုံး ပယ်ဖျက်'),
                    amount: v.total || 0, actor_name: v.staff_name || '—', reason: v.reason || v.note || '—'
                  }))
                ]);
                downloadCsv(`void-audit-${date}.csv`,
                  [t('အချိန်'), t('အမျိုးအစား'), 'Order', t('စားပွဲ'), t('ဟင်း'), t('ပမာဏ'), t('ဝန်ထမ်း'), t('အကြောင်းပြချက်')],
                  rows.map(r => [r.created_at, r.action, r.order_no, r.table_name, r.item_name, r.amount, r.actor_name, r.reason]));
                showToast(t('CSV ရယူပြီးပါပြီ'));
              }}
            >CSV</button>
          </div>
        </div>
        {(voids.auditLogs?.length ? voids.auditLogs.length === 0 : (voids.cancelledItems.length === 0 && voids.voidedOrders.length === 0)) ? (
          <div className="empty">{t('ပယ်ဖျက်ထားသော ဟင်းပွဲ/ဘီလ် မရှိပါ')}</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>{t('အမျိုးအစား')}</th>
                  <th>{t('ဟင်း')}</th>
                  <th>{t('ပမာဏ')}</th>
                  <th>{t('ပယ်ဖျက်သည့် ဝန်ထမ်း')}</th>
                  <th>{t('အကြောင်းပြချက်')}</th>
                  <th>{t('အချိန်')}</th>
                </tr>
              </thead>
              <tbody>
                {(voids.auditLogs?.length ? voids.auditLogs : [
                  ...voids.cancelledItems.map(c => ({
                    id: `ci-${c.id}`, action: 'item_cancel', order_no: c.order_no, table_name: c.table_name,
                    item_name: c.name, qty: c.qty, amount: Math.round(c.price * c.qty),
                    actor_name: c.cancelled_by_name, reason: c.cancel_reason, created_at: c.cancelled_at
                  })),
                  ...voids.voidedOrders.map(v => ({
                    id: `vo-${v.id}`, action: 'order_void', order_no: v.order_no, table_name: v.table_name,
                    item_name: t('ဘီလ်တစ်ခုလုံး ပယ်ဖျက်'), qty: 1, amount: v.total || 0,
                    actor_name: v.staff_name, reason: v.reason || v.note, created_at: v.closed_at || v.opened_at
                  }))
                ]).map(a => {
                  const actionLabel = a.action === 'paid_void' ? t('ငွေရှင်းပြီး ဘီလ်ဖျက်')
                    : a.action === 'order_void' ? t('ဘီလ်ပယ်ဖျက်')
                    : a.action === 'qty_reduce' ? t('အရေအတွက်လျှော့')
                    : t('ဟင်းပယ်ဖျက်');
                  return (
                    <tr key={a.id}>
                      <td><strong>#{a.order_no}</strong><div className="small muted">{a.table_name || t('ပါဆယ်')}</div></td>
                      <td><span className="badge bad">{actionLabel}</span></td>
                      <td>{t(a.item_name)}{a.qty && a.action !== 'order_void' && a.action !== 'paid_void' ? ` × ${a.qty}` : ''}</td>
                      <td className="neg"><strong>{money(a.amount || 0)}</strong></td>
                      <td>{a.actor_name || '—'}</td>
                      <td>{a.reason || '—'}</td>
                      <td className="small muted">{(a.created_at || '').slice(11, 16) || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {shiftModal && (
        <Modal title={shiftModal === 'open' ? t('ဆိုင် ဖွင့်') : t('ဆိုင် ပိတ် · ငွေရှင်း')} onClose={() => setShiftModal(null)} footer={<>
          <button className="btn ghost" onClick={() => setShiftModal(null)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={submitShift}>{shiftModal === 'open' ? t('ဖွင့်မည်') : t('ပိတ်မည်')}</button>
        </>}>
          {shiftModal === 'close' && shift && (
            <div className="pay-summary">
              <div className="row between"><span>{t('မျှော်မှန်း လက်ကျန်ငွေ')}</span><strong>{money(shift.expectedCash)}</strong></div>
              <div className="row between"><span>{t('စုစုပေါင်း အရောင်း')}</span><span>{money(shift.sales)}</span></div>
            </div>
          )}
          <Field label={shiftModal === 'open' ? t('အစ လက်ကျန်ငွေ') : t('ပိတ်ချိန် လက်ကျန်ငွေ')}>
            <input type="number" value={cash} onChange={e => setCash(e.target.value)} placeholder="0" />
          </Field>
          {shiftModal === 'close' && (
            <Field label={t('မှတ်ချက်')}><input value={note} onChange={e => setNote(e.target.value)} /></Field>
          )}
        </Modal>
      )}
    </div>
  );
}
