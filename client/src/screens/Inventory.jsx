import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';

export default function Inventory({ reload, showToast, go }) {
  const { t } = useI18n();
  const [inv, setInv] = useState({ items: [], moves: [] });
  const [moveItem, setMoveItem] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', unit: 'ကီလို', qty: 0, reorder_level: 0, cost: 0 });
  const [move, setMove] = useState({ type: 'in', qty: '', note: '' });

  const load = async () => {
    try { setInv(await api('/inventory')); } catch {}
  };
  useEffect(() => { load(); }, []);

  const addItem = async () => {
    try {
      await api('/inventory', { method: 'POST', body: JSON.stringify(form) });
      setAddOpen(false);
      setForm({ name: '', unit: 'ကီလို', qty: 0, reorder_level: 0, cost: 0 });
      await load();
      showToast(t('ပစ္စည်း ထည့်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const applyMove = async () => {
    if (!move.qty) return showToast(t('အရေအတွက် ထည့်ပါ'));
    try {
      await api(`/inventory/${moveItem.id}/move`, { method: 'POST', body: JSON.stringify(move) });
      setMoveItem(null);
      setMove({ type: 'in', qty: '', note: '' });
      await load();
      showToast(t('စာရင်း ပြင်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const lowCount = inv.items.filter(it => it.qty <= it.reorder_level).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>{t('ဂိုဒေါင်း')}</h2>
          <p className="muted small">{t('ကုန်ကြမ်း လက်ကျန် — ဟင်းရောင်းပြီးတိုင်း recipe အလိုက် အလိုအလျောက် နုတ်သည်')}</p>
        </div>
        <div className="row gap">
          {lowCount > 0 && <span className="badge bad">{lowCount} {t('ပြတ်တော့မည်')}</span>}
          <button className="btn ghost" onClick={() => go('expenses')}><Icon name="cash" size={16} /> {t('အသုံးစရိတ်')}</button>
          <button className="btn" onClick={() => setAddOpen(true)}><Icon name="plus" size={16} /> {t('ပစ္စည်း')}</button>
        </div>
      </div>

      {inv.items.length === 0 ? <Empty text={t('ပစ္စည်း မရှိသေးပါ')} /> : (
        <div className="inv-grid">
          {inv.items.map(it => {
            const low = it.qty <= it.reorder_level;
            const pct = it.reorder_level > 0 ? Math.max(4, Math.min(100, (it.qty / (it.reorder_level * 3)) * 100)) : 100;
            return (
              <div className={`inv-card ${low ? 'low' : ''}`} key={it.id}>
                <div className="row between">
                  <strong>{it.name}</strong>
                  {low && <span className="badge bad">{t('ပြတ်တော့မည်')}</span>}
                </div>
                <div className="inv-qty">{it.qty} <small>{it.unit}</small></div>
                <div className="stock-bar"><i style={{ width: `${pct}%` }} /></div>
                <div className="muted small">{t('သတိပေးအဆင့်')} {it.reorder_level} · {t('ကုန်ကျ')} {money(it.cost)}</div>
                <div className="row gap" style={{ marginTop: 3 }}>
                  <button className="btn sm ghost" onClick={() => { setMoveItem(it); setMove({ type: 'in', qty: '', note: '' }); }}>{t('ဖြည့်')}</button>
                  <button className="btn sm ghost" onClick={() => { setMoveItem(it); setMove({ type: 'out', qty: '', note: '' }); }}>{t('ထုတ်')}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="panel">
          <div className="panel-head"><h3><Icon name="box" size={16} /> {t('မကြာမီ လှုပ်ရှားမှုများ')}</h3></div>
          {inv.moves.length === 0 ? <div className="empty">{t('မရှိသေးပါ')}</div> : (
            <div className="list">
              {inv.moves.slice(0, 15).map(m => {
                const item = inv.items.find(i => i.id === m.item_id);
                const label = m.type === 'in' ? t('ဝင်') : m.type === 'out' ? t('ထွက်') : m.type === 'sale' ? t('အရောင်း အတွက် နုတ်') : m.type === 'void_return' ? t('ပြန်သွင်း') : t('ညှိ');
                return (
                  <div className="list-row static" key={m.id}>
                    <div className="grow">
                      <strong>{item?.name || '—'} <span className={`badge ${m.type === 'out' || m.type === 'sale' ? 'bad' : 'ok'}`}>{label}</span></strong>
                      <small className="muted">{m.created_at} {m.note && `· ${m.note}`}</small>
                    </div>
                    <span className="amount">{m.type === 'out' || m.type === 'sale' ? '-' : '+'}{m.qty}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      {addOpen && (
        <Modal title={t('ပစ္စည်း အသစ်')} onClose={() => setAddOpen(false)} footer={<>
          <button className="btn ghost" onClick={() => setAddOpen(false)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={addItem}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('အမည်')}><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="form-grid">
            <Field label={t('ယူနစ်')}><input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></Field>
            <Field label={t('လက်ကျန်')}><input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} /></Field>
            <Field label={t('သတိပေးအဆင့်')}><input type="number" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} /></Field>
            <Field label={t('ကုန်ကျစရိတ်')}><input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {moveItem && (
        <Modal title={`${moveItem.name} — ${move.type === 'in' ? t('ဖြည့်မည်') : t('ထုတ်မည်')}`} onClose={() => setMoveItem(null)} footer={<>
          <button className="btn ghost" onClick={() => setMoveItem(null)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={applyMove}>{t('အတည်ပြု')}</button>
        </>}>
          <div className="methods">
            <button className={`method ${move.type === 'in' ? 'on' : ''}`} onClick={() => setMove({ ...move, type: 'in' })}>{t('ဝင်')}</button>
            <button className={`method ${move.type === 'out' ? 'on' : ''}`} onClick={() => setMove({ ...move, type: 'out' })}>{t('ထွက်')}</button>
            <button className={`method ${move.type === 'adjust' ? 'on' : ''}`} onClick={() => setMove({ ...move, type: 'adjust' })}>{t('ညှိ')}</button>
          </div>
          <div className="row between"><span>{t('လက်ကျန်')}</span><strong>{moveItem.qty} {moveItem.unit}</strong></div>
          <Field label={t('အရေအတွက်')}><input type="number" value={move.qty} onChange={e => setMove({ ...move, qty: e.target.value })} /></Field>
          <Field label={t('မှတ်ချက်')}><input value={move.note} onChange={e => setMove({ ...move, note: e.target.value })} /></Field>
        </Modal>
      )}

    </div>
  );
}
