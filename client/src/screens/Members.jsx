import React, { useEffect, useMemo, useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, SearchBox } from '../components/ui.jsx';

const TIER_KEY = { normal: 'ပုံမှန်', silver: 'ငွေရောင်', gold: 'ရွှေရောင်' };
const TIER_ORDER = ['gold', 'silver', 'normal'];
const CREDIT_METHODS = [
  ['cash', 'လက်ငင်း'], ['kbzpay', 'KBZPay'], ['wavepay', 'WavePay'], ['bank', 'ဘဏ်/ကတ်']
];

export default function Members({ data, reload, showToast }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('members');
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('all');
  const [edit, setEdit] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', note: '' });
  const [credits, setCredits] = useState([]);
  const [settle, setSettle] = useState(null);

  const customers = data.customers || [];
  const totalPoints = useMemo(() => customers.reduce((s, c) => s + Number(c.points || 0), 0), [customers]);
  const creditTotal = Number(data.creditOutstanding || 0);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return customers.filter(c => {
      if (tier !== 'all' && (c.tier || 'normal') !== tier) return false;
      if (!needle) return true;
      return (c.name || '').toLowerCase().includes(needle) || (c.phone || '').includes(needle);
    });
  }, [customers, q, tier]);

  const loadCredits = async () => {
    try { setCredits(await api('/credits')); } catch {}
  };

  useEffect(() => { if (tab === 'credits') loadCredits(); }, [tab, data.creditOutstanding]);

  const add = async () => {
    if (!form.name.trim()) return showToast(t('အမည် ထည့်ပါ'));
    try {
      await api('/customers', { method: 'POST', body: JSON.stringify(form) });
      setAddOpen(false);
      setForm({ name: '', phone: '', note: '' });
      await reload();
      showToast(t('အဖွဲ့ဝင် ထည့်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const save = async () => {
    if (!edit) return;
    if (!(edit.name || '').trim()) return showToast(t('အမည် ထည့်ပါ'));
    try {
      await api(`/customers/${edit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: edit.name.trim(),
          phone: edit.phone || '',
          points: edit.points,
          tier: edit.tier || 'normal',
          note: edit.note || ''
        })
      });
      setEdit(null);
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const payCredit = async () => {
    try {
      await api(`/credits/${settle.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount: settle.pay, method: settle.method || 'cash' })
      });
      setSettle(null);
      await loadCredits();
      await reload();
      showToast(t('အကြွေး ဖြတ်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const initialOf = (name) => (name || '?').trim().slice(0, 1);

  return (
    <div className="stack members-page">
      <div className="page-head inline">
        <div>
          <h2>{t('အဖွဲ့ဝင်')}</h2>
          <p className="muted small">{t('အဖွဲ့ဝင်များ၊ အမှတ်များနှင့် အကြွေးများ စီမံခန့်ခွဲမှု')}</p>
        </div>
        <div className="row gap">
          <button className="btn" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={16} /> <span className="hide-mobile">{t('အဖွဲ့ဝင် အသစ်')}</span>
          </button>
        </div>
      </div>

      <div className="stat-grid compact">
        <div className="stat-card indigo">
          <span><Icon name="users" size={14} /> {t('အဖွဲ့ဝင်')}</span>
          <strong>{customers.length}</strong>
        </div>
        <div className="stat-card amber">
          <span><Icon name="spark" size={14} /> {t('စုစုပေါင်း အမှတ်')}</span>
          <strong>{totalPoints.toLocaleString()}</strong>
        </div>
        <div className="stat-card rose">
          <span><Icon name="receipt" size={14} /> {t('ကျန်ငွေ အကြွေး')}</span>
          <strong>{money(creditTotal)}</strong>
        </div>
      </div>

      <div className="tabs member-tabs">
        <button className={`tab ${tab === 'members' ? 'on' : ''}`} onClick={() => setTab('members')}>
          <Icon name="users" size={15} /> {t('အဖွဲ့ဝင်')} <span className="tab-count">{customers.length}</span>
        </button>
        <button className={`tab ${tab === 'credits' ? 'on' : ''}`} onClick={() => setTab('credits')}>
          <Icon name="receipt" size={15} /> {t('အကြွေး')}
          {creditTotal > 0 && <span className="tab-count rose">{money(creditTotal)}</span>}
        </button>
      </div>

      {tab === 'members' && (
        <>
          <div className="toolbar member-toolbar">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder={t('အမည် / ဖုန်း ရှာရန်…')}
            />
            <div className="chips member-tier-chips" role="group" aria-label={t('အဆင့်')}>
              <button className={`chip ${tier === 'all' ? 'on' : ''}`} onClick={() => setTier('all')}>
                {t('အားလုံး')}
              </button>
              {TIER_ORDER.map(k => (
                <button key={k} className={`chip ${tier === k ? 'on' : ''}`} onClick={() => setTier(k)}>
                  <span className={`tier-dot ${k}`} /> {t(TIER_KEY[k])}
                </button>
              ))}
            </div>
          </div>

          {list.length === 0 ? (
            <div className="empty member-empty">
              <span className="member-empty-icon"><Icon name="users" size={22} /></span>
              <strong>{t('အဖွဲ့ဝင် မတွေ့ပါ')}</strong>
              <p className="muted small">
                {q || tier !== 'all'
                  ? t('ရှာဖွေမှုနှင့် ကိုက်ညီသော အဖွဲ့ဝင် မတွေ့ပါ')
                  : t('အဖွဲ့ဝင် အသစ် ထည့်သွင်းပါ')}
              </p>
              <button className="btn sm" onClick={() => setAddOpen(true)}>
                <Icon name="plus" size={14} /> {t('အဖွဲ့ဝင် အသစ်')}
              </button>
            </div>
          ) : (
            <div className="member-grid">
              {list.map(c => {
                const tierKey = c.tier || 'normal';
                return (
                  <button className={`member-card tier-${tierKey}`} key={c.id} onClick={() => setEdit({ ...c })}>
                    <span className="member-avatar">{initialOf(c.name)}</span>
                    <span className="member-main">
                      <strong className="member-name" title={c.name}>{c.name}</strong>
                      <span className="member-meta">
                        <span className={`tier-chip ${tierKey}`}>{t(TIER_KEY[tierKey] || 'ပုံမှန်')}</span>
                        <Icon name="phone" size={12} />
                        <span className="member-ellipsis">{c.phone || t('ဖုန်းနံပါတ် မရှိ')}</span>
                      </span>
                    </span>
                    <span className="member-points">
                      <span className="member-points-value">
                        <Icon name="spark" size={13} />
                        <strong>{Number(c.points || 0).toLocaleString()}</strong>
                      </span>
                      <small>{t('အမှတ်')}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'credits' && (
        credits.length === 0 ? (
          <div className="empty member-empty">
            <span className="member-empty-icon rose"><Icon name="receipt" size={22} /></span>
            <strong>{t('အကြွေး မရှိပါ')}</strong>
            <p className="muted small">{t('အကြွေး မှတ်တမ်း မရှိသေးပါ')}</p>
          </div>
        ) : (
          <section className="panel member-credits">
            <div className="panel-head">
              <h3><Icon name="clock" size={16} /> {t('အကြွေး မှတ်တမ်း')}</h3>
              <span className="muted small">{t('ကျန်ငွေ')} {money(creditTotal)}</span>
            </div>
            <div className="credit-list">
              {credits.map(c => {
                const remain = Number(c.amount || 0) - Number(c.paid || 0);
                return (
                  <button type="button" className="credit-row" key={c.id} onClick={() => setSettle({ ...c, pay: remain, method: 'cash' })}>
                    <span className="credit-avatar">{initialOf(c.customer_name)}</span>
                    <span className="credit-main">
                      <span className="credit-name-row">
                        <strong>{c.customer_name || t('အဖွဲ့ဝင်')}</strong>
                        {c.order_no ? <span className="credit-order">#{c.order_no}</span> : null}
                      </span>
                      <span className="credit-meta">
                        {c.created_at ? `${c.created_at.slice(0, 10)} · ` : ''}
                        {t('ဖြတ်ပြီး')} {money(c.paid || 0)}
                      </span>
                    </span>
                    <span className="credit-amount">
                      <strong>{money(remain)}</strong>
                      <small>{t('ကျန်ငွေ')}</small>
                    </span>
                    <span className="credit-go"><Icon name="chevronRight" size={16} /></span>
                  </button>
                );
              })}
            </div>
          </section>
        )
      )}

      {addOpen && (
        <Modal title={t('အဖွဲ့ဝင် အသစ်')} onClose={() => setAddOpen(false)} footer={<>
          <button className="btn ghost" onClick={() => setAddOpen(false)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={add} disabled={!form.name.trim()}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('အမည်')}>
            <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          </Field>
          <Field label={t('ဖုန်း')}>
            <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={t('မှတ်ချက်')}>
            <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </Field>
        </Modal>
      )}

      {edit && (
        <Modal title={t('အဖွဲ့ဝင် အချက်အလက်')} onClose={() => setEdit(null)} footer={<>
          <button className="btn ghost" onClick={() => setEdit(null)}>{t('ပိတ်')}</button>
          <button className="btn" onClick={save}>{t('သိမ်းမည်')}</button>
        </>}>
          <div className={`member-hero tier-${edit.tier || 'normal'}`}>
            <span className="avatar big">{initialOf(edit.name)}</span>
            <div className="member-hero-main">
              <strong className="member-ellipsis">{edit.name}</strong>
              <span className={`tier-chip ${edit.tier || 'normal'}`}>{t(TIER_KEY[edit.tier] || 'ပုံမှန်')}</span>
            </div>
            <div className="member-hero-points">
              <strong>{Number(edit.points || 0).toLocaleString()}</strong>
              <small>{t('အမှတ်')}</small>
            </div>
          </div>
          <div className="form-grid">
            <Field label={t('အမည်')}>
              <input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <Field label={t('ဖုန်း')}>
              <input type="tel" value={edit.phone || ''} onChange={e => setEdit({ ...edit, phone: e.target.value })} />
            </Field>
            <Field label={t('အမှတ်')}>
              <input type="number" value={edit.points} onChange={e => setEdit({ ...edit, points: e.target.value })} />
            </Field>
            <Field label={t('အဆင့်')}>
              <select value={edit.tier || 'normal'} onChange={e => setEdit({ ...edit, tier: e.target.value })}>
                <option value="normal">{t('ပုံမှန်')}</option>
                <option value="silver">{t('ငွေရောင်')}</option>
                <option value="gold">{t('ရွှေရောင်')}</option>
              </select>
            </Field>
          </div>
          <Field label={t('မှတ်ချက်')}>
            <input value={edit.note || ''} onChange={e => setEdit({ ...edit, note: e.target.value })} />
          </Field>
          <p className="member-hint"><Icon name="spark" size={13} /> {t('1,000 ကျပ် = အမှတ် 1')}</p>
        </Modal>
      )}

      {settle && (
        <Modal title={`${settle.customer_name} — ${t('အကြွေး')}`} onClose={() => setSettle(null)} footer={<>
          <button className="btn ghost" onClick={() => setSettle(null)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={payCredit}>{t('ဖြတ်မည်')}</button>
        </>}>
          <div className="pay-summary">
            <div className="row between"><span>{t('အကြွေး စုစုပေါင်း')}</span><strong>{money(settle.amount)}</strong></div>
            <div className="row between"><span>{t('ဖြတ်ပြီး')}</span><span>{money(settle.paid)}</span></div>
            <div className="row between total"><span>{t('ကျန်ငွေ')}</span><strong>{money(settle.amount - settle.paid)}</strong></div>
          </div>
          <Field label={t('ဖြတ်မည့် ငွေ')}>
            <input type="number" value={settle.pay} onChange={e => setSettle({ ...settle, pay: e.target.value })} />
          </Field>
          <Field label={t('ငွေပေးချေနည်း')}>
            <select value={settle.method || 'cash'} onChange={e => setSettle({ ...settle, method: e.target.value })}>
              {CREDIT_METHODS.map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </div>
  );
}
