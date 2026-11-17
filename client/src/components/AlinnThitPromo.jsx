import React from 'react';
import { Icon } from './ui.jsx';
import { useI18n } from '../i18n.jsx';

const PHONE = '+959784343151';
const PHONE_LABEL = '09 784 343 151';
const WEBSITE = 'https://www.alinnthit.com';
const EMAIL = 'alinnthitservice@gmail.com';

export function AlinnThitPromo({ onClose }) {
  const { isEn } = useI18n();
  const L = (my, en) => (isEn ? en : my);

  return (
    <section className="alinn-promo" aria-label="ALINN THIT">
      {onClose && (
        <button type="button" className="ap-close" onClick={onClose} aria-label={L('ကြေညာ ပိတ်မည်', 'Dismiss promotion')}>
          <Icon name="close" size={15} />
        </button>
      )}

      <div className="ap-body">
        <span className="ap-kicker">
          <img className="ap-mark" src="/promo/alinn-thit-mark.svg" alt="" width="20" height="20" />
          ALINN THIT
        </span>
        <h3>
          {L(
            'သင့်လုပ်ငန်း တိုးတက်ဖို့ နည်းပညာဖြင့် အတူလက်တွဲစို့။',
            'Your Technology Partner for Business Growth.'
          )}
        </h3>
        <p>
          {L(
            'POS ဆော့ဝဲ၊ လုပ်ငန်းစီမံခန့်ခွဲမှု ဆော့ဝဲ၊ Website၊ Mobile App၊ CCTV နှင့် Network ဝန်ဆောင်မှုများ။',
            'POS & business software, websites, mobile apps, CCTV and network solutions.'
          )}
        </p>
        <div className="ap-tags">
          <span>POS Software</span>
          <span>Website</span>
          <span>Mobile App</span>
          <span>CCTV &amp; Network</span>
        </div>
        <div className="ap-actions">
          <a className="btn sm ap-call" href={`tel:${PHONE}`}>
            <Icon name="phone" size={15} /> {PHONE_LABEL}
          </a>
          <a className="btn outline sm ap-site" href={WEBSITE} target="_blank" rel="noreferrer">
            www.alinnthit.com
          </a>
          <a className="ap-mail" href={`mailto:${EMAIL}`}>{EMAIL}</a>
        </div>
      </div>

      <div className="ap-media">
        <picture>
          <source media="(max-width: 640px)" srcSet="/promo/alinn-thit-banner-mobile.webp" />
          <img
            src="/promo/alinn-thit-banner.webp"
            alt="ALINN THIT — Technology, IT Solutions & Digital Services"
            loading="lazy"
            decoding="async"
          />
        </picture>
      </div>
    </section>
  );
}

export function AlinnThitCredit({ className = '' }) {
  const { isEn } = useI18n();

  return (
    <div className={`alinn-credit ${className}`.trim()}>
      <img className="ac-mark" src="/promo/alinn-thit-mark.svg" alt="" width="28" height="28" />
      <span className="ac-text">
        <span className="ac-kicker">{isEn ? 'Developed by' : 'ရေးဆွဲသူ'}</span>
        <strong>ALINN THIT</strong>
        <span className="ac-tagline">
          {isEn ? 'Technology • IT Solutions • Digital Services' : 'နည်းပညာ • IT ဖြေရှင်းချက် • ဒစ်ဂျစ်တယ်ဝန်ဆောင်မှု'}
        </span>
      </span>
      <span className="ac-links">
        <a href={WEBSITE} target="_blank" rel="noreferrer">www.alinnthit.com</a>
        <span className="ac-dot">·</span>
        <a href={`tel:${PHONE}`}>{PHONE_LABEL}</a>
      </span>
    </div>
  );
}
