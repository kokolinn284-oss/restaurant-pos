import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';

export default function PaymentMethods({ staff, showToast }) {
  const { t } = useI18n();
  const canManage = staff?.role === 'owner';
  const [rows, setRows] = useState([]);
  const [newName, setNewName] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const load = async () => {
    try { setRows(await api('/payment-methods')); } catch (e) { showToast(e.message); }
  };
  useEffect(() => { load(); }, []);

  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const count = rows.reduce((s, r) => s + Number(r.count || 0), 0);
  const byAmount = [...rows].filter(r => r.amount > 0).sort((a, b) => b.amount - a.amount);

  const add = async () => {
    const name = newName.trim();
    if (!name) return showToast(t('အမျိုးအစား အမည် ထည့်ပါ'));
    try {
      await api('/payment-methods', { method: 'POST', body: JSON.stringify({ name }) });
      setNewName('');
      setAddOpen(false);
      await load();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const rename = async () => {
    if (!editRow) return;
    const name = editRow.name.trim();
    if (!name) return showToast(t('အမျိုးအစား အမည် ထည့်ပါ'));
    try {
      await api(`/payment-methods/${editRow.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setEditRow(null);
      await load();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const remove = async (r) => {
    if (!window.confirm(`${t('ဖျက်မှာ သေချာပါသလား?')}\n${t(r.name)}`)) return;
    try {
      await api(`/payment-methods/${r.id}`, { method: 'DELETE' });
      await load();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  return (
    <div className="stack">
      <div className="page-head inline">
        <div>
          <h2>{t('ငွေပေးချေမှု အမျိုးအစား')}</h2>
          <p className="muted small">{t('ငွေချေနည်းလမ်းများ ကြိုတင်သတ်မှတ်ပြီး ငွေရှင်းချိန်တွင် ရွေးသုံးနိုင်သည်')}</p>
        </div>
        {canManage && (
          <div className="row gap">
            <button className="btn" onClick={() => { setNewName(''); setAddOpen(true); }}>
              <Icon name="plus" size={16} /> {t('ငွေချေနည်း အသစ်')}
            </button>
          </div>
        )}
      </div>

      <div className="stat-grid compact">
        <div className="stat-card">
          <span>{t('ကောက်ခံရငွေ')}</span>
          <strong>{money(total)}</strong>
        </div>
        <div className="stat-card">
          <span>{t('ငွေချေမှု')}</span>
          <strong>{count}</strong>
        </div>
        <div className="stat-card indigo">
          <span>{t('အမျိုးအစား')}</span>
          <strong>{rows.length}</strong>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head"><h3><Icon name="chart" size={16} /> {t('ငွေချေနည်းအလိုက်')}</h3></div>
        {byAmount.length === 0 ? <div className="empty">{t('ဒေတာ မရှိပါ')}</div> : (
          <div className="bars">
            {byAmount.map(r => (
              <div className="bar-row" key={r.id}>
                <span>{t(r.name)}</span>
                <div className="bar"><i style={{ width: `${total ? Math.max(3, r.amount / total * 100) : 0}%` }} /></div>
                <b>{money(r.amount)}</b>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h3><Icon name="receipt2" size={16} /> {t('ငွေချေနည်း စီမံ')}</h3></div>
        <div className="list">
          {rows.length === 0 ? <Empty text={t('ဒေတာ မရှိပါ')} /> : rows.map(r => (
            editRow?.id === r.id ? (
              <div className="list-row static" key={r.id}>
                <div className="grow">
                  <input autoFocus className="w-full" value={editRow.name}
                    onChange={e => setEditRow({ ...editRow, name: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') rename();
                      if (e.key === 'Escape') setEditRow(null);
                    }} />
                </div>
                <button className="btn sm" onClick={rename}>{t('သိမ်းမည်')}</button>
                <button className="btn sm ghost" onClick={() => setEditRow(null)}>{t('မလုပ်တော့')}</button>
              </div>
            ) : (
              <div className="list-row static" key={r.id}>
                <div className="grow">
                  <strong>{t(r.name)}</strong>
                  <small className="muted">{r.count} {t('ငွေချေမှု')}</small>
                </div>
                <strong className="nowrap">{money(r.amount)}</strong>
                {canManage && (
                  <>
                    <button className="icon-btn act-edit" onClick={() => setEditRow({ id: r.id, name: r.name })}
                      aria-label={t('ပြင်')} title={t('ပြင်')}>
                      <Icon name="edit" size={15} />
                    </button>
                    <button className="icon-btn act-delete" onClick={() => remove(r)} aria-label={t('ဖျက်')} title={t('ဖျက်')}>
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
        <Modal title={t('ငွေချေနည်း အသစ်')} onClose={() => setAddOpen(false)} footer={<>
          <button className="btn ghost" onClick={() => setAddOpen(false)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={add}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('ငွေချေနည်း အမည်')}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') add(); }} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
