import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';

export default function ExpenseCategories({ staff, showToast }) {
  const { t } = useI18n();
  const canManage = staff?.role === 'owner';
  const [cats, setCats] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editCat, setEditCat] = useState(null);

  const loadCats = async () => {
    try { setCats(await api('/expense-categories')); } catch (e) { showToast(e.message); }
  };
  useEffect(() => { loadCats(); }, []);

  const total = cats.reduce((s, c) => s + Number(c.amount || 0), 0);
  const count = cats.reduce((s, c) => s + Number(c.count || 0), 0);
  const byAmount = [...cats].filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);

  const addCat = async () => {
    const name = newCat.trim();
    if (!name) return showToast(t('အမျိုးအစား အမည် ထည့်ပါ'));
    try {
      await api('/expense-categories', { method: 'POST', body: JSON.stringify({ name }) });
      setNewCat('');
      setAddOpen(false);
      await loadCats();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const renameCat = async () => {
    if (!editCat) return;
    const name = editCat.name.trim();
    if (!name) return showToast(t('အမျိုးအစား အမည် ထည့်ပါ'));
    try {
      await api(`/expense-categories/${editCat.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setEditCat(null);
      await loadCats();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const removeCat = async (c) => {
    if (!window.confirm(`${t('ဖျက်မှာ သေချာပါသလား?')}\n${c.name}`)) return;
    try {
      await api(`/expense-categories/${c.id}`, { method: 'DELETE' });
      await loadCats();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  return (
    <div className="stack">
      <div className="page-head inline">
        <div>
          <h2>{t('အသုံးစရိတ် အမျိုးအစား')}</h2>
          <p className="muted small">{t('အမျိုးအစားအလိုက် စုစုပေါင်း၊ အသုံးပြုမှုနှင့် စီမံခန့်ခွဲမှု')}</p>
        </div>
        {canManage && (
          <div className="row gap">
            <button className="btn" onClick={() => { setNewCat(''); setAddOpen(true); }}>
              <Icon name="plus" size={16} /> {t('အမျိုးအစား အသစ်')}
            </button>
          </div>
        )}
      </div>

      <div className="stat-grid compact">
        <div className="stat-card rose">
          <span>{t('စုစုပေါင်း အသုံးစရိတ်')}</span>
          <strong>{money(total)}</strong>
        </div>
        <div className="stat-card">
          <span>{t('မှတ်တမ်း')}</span>
          <strong>{count}</strong>
        </div>
        <div className="stat-card indigo">
          <span>{t('အမျိုးအစား')}</span>
          <strong>{cats.length}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><h3><Icon name="chart" size={16} /> {t('အမျိုးအစားအလိုက်')}</h3></div>
        {byAmount.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
          <div className="bars">
            {byAmount.map(c => (
              <div className="bar-row" key={c.id}>
                <span>{c.name || t('အခြား')}</span>
                <div className="bar amber"><i style={{ width: `${total ? Math.max(3, c.amount / total * 100) : 0}%` }} /></div>
                <b>{money(c.amount)}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h3><Icon name="tag" size={16} /> {t('အမျိုးအစား စီမံ')}</h3></div>
        <div className="list">
          {cats.length === 0 ? <Empty text={t('ဒေတာ မရှိပါ')} /> : cats.map(c => (
            editCat?.id === c.id ? (
              <div className="list-row static" key={c.id}>
                <div className="grow">
                  <input autoFocus className="w-full" value={editCat.name}
                    onChange={e => setEditCat({ ...editCat, name: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') renameCat();
                      if (e.key === 'Escape') setEditCat(null);
                    }} />
                </div>
                <button className="btn sm" onClick={renameCat}>{t('သိမ်းမည်')}</button>
                <button className="btn sm ghost" onClick={() => setEditCat(null)}>{t('မလုပ်တော့')}</button>
              </div>
            ) : (
              <div className="list-row static" key={c.id}>
                <div className="grow">
                  <strong>{c.name}</strong>
                  <small className="muted">{c.count} {t('မှတ်တမ်း')}</small>
                </div>
                <strong className="nowrap">{money(c.amount)}</strong>
                {canManage && (
                  <>
                    <button className="icon-btn act-edit" onClick={() => setEditCat({ id: c.id, name: c.name })}
                      aria-label={t('ပြင်')} title={t('ပြင်')}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button className="icon-btn act-delete" onClick={() => removeCat(c)} aria-label={t('ဖျက်')} title={t('ဖျက်')}>
                      <Icon name="trash" size={15} />
                    </button>
                  </>
                )}
              </div>
            )
          ))}
        </div>
      </section>

      {addOpen && (
        <Modal title={t('အမျိုးအစား အသစ်')} onClose={() => setAddOpen(false)} footer={<>
          <button className="btn ghost" onClick={() => setAddOpen(false)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={addCat}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('အမျိုးအစားအမည်')}>
            <input autoFocus value={newCat} onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCat(); }} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
