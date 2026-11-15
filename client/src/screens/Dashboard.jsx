import React, { useEffect, useState } from 'react';
import { api, money, today } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon } from '../components/ui.jsx';

const METHOD_KEY = { cash: 'လက်ငင်း', kbzpay: 'KBZPay', wavepay: 'WavePay', bank: 'ဘဏ်/ကတ်', credit: 'အကြွေး' };

export default function Dashboard({ data, go }) {
  const { t } = useI18n();
  const [sum, setSum] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => api(`/reports/summary?date=${today()}`).then(s => alive && setSum(s)).catch(() => {});
    load();
    const timer = setInterval(load, 20000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>{t('ဒက်ရှ်ဘုတ်')}</h2>
          <p className="muted small">{t('ယနေ့ အရောင်း အခြေအနေ တစ်ချက်ကြည့်')}</p>
        </div>
        <button className="btn" onClick={() => go('tables')}><Icon name="plus" size={16} /> {t('အရောင်း စတင်')}</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span><Icon name="chart" size={14} /> {t('ယနေ့ အရောင်း')}</span>
          <strong>{money(sum?.total || 0)}</strong>
          <small className="muted">{sum?.orderCount || 0} {t('order ရှင်းပြီး')}</small>
        </div>
        <div className="stat-card amber">
          <span><Icon name="receipt" size={14} /> {t('ပျမ်းမျှ ဘောက်ချာ')}</span>
          <strong>{money(sum?.avg || 0)}</strong>
          <small className="muted">{t('တစ်ခုလျှင်')}</small>
        </div>
        <div className="stat-card indigo">
          <span><Icon name="table" size={14} /> {t('ဖွင့်ထားသည်')}</span>
          <strong>{data.openOrders.length}</strong>
          <small className="muted">{t('စားပွဲ/ပါဆယ် order')}</small>
        </div>
        <div className="stat-card rose">
          <span><Icon name="tag" size={14} /> {t('လျော့ငွေ / အခွန်')}</span>
          <strong>{money((sum?.discount || 0) + (sum?.tax || 0))}</strong>
          <small className="muted">{t('ယနေ့')}</small>
        </div>
        <div className="stat-card">
          <span><Icon name="chart" size={14} /> {t('အမြတ်')}</span>
          <strong>{money(sum?.profit || 0)}</strong>
          <small className="muted">{t('ကုန်ကျစရိတ်')} {money(sum?.cost || 0)}</small>
        </div>
        <div className="stat-card rose" style={{ cursor: 'pointer' }} onClick={() => go('inventory')}>
          <span><Icon name="box" size={14} /> {t('လက်ကျန်နည်း')}</span>
          <strong>{data.lowStockCount || 0}</strong>
          <small className="muted">{t('ပြတ်တော့မည်')}</small>
        </div>
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head"><h3><Icon name="fire" size={16} /> {t('အရောင်းရဆုံး ဟင်းများ')}</h3></div>
          {(!sum || sum.topItems.length === 0) ? <div className="empty">{t('ဒေတာ မရှိသေးပါ')}</div> : (
            <div className="list">
              {sum.topItems.map((item, i) => (
                <div className="list-row static" key={item.name}>
                  <div className={`rank ${i === 0 ? 'gold' : ''}`}>{i + 1}</div>
                  <div className="grow">
                    <strong>{item.name}</strong>
                    <small className="muted">{item.qty} {t('ပွဲ')}</small>
                  </div>
                  <span className="amount">{money(item.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head"><h3><Icon name="cash" size={16} /> {t('ငွေပေးချေမှု အခြေအနေ')}</h3></div>
          {(!sum || sum.byMethod.length === 0) ? <div className="empty">{t('ဒေတာ မရှိသေးပါ')}</div> : (
            <div className="list">
              {sum.byMethod.map(m => (
                <div className="list-row static" key={m.method}>
                  <div className="grow">
                    <strong>{t(METHOD_KEY[m.method] || m.method)}</strong>
                    <small className="muted">{m.count} {t('ကြိမ်')}</small>
                  </div>
                  <span className="amount">{money(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="panel-actions">
            <button className="btn ghost" onClick={() => go('reports')}>{t('အစီရင်ခံစာ ကြည့်')}</button>
            <button className="btn" onClick={() => go('tables')}>{t('အရောင်း စတင်')}</button>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h3>{t('ဝင်ငွေ/အသုံးစရိတ်')}</h3></div>
        <div className="bars">
          <div className="bar-row"><span>{t('အရောင်း')}</span><div className="bar"><i style={{ width: '100%' }} /></div><b>{money(sum?.total || 0)}</b></div>
          <div className="bar-row"><span>{t('အသုံးစရိတ်')}</span><div className="bar amber"><i style={{ width: `${sum?.total ? Math.min(100, (sum.expenses / sum.total) * 100) : 0}%` }} /></div><b>{money(sum?.expenses || 0)}</b></div>
        </div>
      </section>
    </div>
  );
}
