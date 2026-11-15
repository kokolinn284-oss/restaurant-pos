import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, ThemeToggle, LangToggle } from '../components/ui.jsx';

export default function Login({ onLogin }) {
  const { t, isEn } = useI18n();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [shop, setShop] = useState({ shop_name: 'စည်တော်ကြီး စားသောက်ဆိုင်', shop_name_en: 'Sintawgyi Restaurant' });

  useEffect(() => {
    fetch('/api/shop').then(r => r.json()).then(setShop).catch(() => {});
  }, []);

  const submit = async (value) => {
    if (!value || busy) return;
    setBusy(true);
    try {
      const { staff, token } = await api('/auth/login', { method: 'POST', body: JSON.stringify({ pin: value }) });
      onLogin({ staff, token });
    } catch (e) {
      setErr(e.message);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const press = (k) => {
    setErr('');
    if (k === 'back') setPin(p => p.slice(0, -1));
    else if (k === 'ok') submit(pin);
    else {
      const next = pin.length < 4 ? pin + k : pin;
      setPin(next);
      if (next.length === 4) submit(next);
    }
  };

  const title = isEn ? (shop.shop_name_en || shop.shop_name) : shop.shop_name;
  const sub = isEn ? shop.shop_name : shop.shop_name_en;

  return (
    <div className="login-wrap">
      <div className="login-tools">
        <LangToggle />
        <ThemeToggle />
      </div>

      <div className="login-card">
        <div className="login-logo"><Icon name="bowl" size={36} /></div>
        <h1>{title}</h1>
        <div className="shop-en">{sub}</div>
        <p className="muted" style={{ margin: '14px 0 0' }}>{t('PIN ကို ထည့်ပါ')}</p>

        <div className="pin-dots" aria-label="PIN">
          {[0, 1, 2, 3].map(i => (
            <span key={i} className={`dot-pin ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>

        {err && <div className="error-text">{err}</div>}

        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => (
            <button key={k} className="key" onClick={() => press(k)}>{k}</button>
          ))}
          <button className="key subtle" onClick={() => press('back')} aria-label="back">⌫</button>
          <button className="key" onClick={() => press('0')}>0</button>
          <button className="key go" disabled={busy || !pin} onClick={() => press('ok')}>
            {busy ? '…' : t('ဝင်ရန်')}
          </button>
        </div>

        <div className="login-customer-link" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          <button
            type="button"
            className="btn ghost full"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--r-sm)' }}
            onClick={() => { window.location.hash = '#/catalog'; }}
          >
            <Icon name="menu" size={16} />
            <span>{t('အွန်လိုင်းမီနူး ကြည့်ရန်')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
