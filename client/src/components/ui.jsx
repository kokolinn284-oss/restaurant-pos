import React, { useEffect, useState } from 'react';
import { getTheme, toggleTheme } from '../theme.js';
import { useI18n } from '../i18n.jsx';

const paths = {
  table: 'M3 9h18M5 9v10M19 9v10M4 5h16v4H4z',
  home: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  fire: 'M12 3c1 4 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 0-8z',
  menu: 'M4 6h16M4 12h16M4 18h10',
  box: 'M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8',
  users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M16 11a3 3 0 1 0 0-6M18 15c2 .5 4 2 4 5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1a7 7 0 0 0-2-1l-.5-2h-5L9 7a7 7 0 0 0-2 1L5 7l-2 4 2 1a7 7 0 0 0 0 2l-2 1 2 4 2-1a7 7 0 0 0 2 1l.5 2h5l.5-2a7 7 0 0 0 2-1l2 1 2-4-2-1a7 7 0 0 0 0-2z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12l5 5L20 6',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  back: 'M15 5l-7 7 7 7',
  cash: 'M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  moon: 'M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5z',
  lang: 'M3 5h12M9 3v2c0 5-3 8-6 9M5 9c0 4 3 6 7 7M13 21l4-10 4 10M15 17h6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  cart: 'M3 4h2l2.4 11h10.2L20 8H6M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  tag: 'M20 13l-7 7-9-9V4h7l9 9zM7.5 7.5h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  receipt: 'M5 3h14v18l-2-1.5L15 21l-3-1.5L9 21l-2-1.5L5 21zM8 8h8M8 12h8M8 16h5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  edit: 'M4 20h4L20 8l-4-4L4 16zM14 6l4 4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  spark: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z',
  bowl: 'M4 11h16a8 8 0 0 1-16 0zM8 7c0-2 1-2 1-4M12 7c0-2 1-2 1-4M16 7c0-2 1-2 1-4',
  receipt2: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  shield: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9 12l2 2 4-4',
  calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 19.5h.01',
  beer: 'M6 8h10v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zM16 10h3a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3M9 4c0-1.2 1-1.2 1-2.4M13 4c0-1.2 1-1.2 1-2.4M9 12v5M13 12v5'
};

export function Icon({ name, size = 20, strokeWidth = 1.8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] || paths.menu} />
    </svg>
  );
}

export function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(getTheme());
  const { t } = useI18n();
  useEffect(() => {
    const sync = (e) => setTheme(e.detail || getTheme());
    window.addEventListener('pos-theme', sync);
    return () => window.removeEventListener('pos-theme', sync);
  }, []);
  const flip = () => setTheme(toggleTheme());
  return (
    <button className={`icon-btn ${className}`} onClick={flip}
      title={theme === 'dark' ? t('အလင်း') : t('အမှောင်')}
      aria-label={theme === 'dark' ? t('အလင်း') : t('အမှောင်')}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

export function LangToggle({ compact = true }) {
  const { lang, setLang } = useI18n();
  return (
    <div className="seg" role="group" aria-label="Language">
      <button className={lang === 'my' ? 'on' : ''} onClick={() => setLang('my')}>မြ</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={14} />}{o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="close"><Icon name="close" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Empty({ text }) {
  return <div className="empty">{text}</div>;
}

export function Switch({ on, onClick, label }) {
  return (
    <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={onClick}
      role="switch" aria-checked={!!on} aria-label={label}><i /></button>
  );
}
