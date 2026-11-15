import React, { useEffect, useState } from 'react';
import { api, money, today } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';
import { downloadCsv } from '../csv.js';

const CATS = ['ပစ္စည်းဝယ်ခြင်း', 'လစာ', 'ဆိုင်ငှားခ', 'မီတာ/ရေ', 'ပြင်ဆင်မှု', 'သယ်ယူပို့ဆောင်ခ', 'အခြား'];
const METHODS = { cash: 'လက်ငင်း', bank: 'ဘဏ်/ကတ်' };

const firstOfMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

const newForm = () => ({
  spent_on: today(), category: CATS[0], vendor: '', amount: '', method: 'cash', note: ''
});

export default function Expenses({ staff, reload, showToast }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [cats, setCats] = useState([]);
  const [catOpen, setCatOpen] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [editCat, setEditCat] = useState(null);
  const [data, setData] = useState({ rows: [], count: 0, total: 0, cash: 0, bank: 0, byCategory: [] });
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(newForm);
  const canManage = staff?.role === 'owner';

  const loadCats = async () => {
    try { setCats(await api('/expense-categories')); } catch {}
  };
  useEffect(() => { loadCats(); }, []);

  const load = async () => {
    try {
      const p = new URLSearchParams({ from, to });
      if (q.trim()) p.set('q', q.trim());
      if (category) p.set('category', category);
      setData(await api(`/expenses?${p}`));
    } catch (e) { showToast(e.message); }
  };

  useEffect(() => { load(); }, [from, to, category]);

  const addExpense = async () => {
    if (!(Number(form.amount) > 0)) return showToast(t('ပမာဏ ထည့်ပါ'));
    try {
      await api('/expenses', { method: 'POST', body: JSON.stringify(form) });
      setAddOpen(false);
      setForm(newForm());
      await Promise.all([load(), loadCats()]);
      if (reload) await reload();
      showToast(t('အသုံးစရိတ် မှတ်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const remove = async (x) => {
    if (!window.confirm(`${t('ဖျက်မှာ သေချာပါသလား?')}\n${x.category || ''} · ${money(x.amount)}`)) return;
    try {
      await api(`/expenses/${x.id}`, { method: 'DELETE' });
      await Promise.all([load(), loadCats()]);
      if (reload) await reload();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const addCat = async () => {
    const name = newCat.trim();
    if (!name) return showToast(t('အမျိုးအစား အမည် ထည့်ပါ'));
    try {
      await api('/expense-categories', { method: 'POST', body: JSON.stringify({ name }) });
      setNewCat('');
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
      const renamedCurrent = category === editCat.old;
      setEditCat(null);
      await loadCats();
      if (renamedCurrent) setCategory(name);
      else await load();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const removeCat = async (c) => {
    if (!window.confirm(`${t('ဖျက်မှာ သေချာပါသလား?')}\n${c.name}`)) return;
    try {
      await api(`/expense-categories/${c.id}`, { method: 'DELETE' });
      if (category === c.name) setCategory('');
      await loadCats();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const exportCsv = () => {
    downloadCsv(`expenses-${from}_${to}.csv`,
      [t('ရက်စွဲ'), t('အမျိုးအစား'), t('ပေးချေသူ'), t('ငွေပေးချေမှု'), t('မှတ်ချက်'), t('ပမာဏ'), t('ဝန်ထမ်း')],
      data.rows.map(x => [x.spent_on, x.category, x.vendor, t(METHODS[x.method] || x.method), x.note, x.amount, x.staff_name || '']));
    showToast(t('CSV ရယူပြီးပါပြီ'));
  };

  const catOptions = [...new Set([
    ...cats.map(c => c.name),
    ...data.byCategory.map(c => c.category).filter(Boolean)
  ])];
  const formCats = cats.length ? cats.map(c => c.name) : CATS;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>{t('အသုံးစရိတ်')}</h2>
          <p className="muted small">{t('ဆိုင်မှ ထွက်ငွေ — ပစ္စည်းဝယ်၊ လစာ၊ ငှားခ စသည်ဖြင့် မှတ်တမ်းတင်ပါ')}</p>
        </div>
        <div className="row gap">
          {canManage && (
            <button className="btn ghost" onClick={() => { setNewCat(''); setEditCat(null); setCatOpen(true); }}>
              <Icon name="tag" size={16} /> {t('အမျိုးအစား စီမံ')}
            </button>
          )}
          <button className="btn ghost" onClick={exportCsv} disabled={!data.rows.length}>CSV</button>
          <button className="btn" data-action="add-expense" onClick={() => { setForm({ ...newForm(), category: formCats[0] || CATS[0] }); setAddOpen(true); }}>
            <Icon name="plus" size={16} /> {t('အသုံးစရိတ် ထည့်')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-filters">
          <div className="date-range">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            <span className="date-sep">~</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)} className="cat-select">
            <option value="">{t('အားလုံး')}</option>
            {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="toolbar-search">
          <div className="search">
            <Icon name="search" size={18} />
            <input placeholder={t('ပေးချေသူ / မှတ်ချက် ရှာရန်…')} value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load(); }} />
            {q && <button className="link-btn" onClick={() => setQ('')} aria-label={t('ဖျက်')}><Icon name="close" size={15} /></button>}
          </div>
          <button className="btn" onClick={load}>{t('ရှာမည်')}</button>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))' }}>
        <div className="stat-card rose">
          <span>{t('စုစုပေါင်း အသုံးစရိတ်')}</span>
          <strong>{money(data.total)}</strong>
          <small className="muted">{data.count} {t('မှတ်တမ်း')}</small>
        </div>
        <div className="stat-card">
          <span>{t('လက်ငင်း ငွေ')}</span>
          <strong>{money(data.cash)}</strong>
          <small className="muted">{t('ငွေပေးချေမှု')}</small>
        </div>
        <div className="stat-card indigo">
          <span>{t('ဘဏ်/ကတ်')}</span>
          <strong>{money(data.bank)}</strong>
          <small className="muted">{t('ငွေပေးချေမှု')}</small>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><h3><Icon name="cash" size={16} /> {t('အသုံးစရိတ် အမျိုးအစား')}</h3></div>
        {data.byCategory.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
          <div className="bars">
            {data.byCategory.map(c => (
              <div className="bar-row" key={c.category || '—'}>
                <span>{c.category || t('အခြား')}</span>
                <div className="bar amber"><i style={{ width: `${data.total ? Math.max(3, c.amount / data.total * 100) : 0}%` }} /></div>
                <b>{money(c.amount)}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h3><Icon name="receipt" size={16} /> {t('အသုံးစရိတ် မှတ်တမ်း')}</h3></div>
        {data.rows.length === 0 ? <Empty text={t('ဒေတာ မရှိပါ')} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('ရက်စွဲ')}</th>
                  <th>{t('အမျိုးအစား')}</th>
                  <th>{t('ပေးချေသူ')}</th>
                  <th>{t('ငွေပေးချေမှု')}</th>
                  <th>{t('မှတ်ချက်')}</th>
                  <th>{t('အသုံးစရိတ် ပမာဏ')}</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {data.rows.map(x => (
                  <tr key={x.id}>
                    <td>{x.spent_on}</td>
                    <td>{x.category || t('အခြား')}</td>
                    <td>{x.vendor || '—'}</td>
                    <td>{t(METHODS[x.method] || x.method)}</td>
                    <td className="muted">{x.note || '—'}</td>
                    <td><strong>{money(x.amount)}</strong></td>
                    {canManage && (
                      <td>
                        <button className="icon-btn" onClick={() => remove(x)} aria-label={t('ဖျက်')}>
                          <Icon name="trash" size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {catOpen && (
        <Modal title={t('အမျိုးအစား စီမံ')} onClose={() => setCatOpen(false)}
          footer={<button className="btn" onClick={() => setCatOpen(false)}>{t('ပိတ်')}</button>}>
          <div className="row gap">
            <input value={newCat} placeholder={t('အမျိုးအစား အသစ်')}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCat(); }} />
            <button className="btn" onClick={addCat} disabled={!newCat.trim()}>{t('ပေါင်း')}</button>
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {cats.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : cats.map(c => (
              editCat?.id === c.id ? (
                <div className="list-row static" key={c.id}>
                  <div className="grow">
                    <input autoFocus style={{ width: '100%' }} value={editCat.name}
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
                  <button className="icon-btn" onClick={() => setEditCat({ id: c.id, name: c.name, old: c.name })}
                    aria-label={t('ပြင်')} title={t('ပြင်')}>
                    <Icon name="edit" size={15} />
                  </button>
                  <button className="icon-btn" onClick={() => removeCat(c)} aria-label={t('ဖျက်')} title={t('ဖျက်')}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              )
            ))}
          </div>
        </Modal>
      )}

      {addOpen && (
        <Modal title={t('အသုံးစရိတ် ထည့်')} onClose={() => setAddOpen(false)} footer={<>
          <button className="btn ghost" onClick={() => setAddOpen(false)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={addExpense}>{t('သိမ်းမည်')}</button>
        </>}>
          <div className="form-grid">
            <Field label={t('ရက်စွဲ')}>
              <input type="date" value={form.spent_on} onChange={e => setForm({ ...form, spent_on: e.target.value })} />
            </Field>
            <Field label={t('အမျိုးအစား')}>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {formCats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={t('ပေးချေသူ')}>
              <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} />
            </Field>
            <Field label={t('အသုံးစရိတ် ပမာဏ')}>
              <input type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label={t('ငွေပေးချေမှု')}>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                <option value="cash">{t('လက်ငင်း')}</option>
                <option value="bank">{t('ဘဏ်/ကတ်')}</option>
              </select>
            </Field>
          </div>
          <Field label={t('မှတ်ချက်')}>
            <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
