import React, { useEffect, useState, useMemo } from 'react';
import { api, money, today } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, ModalFrame } from '../components/ui.jsx';

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
            <div className="scm-value">{(data.kitchenCount || 0) + (data.barCount || 0)}</div>
            <div className="scm-sub">
              <span className="scm-pill orange">🍳 မီးဖို {data.kitchenCount || 0}</span>
              <span className="scm-pill cyan">🍹 ဘား {data.barCount || 0}</span>
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
            <div className="dcs-item">
              <span className="dcs-label">{t('မီးဖို')}</span>
              <strong className="dcs-val text-orange">{data.kitchenCount || 0} {t('ပွဲ')}</strong>
            </div>
            <div className="dcs-item">
              <span className="dcs-label">{t('ဘား')}</span>
              <strong className="dcs-val text-cyan">{data.barCount || 0} {t('ပွဲ')}</strong>
            </div>
            <div className="dcs-item">
              <span className="dcs-label">{t('အော်ဒါ')}</span>
              <span className="dcs-status">{data.openOrders?.length || 0} {t('စားပွဲ')}</span>
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
                        title={`${wb.date}: ${money(wb.total)} (${wb.orders} orders)`}
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
                      <strong>{t(METHOD_KEY[m.method] || m.method)}</strong>
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
        <section className="panel modern-panel">
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
              {sum.recentOrders.map(ro => (
                <div className="recent-order-card" key={ro.id}>
                  <div className="roc-left">
                    <div className="roc-order-no">#{ro.order_no}</div>
                    <div className="roc-meta">
                      <span className="roc-table">
                        <Icon name={ro.type === 'dine_in' ? 'table' : 'box'} size={13} />
                        {ro.table_name || (ro.type === 'dine_in' ? 'စားပွဲ' : 'ပါဆယ်')}
                      </span>
                      {ro.source === 'online' && (
                        <span className="roc-online-pill">📱 အွန်လိုင်း</span>
                      )}
                      <span className="roc-time">{ro.opened_at ? ro.opened_at.slice(11, 16) : ''}</span>
                    </div>
                  </div>
                  <div className="roc-right">
                    <strong className="roc-total">{money(ro.total)}</strong>
                    <span className={`status-pill ${ro.status}`}>
                      {ro.status === 'open' ? 'ဖွင့်ထား' : ro.status === 'paid' ? 'ရှင်းပြီး' : 'ပယ်ဖျက်'}
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
          <div className="modal-head">
              <h3>📱 {t('QR မျှဝေရန်')}</h3>
              <button className="icon-btn" onClick={() => setCatalogModalOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="csm-body">
              <p className="csm-desc">
                {t('QR Code စကင်ဖတ်၍ မီနူးကြည့်ရှုပြီး ဖုန်းမှ တိုက်ရိုက်မှာယူနိုင်ပါသည်')}
              </p>

              {/* Table Selector for Specific QR Code */}
              <div className="csm-table-filter">
                <label><b>{t('စားပွဲရွေးရန် (ရွေးချယ်နိုင်သည်)')}</b></label>
                <select
                  value={selectedTableForQr}
                  onChange={e => setSelectedTableForQr(e.target.value)}
                >
                  <option value="">-- ဆိုင်အထွေထွေ မီနူး --</option>
                  {(data.tables || []).map(tb => (
                    <option key={tb.id} value={tb.id}>
                      {tb.name} ({tb.zone || 'အပြင်'}) QR
                    </option>
                  ))}
                </select>
              </div>

              {/* URL Display Box */}
              <div className="csm-url-box">
                <input type="text" readOnly value={catalogUrl} />
                <button className="btn sm" onClick={copyCatalogLink}>
                  <Icon name="copy" size={15} /> {copied ? t('ကူးပြီးပါပြီ!') : t('လင့်ခ် ကူးယူ')}
                </button>
              </div>

              {/* Simulated QR Code Card */}
              <div className="csm-qr-preview">
                <div className="csm-qr-card">
                  <div className="csm-qr-shop-name">{data.settings?.shop_name || 'စည်တော်ကြီး စားသောက်ဆိုင်'}</div>
                  <div className="csm-qr-sub">
                    {selectedTableForQr
                      ? `${(data.tables || []).find(t => String(t.id) === String(selectedTableForQr))?.name || 'စားပွဲ'} QR`
                      : 'ဖုန်းဖြင့် စကင်ဖတ်၍ မီနူးကြည့်ပါ'}
                  </div>
                  
                  {/* High quality clean vector QR Code graphic representation */}
                  <div className="qr-code-graphic">
                    <svg viewBox="0 0 160 160" width="160" height="160" fill="currentColor">
                      <rect width="160" height="160" fill="white" />
                      {/* Top Left Finder */}
                      <rect x="15" y="15" width="40" height="40" fill="black" />
                      <rect x="22" y="22" width="26" height="26" fill="white" />
                      <rect x="27" y="27" width="16" height="16" fill="black" />
                      {/* Top Right Finder */}
                      <rect x="105" y="15" width="40" height="40" fill="black" />
                      <rect x="112" y="22" width="26" height="26" fill="white" />
                      <rect x="117" y="27" width="16" height="16" fill="black" />
                      {/* Bottom Left Finder */}
                      <rect x="15" y="105" width="40" height="40" fill="black" />
                      <rect x="22" y="112" width="26" height="26" fill="white" />
                      <rect x="27" y="117" width="16" height="16" fill="black" />
                      {/* Data Pattern */}
                      <rect x="65" y="20" width="10" height="10" fill="black" />
                      <rect x="85" y="20" width="10" height="10" fill="black" />
                      <rect x="65" y="40" width="10" height="10" fill="black" />
                      <rect x="80" y="50" width="10" height="10" fill="black" />
                      <rect x="20" y="65" width="10" height="10" fill="black" />
                      <rect x="40" y="65" width="10" height="10" fill="black" />
                      <rect x="60" y="65" width="10" height="10" fill="black" />
                      <rect x="80" y="70" width="10" height="10" fill="black" />
                      <rect x="100" y="65" width="10" height="10" fill="black" />
                      <rect x="120" y="65" width="10" height="10" fill="black" />
                      <rect x="140" y="75" width="10" height="10" fill="black" />
                      <rect x="65" y="90" width="10" height="10" fill="black" />
                      <rect x="85" y="90" width="10" height="10" fill="black" />
                      <rect x="105" y="90" width="10" height="10" fill="black" />
                      <rect x="125" y="105" width="10" height="10" fill="black" />
                      <rect x="65" y="110" width="10" height="10" fill="black" />
                      <rect x="85" y="125" width="10" height="10" fill="black" />
                      <rect x="105" y="125" width="10" height="10" fill="black" />
                      <rect x="135" y="135" width="10" height="10" fill="black" />
                      {/* Logo in center */}
                      <rect x="66" y="66" width="28" height="28" rx="6" fill="#06b6d4" />
                      <text x="80" y="86" fontSize="16" fontWeight="bold" fill="white" textAnchor="middle">စည်</text>
                    </svg>
                  </div>

                  <div className="csm-qr-hint">Scan with Camera or QR App</div>
                </div>
              </div>

              <div className="csm-actions">
                <button className="btn outline" onClick={copyCatalogLink}>
                  <Icon name="copy" size={16} /> {t('လင့်ခ် ကူးယူမည်')}
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
