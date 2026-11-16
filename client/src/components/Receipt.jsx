import React from 'react';
import { money } from '../api.js';
import { useI18n } from '../i18n.jsx';

const METHOD_KEY = {
  cash: 'လက်ငင်း', kbzpay: 'KBZPay', wavepay: 'WavePay', bank: 'ဘဏ်/ကတ်', credit: 'အကြွေး'
};

export default function Receipt({ order, settings, tableName }) {
  const { t } = useI18n();
  const items = (order.items || []).filter(i => i.status !== 'cancelled');
  const typeLabel = order.type === 'dine_in' ? (tableName || t('စားပွဲ'))
    : order.type === 'delivery' ? t('ပို့ဆောင်') : t('ပါဆယ်');

  return (
    <div className="receipt-sheet">
      <div className="r-center">
        <div className="r-shop">{settings.shop_name}</div>
        {settings.shop_name_en && <div className="r-small">{settings.shop_name_en}</div>}
        {settings.address && <div className="r-small">{settings.address}</div>}
        {settings.phone && <div className="r-small">☎ {settings.phone}</div>}
      </div>
      <hr />
      <div className="r-row"><span>Order</span><span>#{order.order_no}</span></div>
      <div className="r-row"><span>{t('အမျိုးအစား')}</span><span>{typeLabel}</span></div>
      <div className="r-row"><span>{t('ရက်စွဲ')}</span><span>{order.closed_at || order.opened_at}</span></div>
      <hr />
      <table className="r-items">
        <tbody>
          {items.map(it => (
            <tr key={it.id}>
              <td>{it.is_alcohol ? '18+ ' : ''}{it.name}<div className="r-small">× {it.qty}</div>
                {it.modifiers?.length > 0 && <div className="r-small">{it.modifiers.map(m => m.name).join(', ')}</div>}
              </td>
              <td className="r-right">{money(Math.round(it.price * it.qty))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr />
      <div className="r-row"><span>{t('စုစုပေါင်း')}</span><span>{money(order.subtotal)}</span></div>
      {order.discount > 0 && <div className="r-row"><span>{t('လျော့ငွေ')}</span><span>-{money(order.discount)}</span></div>}
      {order.tax > 0 && <div className="r-row"><span>{t('အခွန်')}</span><span>{money(order.tax)}</span></div>}
      {order.service > 0 && <div className="r-row"><span>{t('ဝန်ဆောင်ခ')}</span><span>{money(order.service)}</span></div>}
      <div className="r-row r-total"><span>{t('ကျသင့်ငွေ')}</span><span>{money(order.total)}</span></div>
      {(order.payments || []).map(p => (
        <div className="r-row" key={p.id}><span>{t(p.method_name || METHOD_KEY[p.method] || p.method)}</span><span>{money(p.amount)}</span></div>
      ))}
      <hr />
      <div className="r-center r-small">{settings.footer}</div>
      {items.some(i => i.is_alcohol) && (
        <div className="r-center r-small r-alc-note">{t('အရက်ပါဝင်သည် — အသက် ၁၈ နှစ်အောက် မရောင်းချရပါ')}</div>
      )}
    </div>
  );
}
