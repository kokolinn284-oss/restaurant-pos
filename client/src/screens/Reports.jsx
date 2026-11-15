import React, { useEffect, useState } from 'react';
import { api, money, today } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field } from '../components/ui.jsx';
import Receipt from '../components/Receipt.jsx';

const METHOD_KEY = { cash: 'လက်ငင်း', kbzpay: 'KBZPay', wavepay: 'WavePay', bank: 'ဘဏ်/ကတ်', credit: 'အကြွေး' };

export default function Reports({ data, showToast }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('report');
  const [date, setDate] = useState(today());
  const [sum, setSum] = useState(null);
  const [daily, setDaily] = useState([]);
  const [items, setItems] = useState([]);
  const [alcohol, setAlcohol] = useState([]);
  const [shift, setShift] = useState(null);
  const [shiftModal, setShiftModal] = useState(null);
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [histStatus, setHistStatus] = useState('paid');
  const [hq, setHq] = useState('');
  const [history, setHistory] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const settings = data?.settings || {};

  const load = async (d) => {
    try {
      const [s, it, sh, alc] = await Promise.all([
        api(`/reports/summary?date=${d}`),
        api(`/reports/items?from=${d}&to=${d}`),
        api('/shifts/current'),
        api(`/reports/items?from=${d}&to=${d}&alcohol=1`)
      ]);
      setSum(s);
      setItems(it);
      setAlcohol(alc);
      setShift(sh);
      const from = new Date(d);
      from.setDate(from.getDate() - 6);
      const f = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      setDaily(await api(`/reports/daily?from=${f}&to=${d}`));
    } catch {}
  };

  useEffect(() => { load(date); }, [date]);

  const loadHistory = async () => {
    try {
      const params = new URLSearchParams({ from, to, status: histStatus });
      if (hq.trim()) params.set('q', hq.trim());
      setHistory(await api(`/orders/history?${params}`));
    } catch (e) { showToast(e.message); }
  };
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, from, to, histStatus]);

  const openReceipt = async (id) => {
    try { setReceipt(await api(`/orders/${id}`)); }
    catch (e) { showToast(e.message); }
  };

  const printReceipt = async () => {
    if (!receipt) return;
    try {
      await api(`/print/receipt/${receipt.id}`, { method: 'POST' });
      showToast(t('ပရင့် ပို့ပြီးပါပြီ'));
    } catch (e) { showToast(`${t('ပရင့် မအောင်မြင်ပါ')} — ${e.message}`); }
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
      <div className="tabs">
        <button className={`tab ${tab === 'report' ? 'on' : ''}`} onClick={() => setTab('report')}>
          <Icon name="chart" size={15} /> {t('အစီရင်ခံစာ')}
        </button>
        <button className={`tab ${tab === 'history' ? 'on' : ''}`} onClick={() => setTab('history')}>
          <Icon name="receipt" size={15} /> {t('Order မှတ်တမ်း')}
        </button>
      </div>

      {tab === 'report' && (<>
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
            <div><span>{t('ပိတ်ရန် မျှော်မှန်း')}</span><strong>{money(shift.expectedCash)}</strong></div>
          </div>
        )}
      </section>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))' }}>
        <div className="stat-card"><span>{t('အရောင်း')}</span><strong>{money(sum?.total || 0)}</strong><small className="muted">{sum?.orderCount || 0} order</small></div>
        <div className="stat-card amber"><span>{t('လျော့ငွေ')}</span><strong>{money(sum?.discount || 0)}</strong><small className="muted">{t('ပေးထားသော လျှော့ငွေ')}</small></div>
        <div className="stat-card indigo"><span>{t('အခွန်')} + {t('ဝန်ဆောင်ခ')}</span><strong>{money((sum?.tax || 0) + (sum?.service || 0))}</strong></div>
        <div className="stat-card rose"><span>{t('အသုံးစရိတ်')}</span><strong>{money(sum?.expenses || 0)}</strong></div>
        <div className="stat-card indigo"><span>{t('အရက်/ဘီယာ အရောင်း')}</span><strong>{money(sum?.alcoholSales || 0)}</strong><small className="muted">{sum?.alcoholQty || 0} {t('ခု')}</small></div>
        <div className="stat-card"><span>{t('အကြွေး ကျန်ငွေ')}</span><strong>{money(sum?.creditOutstanding || 0)}</strong></div>
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><h3>{t('ငွေပေးချေမှု အမျိုးအစား')}</h3></div>
          {(!sum || sum.byMethod.length === 0) ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
            <div className="list">
              {sum.byMethod.map(m => (
                <div className="list-row static" key={m.method}>
                  <div className="grow"><strong>{t(METHOD_KEY[m.method] || m.method)}</strong><small className="muted">{m.count} {t('ကြိမ်')}</small></div>
                  <span className="amount">{money(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head"><h3>{t('ဟင်း အရောင်း')}</h3></div>
          {items.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
            <div className="list">
              {items.slice(0, 12).map((it, i) => (
                <div className="list-row static" key={it.name}>
                  <div className={`rank ${i === 0 ? 'gold' : ''}`}>{i + 1}</div>
                  <div className="grow"><strong>{it.name}</strong><small className="muted">{it.qty} {t('ပွဲ')}</small></div>
                  <span className="amount">{money(it.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

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
                <div className="grow"><strong>{it.name}</strong><small className="muted">{it.qty} {t('ခု')}</small></div>
                <span className="amount">{money(it.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h3>{t('နောက်ဆုံး ၇ ရက်')}</h3></div>
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
      </>)}

      {tab === 'history' && (
        <>
          <div className="page-head">
            <div>
              <h2>{t('Order မှတ်တမ်း')}</h2>
              <p className="muted small">{t('ရှင်းပြီး ဘီလ်များ ပြန်ရှာပြီး ဘောက်ချာ ပြန်ပရင့်နိုင်သည်')}</p>
            </div>
          </div>
          <div className="toolbar">
            <div className="row gap">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
              <input type="date" value={to} onChange={e => setTo(e.target.value)} />
              <select value={histStatus} onChange={e => setHistStatus(e.target.value)}>
                <option value="paid">{t('ရှင်းပြီး')}</option>
                <option value="void">{t('ပယ်ဖျက်ပြီး')}</option>
                <option value="all">{t('အားလုံး')}</option>
              </select>
            </div>
            <div className="row gap">
              <div className="search">
                <Icon name="search" size={18} />
                <input placeholder={t('Order နံပါတ် / စားပွဲ ရှာရန်…')} value={hq}
                  onChange={e => setHq(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') loadHistory(); }} />
              </div>
              <button className="btn" onClick={loadHistory}>{t('ရှာမည်')}</button>
            </div>
          </div>
          {history.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
            <div className="list">
              {history.map(o => (
                <button className="list-row" key={o.id} onClick={() => openReceipt(o.id)}>
                  <span className="quick-ico" style={{ width: 38, height: 38, flexBasis: 38, borderRadius: 11 }}>
                    <Icon name="receipt" size={17} />
                  </span>
                  <div className="grow">
                    <strong>#{o.order_no}
                      {o.status === 'void' && <span className="badge bad" style={{ marginLeft: 6 }}>{t('ပယ်ဖျက်ပြီး')}</span>}
                    </strong>
                    <small className="muted">
                      {o.table_name || (o.type === 'delivery' ? t('ပို့ဆောင်') : o.type === 'takeaway' ? t('ပါဆယ်') : t('စားပွဲ'))}
                      {' · '}{o.item_count} {t('မျိုး')} · {o.closed_at?.slice(0, 16)}
                    </small>
                  </div>
                  <span className="amount">{money(o.total)}</span>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {receipt && (
        <Modal title={t('ဘောက်ချာ')} wide onClose={() => setReceipt(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setReceipt(null)}>{t('ပိတ်')}</button>
            <button className="btn ghost" onClick={() => window.print()}><Icon name="print" size={16} /> {t('ပရင့်ထုတ်')}</button>
            {(settings.printer_mode || 'browser') !== 'browser' && (
              <button className="btn" onClick={printReceipt}><Icon name="print" size={16} /> {t('တိုက်ရိုက် ပရင့်')}</button>
            )}
          </>}>
          <Receipt order={receipt} settings={settings}
            tableName={data?.tables?.find(tb => tb.id === receipt.table_id)?.name} />
        </Modal>
      )}
    </div>
  );
}
