import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon } from '../components/ui.jsx';

export default function Kitchen({ data, reload, showToast }) {
  const { t } = useI18n();
  const [rows, setRows] = useState([]);
  const [station, setStation] = useState('kitchen');
  const settings = data.settings;
  const direct = settings.printer_mode && settings.printer_mode !== 'browser';
  const bar = station === 'bar';

  const load = async () => {
    try { setRows(await api(`/kitchen?station=${station}`)); } catch {}
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [station]);

  const served = async (row) => {
    try {
      await api(`/order-items/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'served' }) });
      await load();
      if (reload) await reload();
      showToast(t('ကျွေးပြီးအဖြစ် မှတ်ထားသည်'));
    } catch (e) { showToast(e.message); }
  };

  const printTicket = async (g) => {
    if (direct) {
      try {
        await api(`/print/kitchen/${g.header.order_id}`, { method: 'POST', body: JSON.stringify({ station }) });
        showToast(t('ပရင့် ပို့ပြီးပါပြီ'));
      } catch (e) { showToast(`${t('ပရင့် မအောင်မြင်ပါ')} — ${e.message}`); }
      return;
    }
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) return;
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const where = g.header.type === 'dine_in' ? g.header.table_name : g.header.type === 'delivery' ? t('ပို့ဆောင်') : t('ပါဆယ်');
    const lines = g.items.map(it => `<tr><td>${esc(it.name)}${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}</td><td class="q">× ${it.qty}</td></tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>#${esc(g.header.order_no)}</title>
      <style>body{font-family:"Pyidaungsu","Padauk",monospace;font-size:15px;padding:10px;width:72mm}
      h2{margin:0 0 4px;font-size:22px}.sub{margin:0 0 10px;border-bottom:1px dashed #000;padding-bottom:8px}
      table{width:100%;border-collapse:collapse}td{padding:7px 0;vertical-align:top;border-bottom:1px dashed #bbb}
      .q{text-align:right;font-weight:bold;white-space:nowrap}.note{font-size:13px;margin-top:2px}</style></head>
      <body><h2>#${esc(g.header.order_no)}</h2><p class="sub">${bar ? 'BAR' : 'KITCHEN'} · ${esc(where)} · ${new Date().toLocaleTimeString('en-GB')}</p>
      <table>${lines}</table><p style="margin-top:14px">${bar ? 'BAR' : 'KITCHEN'} TICKET</p>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    w.document.close();
  };

  const groups = {};
  for (const r of rows) {
    const key = r.order_id;
    groups[key] = groups[key] || { header: r, items: [] };
    groups[key].items.push(r);
  }

  const ago = (s) => {
    if (!s) return '';
    const mins = Math.max(0, Math.round((Date.now() - new Date(s.replace(' ', 'T')).getTime()) / 60000));
    return mins < 1 ? t('ယခုလေးတင်') : `${mins} ${t('မိနစ်')}`;
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>{bar ? t('ဘား') : t('မီးဖိုချောင်')}</h2>
          <p className="muted small">{bar
            ? t('ဘား · ဖျော်ရန် စောင့်နေသော ပစ္စည်းများ · အလိုအလျောက် refresh ဖြစ်သည်')
            : t('ချက်ရန် စောင့်နေသော ဟင်းများ · အလိုအလျောက် refresh ဖြစ်သည်')}</p>
        </div>
        <div className="row gap">
          <span className="conn"><i className="dot ok" /> {rows.length} {t('ချက်နေသည်')}</span>
          <button className="btn ghost sm" onClick={load}><Icon name="clock" size={15} /> {t('ပြန်လည်')}</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${!bar ? 'on' : ''}`} onClick={() => setStation('kitchen')}>
          <Icon name="fire" size={15} /> {t('မီးဖိုချောင်')} <span className="tab-count">{data.kitchenCount || 0}</span>
        </button>
        <button className={`tab ${bar ? 'on' : ''}`} onClick={() => setStation('bar')}>
          <Icon name="beer" size={15} /> {t('ဘား')} <span className="tab-count">{data.barCount || 0}</span>
        </button>
      </div>

      {rows.length === 0 && <div className="empty">{bar ? t('ဖျော်ရန် မရှိသေးပါ') : t('ချက်ရန် မရှိသေးပါ')}</div>}

      <div className="kds-grid">
        {Object.values(groups).map(g => (
          <div className="kds-card" key={g.header.order_id}>
            <div className="kds-head">
              <strong>#{g.header.order_no}</strong>
              <span className="badge amber">{g.header.type === 'dine_in' ? g.header.table_name : g.header.type === 'delivery' ? t('ပို့ဆောင်') : t('ပါဆယ်')}</span>
              <span className="muted small">{ago(g.header.sent_at)}</span>
              <button className="icon-btn small" onClick={() => printTicket(g)} title={t('ပရင့်')}>
                <Icon name="print" size={16} />
              </button>
            </div>
            <ul>
              {g.items.map(it => (
                <li key={it.id} className={it.status === 'served' ? 'done' : ''}>
                  <div>
                    <strong>{it.name}</strong>
                    <span className="qty">× {it.qty}</span>
                    {it.note && <div className="ci-note">{it.note}</div>}
                  </div>
                  {it.status === 'cooking' && (
                    <button className="btn sm" onClick={() => served(it)}><Icon name="check" size={14} /> {t('ပြီးပါပြီ')}</button>
                  )}
                  {it.status === 'served' && <Icon name="check" size={16} />}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
