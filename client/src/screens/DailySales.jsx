import React, { useEffect, useState } from 'react';
import { api, money, today } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, SearchBox, DateRangeField } from '../components/ui.jsx';
import { Pagination } from '../components/DataTableToolbar.jsx';
import Receipt from '../components/Receipt.jsx';
import { downloadCsv } from '../csv.js';

const dayKey = (o) => (o.closed_at || o.opened_at || '').slice(0, 10) || '—';

export default function DailySales({ data, showToast }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState('paid');
  const [q, setQ] = useState('');
  const [history, setHistory] = useState([]);
  const [histDaily, setHistDaily] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const settings = data?.settings || {};

  const loadHistory = async () => {
    try {
      const params = new URLSearchParams({ from, to, status });
      if (q.trim()) params.set('q', q.trim());
      const [rows, days] = await Promise.all([
        api(`/orders/history?${params}`),
        api(`/reports/daily?from=${from}&to=${to}`)
      ]);
      setHistory(rows);
      setHistDaily(days);
    } catch (e) { showToast(e.message); }
  };

  useEffect(() => { loadHistory(); }, [from, to, status]);
  useEffect(() => { setPage(1); }, [from, to, status]);

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(history.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const runSearch = () => { setPage(1); loadHistory(); };

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

  const exportHistory = () => {
    downloadCsv(`orders-${from}_${to}.csv`,
      ['Order', t('ရက်စွဲ'), t('စားပွဲ'), t('အမျိုးအစား'), t('ပစ္စည်း'), t('စုစုပေါင်း'), t('လျော့ငွေ'), t('ကျသင့်ငွေ'), t('အခြေအနေ')],
      history.map(o => [
        o.order_no, o.closed_at || '', o.table_name || '',
        o.type === 'dine_in' ? t('စားပွဲ') : o.type === 'delivery' ? t('ပို့ဆောင်') : t('ပါဆယ်'),
        o.item_count, o.subtotal, o.discount, o.total,
        o.status === 'void' ? t('ပယ်ဖျက်ပြီး') : t('ရှင်းပြီး')
      ]));
    showToast(t('CSV ရယူပြီးပါပြီ'));
  };

  const orderCount = histDaily.reduce((s, d) => s + Number(d.orders || 0), 0);
  const salesTotal = histDaily.reduce((s, d) => s + Number(d.total || 0), 0);
  const discountTotal = histDaily.reduce((s, d) => s + Number(d.discount || 0), 0);
  const avgTicket = orderCount ? Math.round(salesTotal / orderCount) : 0;

  const dayTotals = {};
  history.forEach((o) => {
    const key = dayKey(o);
    const bucket = (dayTotals[key] ||= { count: 0, total: 0 });
    bucket.count += 1;
    if (o.status === 'paid') bucket.total += Number(o.total || 0);
  });

  const paged = pageSize === 'all' ? history : history.slice((page - 1) * pageSize, page * pageSize);
  const groups = paged.reduce((acc, o) => {
    const key = dayKey(o);
    (acc[key] ||= []).push(o);
    return acc;
  }, {});

  return (
    <div className="stack">
      <div className="page-head inline">
        <div>
          <h2>{t('နေ့စဉ် အရောင်းစာရင်း')}</h2>
          <p className="muted small">{t('ရက်စွဲအလိုက် ရှင်းပြီး ဘီလ်များနှင့် ဘောက်ချာများ')}</p>
        </div>
      </div>

      <div className="data-toolbar-wrapper">
        <div className="data-toolbar single-row">
          <div className="toolbar-search-group">
            <SearchBox
              value={q}
              onChange={setQ}
              onSubmit={runSearch}
              placeholder={t('Order နံပါတ် / စားပွဲ / ဖောက်သည် ရှာရန်…')}
            />
            <button className="btn ghost icon-text toolbar-filter-btn toolbar-search-submit" onClick={runSearch}
              aria-label={t('ရှာမည်')} title={t('ရှာမည်')}>
              <Icon name="search" size={15} />
              <span className="hide-mobile">{t('ရှာမည်')}</span>
            </button>
          </div>

          <DateRangeField from={from} to={to} onFrom={setFrom} onTo={setTo} />

          <div className="toolbar-end">
            <div className="category-select-wrapper toolbar-select">
              <Icon name="filter" size={15} />
              <select value={status} onChange={e => setStatus(e.target.value)} aria-label={t('အခြေအနေ')}>
                <option value="paid">{t('ရှင်းပြီး')}</option>
                <option value="void">{t('ပယ်ဖျက်ပြီး')}</option>
                <option value="all">{t('အားလုံး')}</option>
              </select>
            </div>
            <button className="btn ghost icon-text toolbar-icon-btn" onClick={exportHistory}
              disabled={!history.length} aria-label="CSV" title="CSV">
              <Icon name="download" size={15} />
              <span className="hide-mobile">CSV</span>
            </button>
          </div>
        </div>
      </div>

      <div className="stat-grid compact">
        <div className="stat-card">
          <span>{t('အရောင်း')}</span>
          <strong>{money(salesTotal)}</strong>
          <small className="muted">{orderCount} Order</small>
        </div>
        <div className="stat-card indigo">
          <span>{t('ပျမ်းမျှ ဘောက်ချာ')}</span>
          <strong>{money(avgTicket)}</strong>
        </div>
        <div className="stat-card amber">
          <span>{t('လျော့ငွေ')}</span>
          <strong>{money(discountTotal)}</strong>
        </div>
        <div className="stat-card">
          <span>Order</span>
          <strong>{orderCount}</strong>
          <small className="muted">{t('ရှင်းပြီး')}</small>
        </div>
      </div>

      {history.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
        <>
          {Object.entries(groups).map(([day, rows]) => {
            const full = dayTotals[day] || { count: rows.length, total: 0 };
            return (
              <section className="panel sales-day" key={day}>
                <div className="panel-head sales-day-head">
                  <h3><Icon name="calendar" size={16} /> {day}</h3>
                  <div className="sales-day-total">
                    <span className="badge">{full.count} Order</span>
                    <strong>{money(full.total)}</strong>
                  </div>
                </div>
                <div className="list">
                  {rows.map(o => (
                    <button className="list-row" key={o.id} onClick={() => openReceipt(o.id)}>
                      <span className="quick-ico sm">
                        <Icon name="receipt" size={17} />
                      </span>
                      <div className="grow">
                        <strong>#{o.order_no}
                          {o.status === 'void' && <span className="badge bad" style={{ marginLeft: 6 }}>{t('ပယ်ဖျက်ပြီး')}</span>}
                        </strong>
                        <small className="muted">
                          {o.table_name || (o.type === 'delivery' ? t('ပို့ဆောင်') : o.type === 'takeaway' ? t('ပါဆယ်') : t('စားပွဲ'))}
                          {o.customer_name ? ` · ${o.customer_name}` : ''}
                          {' · '}{o.item_count} {t('မျိုး')} · {o.closed_at?.slice(11, 16)}
                        </small>
                      </div>
                      <span className="amount">{money(o.total)}</span>
                      <Icon name="arrow" size={16} className="sales-row-go" />
                    </button>
                  ))}
                </div>
              </section>
            );
          })}

          <Pagination
            currentPage={page}
            pageSize={pageSize}
            totalItems={history.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            label={t('Order')}
          />
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
