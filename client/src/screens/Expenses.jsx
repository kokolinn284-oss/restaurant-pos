import React, { useEffect, useState } from 'react';
import { api, money, today } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty, SearchBox, AddableSelect, DateRangeField } from '../components/ui.jsx';
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
      <div className="page-head inline">
        <div>
          <h2>{t('အသုံးစရိတ်')}</h2>
          <p className="muted small">{t('ဆိုင်မှ ထွက်ငွေ — ပစ္စည်းဝယ်၊ လစာ၊ ငှားခ စသည်ဖြင့် မှတ်တမ်းတင်ပါ')}</p>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={exportCsv} disabled={!data.rows.length}>
            <Icon name="download" size={16} /> <span className="hide-mobile">CSV</span>
          </button>
          <button className="btn" data-action="add-expense" onClick={() => { setForm({ ...newForm(), category: formCats[0] || CATS[0] }); setAddOpen(true); }}>
            <Icon name="plus" size={16} /> {t('အသုံးစရိတ် ထည့်')}
          </button>
        </div>
      </div>

      <div className="data-toolbar-wrapper">
        <div className="data-toolbar single-row">
          <div className="toolbar-search-group">
            <SearchBox
              value={q}
              onChange={setQ}
              onSubmit={load}
              placeholder={t('ပေးချေသူ / မှတ်ချက် ရှာရန်…')}
            />
            <button className="btn ghost icon-text toolbar-filter-btn toolbar-search-submit" onClick={load}
              aria-label={t('ရှာမည်')} title={t('ရှာမည်')}>
              <Icon name="search" size={15} />
              <span className="hide-mobile">{t('ရှာမည်')}</span>
            </button>
          </div>
          <DateRangeField from={from} to={to} onFrom={setFrom} onTo={setTo} />
          <div className="toolbar-end">
            <div className="category-select-wrapper toolbar-select">
              <Icon name="tag" size={15} />
              <select value={category} onChange={e => setCategory(e.target.value)} aria-label={t('အမျိုးအစား')}>
                <option value="">{t('အားလုံး')}</option>
                {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-grid compact">
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
                        <button className="icon-btn act-delete" onClick={() => remove(x)} aria-label={t('ဖျက်')}>
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
              <AddableSelect
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                onAdd={async (name) => {
                  await api('/expense-categories', { method: 'POST', body: JSON.stringify({ name }) });
                  await loadCats();
                  showToast(t('အမျိုးအစား အသစ် ထည့်ပြီးပါပြီ'));
                  return name;
                }}
                addLabel={t('အမျိုးအစား အသစ်')}
                namePlaceholder={t('အမျိုးအစားအမည်')}
              >
                {formCats.map(c => <option key={c} value={c}>{c}</option>)}
              </AddableSelect>
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
