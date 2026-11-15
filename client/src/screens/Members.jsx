import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';

const TIER_KEY = { normal: 'ပုံမှန်', silver: 'ငွေရောင်', gold: 'ရွှေရောင်' };

export default function Members({ data, reload, showToast }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('members');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', note: '' });
  const [credits, setCredits] = useState([]);
  const [settle, setSettle] = useState(null);

  const list = data.customers.filter(c => !q || c.name.includes(q) || c.phone.includes(q));

  const loadCredits = async () => {
    try { setCredits(await api('/credits')); } catch {}
  };

  useEffect(() => { if (tab === 'credits') loadCredits(); }, [tab, data.creditOutstanding]);

  const add = async () => {
    try {
      await api('/customers', { method: 'POST', body: JSON.stringify(form) });
      setAddOpen(false);
      setForm({ name: '', phone: '', note: '' });
      await reload();
      showToast(t('အဖွဲ့ဝင် ထည့်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const save = async () => {
    try {
      await api(`/customers/${edit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: edit.name, phone: edit.phone, points: edit.points, tier: edit.tier, note: edit.note })
      });
      setEdit(null);
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const payCredit = async () => {
    try {
      await api(`/credits/${settle.id}/pay`, { method: 'POST', body: JSON.stringify({ amount: settle.pay }) });
      setSettle(null);
      await loadCredits();
      await reload();
      showToast(t('အကြွေး ဖြတ်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  return (
    <div className="stack">
      <div className="tabs">
        <button className={`tab ${tab === 'members' ? 'on' : ''}`} onClick={() => setTab('members')}>
          <Icon name="users" size={15} /> {t('အဖွဲ့ဝင်')} <span className="tab-count">{data.customers.length}</span>
        </button>
        <button className={`tab ${tab === 'credits' ? 'on' : ''}`} onClick={() => setTab('credits')}>
          <Icon name="clock" size={15} /> {t('အကြွေး')} · {money(data.creditOutstanding || 0)}
        </button>
      </div>

      {tab === 'members' && (
        <>
          <div className="toolbar">
            <div className="search">
              <Icon name="search" size={18} />
              <input placeholder={t('အမည် / ဖုန်း ရှာရန်…')} value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button className="btn" onClick={() => setAddOpen(true)}><Icon name="plus" size={16} /> {t('အဖွဲ့ဝင်')}</button>
          </div>

          {list.length === 0 ? <Empty text={t('အဖွဲ့ဝင် မတွေ့ပါ')} /> : (
            <div className="member-grid">
              {list.map(c => (
                <button className="member-card" key={c.id} onClick={() => setEdit({ ...c })}>
                  <div className="avatar">{c.name.slice(0, 1)}</div>
                  <div className="grow">
                    <strong>{c.name}</strong>
                    <small className="muted">{c.phone || t('ဖုန်းနံပါတ် မရှိ')} · {t(TIER_KEY[c.tier] || 'ပုံမှန်')}</small>
                  </div>
                  <div className="points">
                    <strong>{c.points}</strong>
                    <small>{t('အမှတ်')}</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'credits' && (
        credits.length === 0 ? <Empty text={t('အကြွေး မရှိပါ')} /> : (
          <div className="list">
            {credits.map(c => {
              const remain = c.amount - c.paid;
              return (
                <button className="list-row" key={c.id} onClick={() => setSettle({ ...c, pay: remain })}>
                  <div className="avatar" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>{c.customer_name?.slice(0, 1)}</div>
                  <div className="grow">
                    <strong>{c.customer_name}</strong>
                    <small className="muted">
                      {c.order_no ? `#${c.order_no} · ` : ''}{c.created_at?.slice(0, 10)} · {t('ကျန်ငွေ')} {money(remain)}
                    </small>
                  </div>
                  <span className="amount">{money(c.amount)}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {addOpen && (
        <Modal title={t('အဖွဲ့ဝင် အသစ်')} onClose={() => setAddOpen(false)} footer={<>
          <button className="btn ghost" onClick={() => setAddOpen(false)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={add}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('အမည်')}><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label={t('ဖုန်း')}><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label={t('မှတ်ချက်')}><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></Field>
        </Modal>
      )}

      {edit && (
        <Modal title={edit.name} onClose={() => setEdit(null)} footer={<>
          <button className="btn ghost" onClick={() => setEdit(null)}>{t('ပိတ်')}</button>
          <button className="btn" onClick={save}>{t('သိမ်းမည်')}</button>
        </>}>
          <div className="member-big">
            <div className="avatar big">{edit.name.slice(0, 1)}</div>
            <div>
              <div className="points-big">{edit.points} <small>{t('အမှတ်')}</small></div>
              <div className="muted small">{t('1,000 ကျပ် = အမှတ် 1')}</div>
            </div>
          </div>
          <Field label={t('အမည်')}><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label={t('ဖုန်း')}><input value={edit.phone} onChange={e => setEdit({ ...edit, phone: e.target.value })} /></Field>
          <Field label={t('အမှတ်')}><input type="number" value={edit.points} onChange={e => setEdit({ ...edit, points: e.target.value })} /></Field>
          <Field label={t('အဆင့်')}>
            <select value={edit.tier} onChange={e => setEdit({ ...edit, tier: e.target.value })}>
              <option value="normal">{t('ပုံမှန်')}</option>
              <option value="silver">{t('ငွေရောင်')}</option>
              <option value="gold">{t('ရွှေရောင်')}</option>
            </select>
          </Field>
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
        </Modal>
      )}
    </div>
  );
}
