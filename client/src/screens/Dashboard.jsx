import React, { useEffect, useState, useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api, money, today } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, ModalFrame, stationLabel } from '../components/ui.jsx';

const METHOD_KEY = {
  cash: 'လက်ငင်း',
  kbzpay: 'KBZPay',
  wavepay: 'WavePay',
  bank: 'ဘဏ်/ကတ်',
  credit: 'အကြွေး'
};

const METHOD_COLORS = {
  cash: 'var(--brand)',
  kbzpay: '#005baa',
  wavepay: '#fdb913',
  bank: 'var(--indigo)',
  credit: 'var(--rose)'
};

export default function Dashboard({ data, go }) {
  const { t, isEn } = useI18n();
  const stations = data.stations?.length
    ? data.stations
    : [
        { value: 'kitchen', label: t('မီးဖိုချောင်'), label_en: 'Kitchen' },
        { value: 'bar', label: t('ဘား'), label_en: 'Bar' },
      ];
  const countOf = (value) => {
    const found = (data.stationCounts || []).find((c) => c.station === value);
    if (found) return found.c;
    if (value === 'kitchen') return data.kitchenCount || 0;
    if (value === 'bar') return data.barCount || 0;
    return 0;
  };
  const totalCooking = stations.reduce((s, st) => s + countOf(st.value), 0);
  const [sum, setSum] = useState(null);
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedTableForQr, setSelectedTableForQr] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () =>
      api(`/reports/summary?date=${today()}`)
        .then(s => alive && setSum(s))
        .catch(() => {});
    load();
    const timer = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const catalogUrl = useMemo(() => {
    const origin = window.location.origin;
    const base = `${origin}/#/catalog`;
    return selectedTableForQr ? `${base}?table=${selectedTableForQr}` : base;
  }, [selectedTableForQr]);

  const qrTable = useMemo(
    () => (data.tables || []).find(tb => String(tb.id) === String(selectedTableForQr)),
    [data.tables, selectedTableForQr]
  );

  const copyCatalogLink = () => {
    navigator.clipboard.writeText(catalogUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const openCustomerCatalog = () => {
    window.open(catalogUrl, '_blank');
  };

  // Payment totals percentage calculation
  const paymentBreakdown = useMemo(() => {
    const methods = sum?.byMethod || [];
    const totalAmount = methods.reduce((acc, m) => acc + m.amount, 0) || 1;
    return methods.map(m => ({
      ...m,
      pct: Math.min(100, Math.round((m.amount / totalAmount) * 100))
    }));
  }, [sum]);

  // 7-day trend calculation
  const weeklyBars = useMemo(() => {
    const trend = sum?.weeklyTrend || [];
    const maxVal = Math.max(...trend.map(t => t.total), 1);
    return trend.map(t => ({
      ...t,
      heightPct: Math.max(10, Math.round((t.total / maxVal) * 100))
    }));
  }, [sum]);

  const quickActions = [
    { key: 'tables', label: 'ကောင်တာ', icon: 'receipt', color: 'cyan', action: () => go('tables') },
    { key: 'catalog', label: 'အွန်လိုင်းမီနူး', icon: 'menu', color: 'emerald', action: () => setCatalogModalOpen(true) },
    { key: 'tables_view', label: 'စားပွဲများ', icon: 'table', color: 'indigo', action: () => go('tables') },
    { key: 'kitchen', label: 'မီးဖိုချောင်', icon: 'fire', color: 'orange', action: () => go('kitchen') },
    { key: 'menu', label: 'မီနူးစာရင်း', icon: 'tag', color: 'violet', action: () => go('menu') },
    { key: 'inventory', label: 'ကုန်ကြမ်းစတော့', icon: 'box', color: 'amber', action: () => go('inventory') },
    { key: 'members', label: 'အသင်းဝင်များ', icon: 'users', color: 'blue', action: () => go('members') },
    { key: 'expenses', label: 'အသုံးစရိတ်', icon: 'cash', color: 'rose', action: () => go('expenses') },
    { key: 'reports', label: 'အစီရင်ခံစာ', icon: 'chart', color: 'sky', action: () => go('reports') },
    { key: 'settings', label: 'ဆက်တင်', icon: 'gear', color: 'slate', action: () => go('settings') }
  ];

  return (
    <div className="dashboard-container stack">
      {/* Page Header */}
      <div className="dashboard-head page-head">
        <div>
          <div className="dash-badge-row">
            <span className="live-pill"><span className="pulse-dot" /> {t('တိုက်ရိုက်')}</span>
            <span className="date-badge">{sum?.date || today()}</span>
          </div>
          <h2 className="dash-title">{t('ဒက်ရှ်ဘုတ်')}</h2>
          <p className="muted small">{t('ဆိုင်တွင်း လုပ်ငန်းဆောင်တာနှင့် အရောင်းအကျဉ်း')}</p>
        </div>

        <div className="dash-head-actions">
          <button className="btn outline sm" onClick={() => setCatalogModalOpen(true)}>
            <Icon name="menu" size={16} /> {t('အွန်လိုင်းမီနူး')}
          </button>
          <button className="btn sm" onClick={() => go('tables')}>
            <Icon name="plus" size={16} /> {t('အရောင်း စတင်')}
          </button>
        </div>
      </div>

      {/* Quick Action Shortcuts Bar */}
      <section className="dash-quick-shortcuts-panel">
        <div className="dqsp-header">
          <span className="dqsp-title"><Icon name="more" size={15} /> {t('အမြန်လုပ်ဆောင်ချက်')}</span>
        </div>
        <div className="dash-shortcuts-scroller">
          {quickActions.map(qa => (
            <button
              key={qa.key}
              className={`shortcut-chip tone-${qa.color}`}
              onClick={qa.action}
              title={t(qa.label)}
            >
              <span className="sc-icon"><Icon name={qa.icon} size={15} /></span>
              <span className="sc-label">{t(qa.label)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 6 Primary Metric KPI Cards */}
      <section className="dash-kpi-section">
        <div className="dash-section-title">
          <h3><Icon name="chart" size={17} /> {t('ယနေ့ အရောင်းအကျဉ်း')}</h3>
        </div>

        <div className="stat-grid-modern">
          {/* Card 1: Today Revenue */}
          <div className="stat-card-modern cyan">
            <div className="scm-top">
              <span className="scm-title">{t('ယနေ့ အရောင်း')}</span>
              <span className="scm-icon"><Icon name="chart" size={18} /></span>
            </div>
            <div className="scm-value">{money(sum?.total || 0)}</div>
            <div className="scm-sub">
              <span className="scm-pill positive">{sum?.orderCount || 0} {t('ဘောက်ချာ')}</span>
              <span className="scm-trend">{t('ယနေ့')}</span>
            </div>
          </div>

          {/* Card 2: Average Voucher */}
          <div className="stat-card-modern amber">
            <div className="scm-top">
              <span className="scm-title">{t('ပျမ်းမျှ ဘောက်ချာ')}</span>
              <span className="scm-icon"><Icon name="receipt" size={18} /></span>
            </div>
            <div className="scm-value">{money(sum?.avg || 0)}</div>
            <div className="scm-sub">
              <span className="scm-desc">{t('ဘောက်ချာ ပျမ်းမျှတန်ဖိုး')}</span>
            </div>
          </div>

          {/* Card 3: Active Dining Orders */}
          <div className="stat-card-modern indigo clickable" onClick={() => go('tables')}>
            <div className="scm-top">
              <span className="scm-title">{t('စားပွဲ & အော်ဒါ')}</span>
              <span className="scm-icon"><Icon name="table" size={18} /></span>
            </div>
            <div className="scm-value">{data.openOrders?.length || 0}</div>
            <div className="scm-sub">
              <span className="scm-pill indigo">{t('စားပွဲ & ပါဆယ်')}</span>
              {(sum?.onlineOrderCount || 0) > 0 && (
                <span className="scm-pill rose">📱 {sum.onlineOrderCount} {t('အွန်လိုင်း')}</span>
              )}
            </div>
          </div>

          {/* Card 4: Kitchen & Bar Status */}
          <div className="stat-card-modern orange clickable" onClick={() => go('kitchen')}>
            <div className="scm-top">
              <span className="scm-title">{t('မီးဖို & ဘား')}</span>
              <span className="scm-icon"><Icon name="fire" size={18} /></span>
            </div>
            <div className="scm-value">{totalCooking}</div>
            <div className="scm-sub">
              {stations.map((st) => (
                <span
                  key={st.value}
                  className={`scm-pill ${st.value === 'kitchen' ? 'orange' : st.value === 'bar' ? 'cyan' : 'indigo'}`}
                >
                  {st.value === 'kitchen' ? '🍳' : st.value === 'bar' ? '🍹' : '🏷'}{' '}
                  {stationLabel(stations, st.value, isEn)} {countOf(st.value)}
                </span>
              ))}
            </div>
          </div>

          {/* Card 5: Estimated Profit */}
          <div className="stat-card-modern emerald">
            <div className="scm-top">
              <span className="scm-title">{t('ခန့်မှန်း အမြတ်')}</span>
              <span className="scm-icon"><Icon name="cash" size={18} /></span>
            </div>
            <div className="scm-value">{money(sum?.profit || 0)}</div>
            <div className="scm-sub">
              <span className="scm-pill positive">{sum?.margin || 0}% {t('အမြတ်')}</span>
              <span className="scm-desc">{t('ကုန်ကျစရိတ်')} {money(sum?.cost || 0)}</span>
            </div>
          </div>

          {/* Card 6: Low Stock Alerts */}
          <div className="stat-card-modern rose clickable" onClick={() => go('inventory')}>
            <div className="scm-top">
              <span className="scm-title">{t('စတော့သတိပေး')}</span>
              <span className="scm-icon"><Icon name="box" size={18} /></span>
            </div>
            <div className="scm-value">{data.lowStockCount || 0}</div>
            <div className="scm-sub">
              <span className="scm-pill danger">{t('ဖြည့်ရန်လို')}</span>
              <span className="scm-desc">{t('စတော့သတိပေး')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Business Domains Highlight Row (3 Interactive Cards) */}
      <section className="dash-domains-row">
        {/* Domain 1: Online Store & Catalog */}
        <div className="domain-card catalog-domain">
          <div className="dc-header">
            <div className="dc-icon-wrap cyan"><Icon name="menu" size={20} /></div>
            <div>
              <h4>{t('အွန်လိုင်း မီနူးစနစ်')}</h4>
              <p className="muted small">{t('ဖုန်းမှ တိုက်ရိုက်မှာယူနိုင်သည်')}</p>
            </div>
          </div>
          <div className="dc-stats">
            <div className="dcs-item">
              <span className="dcs-label">{t('ဟင်းပွဲများ')}</span>
              <strong className="dcs-val">{data.items?.length || 0} {t('ပွဲ')}</strong>
            </div>
            <div className="dcs-item">
              <span className="dcs-label">{t('အမျိုးအစား')}</span>
              <strong className="dcs-val">{data.categories?.length || 0} {t('ခု')}</strong>
            </div>
            <div className="dcs-item">
              <span className="dcs-label">{t('အခြေအနေ')}</span>
              <span className="dcs-status active">✓ {t('ဖွင့်ထား')}</span>
            </div>
          </div>
          <div className="dc-actions">
            <button className="btn outline sm" onClick={() => setCatalogModalOpen(true)}>
              <Icon name="share" size={14} /> {t('QR မျှဝေရန်')}
            </button>
            <button className="btn sm" onClick={openCustomerCatalog}>
              <Icon name="forward" size={14} /> {t('မီနူးကြည့်မည်')}
            </button>
          </div>
        </div>

        {/* Domain 2: Kitchen & Bar Workload */}
        <div className="domain-card kitchen-domain">
          <div className="dc-header">
            <div className="dc-icon-wrap orange"><Icon name="fire" size={20} /></div>
            <div>
              <h4>{t('မီးဖို & ဘား အလုပ်')}</h4>
              <p className="muted small">{t('ချက်ပြုတ်ပြင်ဆင်ဆဲ အမှာစာများ')}</p>
            </div>
          </div>
          <div className="dc-stats">
            {stations.map((st) => (
              <div className="dcs-item" key={st.value}>
                <span className="dcs-label">{stationLabel(stations, st.value, isEn)}</span>
                <strong className={`dcs-val ${st.value === 'kitchen' ? 'text-orange' : st.value === 'bar' ? 'text-cyan' : ''}`}>
                  {countOf(st.value)} {t('ပွဲ')}
                </strong>
              </div>
            ))}
            <div className="dcs-item">
              <span className="dcs-label">{t('အော်ဒါ')}</span>
              <span className="dcs-status">{data.openOrders?.length || 0} {t('စားပွဲများ')}</span>
            </div>
          </div>
          <div className="dc-actions">
            <button className="btn outline sm" onClick={() => go('kitchen')}>
              <Icon name="fire" size={14} /> {t('မီးဖိုချောင်ဖွင့်မည်')}
            </button>
          </div>
        </div>

        {/* Domain 3: Stock Health */}
        <div className="domain-card inventory-domain">
          <div className="dc-header">
            <div className="dc-icon-wrap amber"><Icon name="box" size={20} /></div>
            <div>
              <h4>{t('စတော့ အခြေအနေ')}</h4>
              <p className="muted small">{t('ကုန်ကြမ်းလက်ကျန်နှင့် အသုံးစရိတ်')}</p>
            </div>
          </div>
          <div className="dc-stats">
            <div className="dcs-item">
              <span className="dcs-label">{t('အသုံးစရိတ်')}</span>
              <strong className="dcs-val text-rose">{money(sum?.expenses || 0)}</strong>
            </div>
            <div className="dcs-item">
              <span className="dcs-label">{t('စတော့နည်း')}</span>
              <strong className="dcs-val text-amber">{data.lowStockCount || 0} {t('မျိုး')}</strong>
            </div>
            <div className="dcs-item">
              <span className="dcs-label">{t('အကြွေးကျန်')}</span>
              <span className="dcs-val">{money(sum?.creditOutstanding || 0)}</span>
            </div>
          </div>
          <div className="dc-actions">
            <button className="btn outline sm" onClick={() => go('inventory')}>
              <Icon name="box" size={14} /> {t('စတော့စစ်မည်')}
            </button>
          </div>
        </div>
      </section>

      {/* Analytics Charts & Visual Distribution (2-Column Grid) */}
      <div className="two-col">
        {/* Card 1: 7-Day Sales Trend Bar Chart */}
        <section className="panel modern-panel">
          <div className="panel-head">
            <h3><Icon name="chart" size={16} /> {t('၇ ရက် အရောင်းပြကွက်')}</h3>
          </div>
          {weeklyBars.length === 0 ? (
            <div className="empty">{t('ဒေတာ မရှိသေးပါ')}</div>
          ) : (
            <div className="weekly-chart-wrap">
              <div className="weekly-bars-container">
                {weeklyBars.map(wb => (
                  <div key={wb.date} className="wbc-col">
                    <div className="wbc-bar-track">
                      <div
                        className="wbc-bar-fill"
                        style={{ height: `${wb.heightPct}%` }}
                        title={`${wb.date}: ${money(wb.total)} (${wb.orders} ${t('အော်ဒါ')})`}
                      >
                        <span className="wbc-bar-tooltip">{money(wb.total)}</span>
                      </div>
                    </div>
                    <span className="wbc-date-label">
                      {wb.date.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Card 2: Payment Method Breakdown */}
        <section className="panel modern-panel">
          <div className="panel-head">
            <h3><Icon name="cash" size={16} /> {t('ငွေပေးချေမှု အချိုး')}</h3>
          </div>
          {paymentBreakdown.length === 0 ? (
            <div className="empty">{t('ဒေတာ မရှိသေးပါ')}</div>
          ) : (
            <div className="payment-distribution-list">
              {paymentBreakdown.map(m => (
                <div key={m.method} className="pdl-item">
                  <div className="pdl-head">
                    <div className="pdl-method-info">
                      <span className="pdl-dot" style={{ background: METHOD_COLORS[m.method] || 'var(--brand)' }} />
                      <strong>{t(m.method_name || METHOD_KEY[m.method] || m.method)}</strong>
                      <small className="muted">({m.count} {t('ကြိမ်')})</small>
                    </div>
                    <div className="pdl-amount-info">
                      <b>{money(m.amount)}</b>
                      <span className="pdl-pct">{m.pct}%</span>
                    </div>
                  </div>
                  <div className="pdl-progress-track">
                    <div
                      className="pdl-progress-bar"
                      style={{
                        width: `${m.pct}%`,
                        background: METHOD_COLORS[m.method] || 'var(--brand)'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Operational Feeds (Top Selling Dishes & Recent Orders) */}
      <div className="two-col">
        {/* Top 10 Selling Dishes */}
        <section className="panel modern-panel feed-panel">
          <div className="panel-head">
            <h3><Icon name="fire" size={16} /> {t('အရောင်းရဆုံး ဟင်းများ')}</h3>
          </div>
          {(!sum || sum.topItems.length === 0) ? (
            <div className="empty">{t('ဒေတာ မရှိသေးပါ')}</div>
          ) : (
            <div className="top-dishes-list">
              {sum.topItems.map((item, i) => (
                <div className="dish-rank-row" key={item.name}>
                  <div className={`rank-badge rank-${i + 1}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </div>
                  <div className="dish-info grow">
                    <strong>{item.name}</strong>
                    <small className="muted">{item.qty} {t('ပွဲ')}</small>
                  </div>
                  <span className="dish-amount">{money(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="feed-foot">
            <button className="btn ghost sm" onClick={() => go('reports')}>
              <Icon name="chart" size={14} /> {t('အစီရင်ခံစာ ကြည့်')}
            </button>
          </div>
        </section>

        {/* Recent Orders Activity Feed */}
        <section className="panel modern-panel">
          <div className="panel-head">
            <h3><Icon name="receipt" size={16} /> {t('လတ်တလော အော်ဒါ')}</h3>
            <button className="btn ghost sm" onClick={() => go('reports')}>{t('အားလုံး ကြည့်')}</button>
          </div>
          {(!sum || !sum.recentOrders || sum.recentOrders.length === 0) ? (
            <div className="empty">{t('ဒေတာ မရှိသေးပါ')}</div>
          ) : (
            <div className="recent-orders-list">
              {sum.recentOrders.slice(0, 6).map(ro => (
                <div className="recent-order-card" key={ro.id}>
                  <div className="roc-left">
                    <div className="roc-order-no">#{ro.order_no}</div>
                    <div className="roc-meta">
                      <span className="roc-table">
                        <Icon name={ro.type === 'dine_in' ? 'table' : 'box'} size={13} />
                        {ro.table_name || (ro.type === 'dine_in' ? t('စားပွဲ') : t('ပါဆယ်'))}
                      </span>
                      {ro.source === 'online' && (
                        <span className="roc-online-pill">📱 {t('အွန်လိုင်း')}</span>
                      )}
                      <span className="roc-time">{ro.opened_at ? ro.opened_at.slice(11, 16) : ''}</span>
                    </div>
                  </div>
                  <div className="roc-right">
                    <strong className="roc-total">{money(ro.total)}</strong>
                    <span className={`status-pill ${ro.status}`}>
                      {t(ro.status === 'open' ? 'ဖွင့်ထား' : ro.status === 'paid' ? 'ရှင်းပြီး' : 'ပယ်ဖျက်')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Online Customer Catalog / QR Code Modal */}
      {catalogModalOpen && (
        <ModalFrame className="catalog-share-modal" onClose={() => setCatalogModalOpen(false)}>
          <div className="csm-hero">
            <span className="csm-hero-icon"><Icon name="grid" size={20} /></span>
            <div className="csm-hero-text">
              <h3>{t('QR မျှဝေရန်')}</h3>
              <p>{t('QR Code စကင်ဖတ်၍ မီနူးကြည့်ရှုပြီး ဖုန်းမှ တိုက်ရိုက်မှာယူနိုင်ပါသည်')}</p>
            </div>
            <button className="csm-hero-close" onClick={() => setCatalogModalOpen(false)} aria-label="close">
              <Icon name="close" size={18} />
            </button>
          </div>

          <div className="csm-body">
            <div className="csm-main">
              <div className="csm-qr-card">
                <div className="csm-qr-top">
                  <span className="csm-qr-logo">စည်</span>
                  <div className="csm-qr-meta">
                    <div className="csm-qr-shop-name">{data.settings?.shop_name || 'စည်တော်ကြီး စားသောက်ဆိုင်'}</div>
                    <div className="csm-qr-sub">
                      {qrTable ? `${qrTable.name}${qrTable.zone ? ` · ${qrTable.zone}` : ''}` : t('ဆိုင်အထွေထွေ မီနူး')}
                    </div>
                  </div>
                </div>

                <div className="csm-qr-frame">
                  <QRCodeSVG
                    value={catalogUrl}
                    size={200}
                    level="M"
                    marginSize={2}
                    bgColor="#ffffff"
                    fgColor="#0f172a"
                    title={catalogUrl}
                  />
                </div>

                <div className="csm-qr-hint">
                  <Icon name="camera" size={13} /> {t('ဖုန်းဖြင့် စကင်ဖတ်၍ မီနူးကြည့်ပါ')}
                </div>
              </div>

              <div className="csm-controls">
                <label className="csm-field">
                  <span>{t('စားပွဲရွေးရန် (ရွေးချယ်နိုင်သည်)')}</span>
                  <select
                    value={selectedTableForQr}
                    onChange={e => setSelectedTableForQr(e.target.value)}
                  >
                    <option value="">{t('ဆိုင်အထွေထွေ မီနူး')}</option>
                    {(data.tables || []).map(tb => (
                      <option key={tb.id} value={tb.id}>
                        {tb.name} ({tb.zone || 'အပြင်'}) QR
                      </option>
                    ))}
                  </select>
                </label>

                <div className="csm-field">
                  <span>{t('မီနူး လင့်ခ်')}</span>
                  <input
                    className="csm-url-input"
                    type="text"
                    readOnly
                    value={catalogUrl}
                    onFocus={e => e.target.select()}
                  />
                </div>

                <div className="csm-perks">
                  <span><Icon name="menu" size={13} /> {t('မီနူး ကြည့်ရှုနိုင်သည်')}</span>
                  <span><Icon name="cart" size={13} /> {t('ဖုန်းမှ တိုက်ရိုက် မှာယူနိုင်သည်')}</span>
                  <span><Icon name="download" size={13} /> {t('App အဖြစ် သိမ်းထားနိုင်သည်')}</span>
                </div>

                <div className="csm-install-note">
                  <span className="csm-install-icon"><Icon name="download" size={16} /></span>
                  <div>
                    <strong>{t('ဖောက်သည်များ ဖုန်းတွင် App အဖြစ် သိမ်းထားနိုင်သည်')}</strong>
                    <span>{t('ဖုန်း home screen မှ မီနူးကို အမြန်ဖွင့်နိုင်ပါသည်။')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="csm-actions">
              <button className="btn outline" onClick={copyCatalogLink}>
                <Icon name={copied ? 'check' : 'copy'} size={16} />
                {copied ? t('ကူးပြီးပါပြီ!') : t('လင့်ခ် ကူးယူ')}
              </button>
              <button className="btn success" onClick={openCustomerCatalog}>
                <Icon name="forward" size={16} /> {t('ကတ်တလောက် ဖွင့်ရန်')}
              </button>
            </div>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}
