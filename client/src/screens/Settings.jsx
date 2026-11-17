import React, { useState } from 'react';
import { api, getToken, today } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';

const ROLES = { owner: 'ပိုင်ရှင်', cashier: 'ကောင်တာ', waiter: 'စားပွဲထိုး' };

const PAGES = {
  shop: { title: 'ဆိုင် အချက်အလက်', subtitle: 'ဆိုင် အချက်အလက် နှင့် ဘောက်ချာ ဆက်တင်', icon: 'gear' },
  tables: { title: 'စားပွဲများ', subtitle: 'စားပွဲ နှင့် ဇုန် စီမံခန့်ခွဲမှု', icon: 'table' },
  staff: { title: 'ဝန်ထမ်း', subtitle: 'ဝန်ထမ်း အကောင့် နှင့် ရာထူး စီမံခန့်ခွဲမှု', icon: 'users' },
  printer: { title: 'ပရင့်တာ', subtitle: 'ပရင့်တာ ချိတ်ဆက်မှု ဆက်တင်', icon: 'print' }
};

export default function Settings({ section = 'shop', data, reload, showToast, onLogout }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ ...data.settings });
  const [tableEdit, setTableEdit] = useState(null);
  const [staffEdit, setStaffEdit] = useState(null);
  const [testing, setTesting] = useState(false);
  const page = PAGES[section] || PAGES.shop;

  const saveSettings = async () => {
    try {
      await api('/settings', { method: 'PATCH', body: JSON.stringify(form) });
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const saveTable = async () => {
    try {
      const payload = { name: tableEdit.name, zone: tableEdit.zone, seats: Number(tableEdit.seats) || 4 };
      if (tableEdit.id) await api(`/tables/${tableEdit.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/tables', { method: 'POST', body: JSON.stringify(payload) });
      setTableEdit(null);
      await reload();
    } catch (e) { showToast(e.message); }
  };

  const delTable = async (tb) => {
    if (!window.confirm(`${tb.name} ${t('ဖျက်မှာ သေချာပါသလဲ?')}`)) return;
    try {
      await api(`/tables/${tb.id}`, { method: 'DELETE' });
      await reload();
    } catch (e) { showToast(e.message); }
  };

  const saveStaff = async () => {
    try {
      if (!staffEdit.name) return showToast(t('အမည် ထည့်ပါ'));
      if (!staffEdit.id && !staffEdit.pin) return showToast(t('PIN ထည့်ပါ'));
      const payload = { name: staffEdit.name, role: staffEdit.role, active: staffEdit.active ? 1 : 0 };
      if (staffEdit.pin) payload.pin = String(staffEdit.pin);
      if (staffEdit.id) await api(`/staff/${staffEdit.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/staff', { method: 'POST', body: JSON.stringify(payload) });
      setStaffEdit(null);
      await reload();
    } catch (e) { showToast(e.message); }
  };

  const downloadBackup = async () => {
    try {
      const res = await fetch('/api/backup', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error(t('Backup မရယူနိုင်ပါ'));
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pos-backup-${today()}.db`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(t('ဒေတာ Backup ရယူပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const testPrint = async () => {
    setTesting(true);
    try {
      await api('/print/test', { method: 'POST' });
      showToast(t('ပရင့်တာ စမ်းသပ်ပြီးပါပြီ'));
    } catch (e) {
      showToast(`${t('ပရင့် မအောင်မြင်ပါ')} — ${e.message}`);
    }
    setTesting(false);
  };

  return (
    <div className="stack">
      <div className="page-head inline">
        <div>
          <h2>{t(page.title)}</h2>
          <p className="muted small">{t(page.subtitle)}</p>
        </div>
        <div className="row gap">
          {section === 'shop' && <button className="btn" onClick={saveSettings}>{t('သိမ်းမည်')}</button>}
          {section === 'tables' && (
            <button className="btn" onClick={() => setTableEdit({ name: '', zone: 'အပြင်', seats: 4 })}>
              <Icon name="plus" size={16} /> {t('စားပွဲ အသစ်')}
            </button>
          )}
          {section === 'staff' && (
            <button className="btn" onClick={() => setStaffEdit({ name: '', pin: '', role: 'cashier', active: 1 })}>
              <Icon name="plus" size={16} /> {t('ဝန်ထမ်း အသစ်')}
            </button>
          )}
          {section === 'printer' && (
            <>
              {(form.printer_mode || 'browser') !== 'browser' && (
                <button className="btn ghost" disabled={testing} onClick={testPrint}>{testing ? '…' : t('စမ်းသပ် ပရင့်')}</button>
              )}
              <button className="btn" onClick={saveSettings}>{t('သိမ်းမည်')}</button>
            </>
          )}
        </div>
      </div>

      {section === 'shop' && (
        <section className="panel">
          <div className="form-grid">
            <Field label={t('ဆိုင်အမည် (မြန်မာ)')}><input value={form.shop_name || ''} onChange={e => setForm({ ...form, shop_name: e.target.value })} /></Field>
            <Field label={t('ဆိုင်အမည် (English)')}><input value={form.shop_name_en || ''} onChange={e => setForm({ ...form, shop_name_en: e.target.value })} /></Field>
            <Field label={t('လိပ်စာ')}><input value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
            <Field label={t('ဖုန်း')}><input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label={t('အခွန် %')}><input type="number" value={form.tax_rate || 0} onChange={e => setForm({ ...form, tax_rate: e.target.value })} /></Field>
            <Field label={t('ဝန်ဆောင်ခ %')}><input type="number" value={form.service_rate || 0} onChange={e => setForm({ ...form, service_rate: e.target.value })} /></Field>
            <Field label={t('အမှတ် — ၁,၀၀၀ ကျပ်လျှင်')}><input type="number" value={form.points_per_1000 || 1} onChange={e => setForm({ ...form, points_per_1000: e.target.value })} /></Field>
            <Field label={t('အမှတ် ၁ ခု လဲလှယ်နှုန်း (ကျပ်)')} hint={t('ငွေရှင်းချိန် အမှတ်သုံးလျှင် ၁ မှတ် = ဤကျပ်ငွေ')}>
              <input type="number" min="0" value={form.point_value ?? 1} onChange={e => setForm({ ...form, point_value: e.target.value })} />
            </Field>
            <Field label={t('ဘောက်ချာ အောက်ခြေ စာသား')}><input value={form.footer || ''} onChange={e => setForm({ ...form, footer: e.target.value })} /></Field>
          </div>
          <div className="panel-actions">
            <button className="btn danger" onClick={onLogout}><Icon name="logout" size={16} /> {t('အကောင့် ထွက်')}</button>
            <button className="btn ghost" onClick={downloadBackup}><Icon name="box" size={16} /> {t('ဒေတာ Backup ရယူ')}</button>
          </div>
          <p className="hint mt-12">
            {t('Backup ဖိုင် (.db) ကို ဖုန်း/ကွန်ပြူတာထဲ သိမ်းထားပါ။ နေ့စဉ် အလိုအလျောက် backup ကို backups ဖိုဒါထဲ သိမ်းပေးထားပါတယ်။')}
          </p>
        </section>
      )}

      {section === 'tables' && (
        <section className="panel">
          <div className="panel-head"><h3><Icon name="table" size={16} /> {t('စားပွဲ စီမံ')}</h3></div>
          <div className="list">
            {data.tables.length === 0 ? <Empty text={t('ဒေတာ မရှိပါ')} /> : data.tables.map(tb => (
              <div className="list-row static" key={tb.id}>
                <div className="grow">
                  <strong>{tb.name}</strong>
                  <small className="muted">{t(tb.zone)} · {tb.seats} {t('ထိုင်ခုံ')}</small>
                </div>
                <button className="icon-btn act-edit" onClick={() => setTableEdit({ ...tb })} aria-label={t('ပြင်')} title={t('ပြင်')}>
                  <Icon name="edit" size={15} />
                </button>
                <button className="icon-btn act-delete" onClick={() => delTable(tb)} aria-label={t('ဖျက်')} title={t('ဖျက်')}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'staff' && (
        <section className="panel">
          <div className="panel-head"><h3><Icon name="users" size={16} /> {t('ဝန်ထမ်း စီမံ')}</h3></div>
          <div className="list">
            {data.staff.length === 0 ? <Empty text={t('ဒေတာ မရှိပါ')} /> : data.staff.map(s => (
              <div className="list-row static" key={s.id}>
                <div className="grow">
                  <strong>{s.name}</strong>
                  <small className="muted">{t(ROLES[s.role] || s.role)} · PIN ••••</small>
                </div>
                <span className={`badge ${s.active ? 'ok' : 'bad'}`}>{s.active ? t('အလုပ်လုပ်') : t('ပိတ်ထားသည်')}</span>
                <button className="icon-btn act-edit" onClick={() => setStaffEdit({ ...s })} aria-label={t('ပြင်')} title={t('ပြင်')}>
                  <Icon name="edit" size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {section === 'printer' && (
        <section className="panel">
          <div className="form-grid">
            <Field label={t('ပရင့်တာ ပုံစံ')} hint={t('မြန်မာစာ အတွက် Windows ပရင့်တာ ကို အကြံပြုသည်')}>
              <select value={form.printer_mode || 'browser'} onChange={e => setForm({ ...form, printer_mode: e.target.value })}>
                <option value="browser">{t('ဘရောက်ဇာ ပရင့်')}</option>
                <option value="network">{t('ကွန်ရက် (ESC/POS)')}</option>
                <option value="windows">{t('Windows ပရင့်တာ')}</option>
              </select>
            </Field>
            <Field label={t('ပရင့်တာ IP')}><input value={form.printer_host || ''} onChange={e => setForm({ ...form, printer_host: e.target.value })} placeholder="192.168.1.50" /></Field>
            <Field label={t('ပို့တ်')}><input value={form.printer_port || '9100'} onChange={e => setForm({ ...form, printer_port: e.target.value })} placeholder="9100" /></Field>
            <Field label={t('Windows ပရင့်တာ အမည်')}><input value={form.printer_name || ''} onChange={e => setForm({ ...form, printer_name: e.target.value })} placeholder="XP-80C" /></Field>
          </div>
          <div className="printer-help">
            <div><strong>{t('ဘရောက်ဇာ ပရင့်')}</strong><span>{t('ချိတ်ဆက်ထားသော ပရင့်တာ မလိုပါ — dialog မှ ရွေးပါ')}</span></div>
            <div><strong>{t('ကွန်ရက် (ESC/POS)')}</strong><span>{t('တူညီသော Wi-Fi ပေါ်ရှိ ပရင့်တာ IP ထည့်ပါ')}</span></div>
            <div><strong>{t('Windows ပရင့်တာ')}</strong><span>{t('ဆာဗာ ကွန်ပျူတာတွင် ချိတ်ထားသော ပရင့်တာ အမည်')}</span></div>
          </div>
        </section>
      )}

      {tableEdit && (
        <Modal title={tableEdit.id ? t('စားပွဲ ပြင်') : t('စားပွဲ အသစ်')} onClose={() => setTableEdit(null)} footer={<>
          <button className="btn ghost" onClick={() => setTableEdit(null)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={saveTable}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('အမည်')}><input value={tableEdit.name} onChange={e => setTableEdit({ ...tableEdit, name: e.target.value })} /></Field>
          <Field label={t('ဇုန်')}><input value={tableEdit.zone} onChange={e => setTableEdit({ ...tableEdit, zone: e.target.value })} /></Field>
          <Field label={t('ထိုင်ခုံ')}><input type="number" value={tableEdit.seats} onChange={e => setTableEdit({ ...tableEdit, seats: e.target.value })} /></Field>
        </Modal>
      )}

      {staffEdit && (
        <Modal title={staffEdit.id ? t('ဝန်ထမ်း ပြင်') : t('ဝန်ထမ်း အသစ်')} onClose={() => setStaffEdit(null)} footer={<>
          <button className="btn ghost" onClick={() => setStaffEdit(null)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={saveStaff}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('အမည်')}><input value={staffEdit.name} onChange={e => setStaffEdit({ ...staffEdit, name: e.target.value })} /></Field>
          <Field label={t('PIN (၄ လုံး)')} hint={staffEdit.id ? t('မပြောင်းလိုလျှင် ဗလာထားပါ') : ''}>
            <input type="password" value={staffEdit.pin ?? ''} maxLength={6} onChange={e => setStaffEdit({ ...staffEdit, pin: e.target.value })} />
          </Field>
          <Field label={t('ရာထူး')}>
            <select value={staffEdit.role} onChange={e => setStaffEdit({ ...staffEdit, role: e.target.value })}>
              <option value="owner">{t('ပိုင်ရှင်')}</option>
              <option value="cashier">{t('ကောင်တာ')}</option>
              <option value="waiter">{t('စားပွဲထိုး')}</option>
            </select>
          </Field>
          {staffEdit.id && (
            <Field label={t('အခြေအနေ')}>
              <select value={staffEdit.active ? 1 : 0} onChange={e => setStaffEdit({ ...staffEdit, active: Number(e.target.value) })}>
                <option value={1}>{t('အလုပ်လုပ်')}</option>
                <option value={0}>{t('ပိတ်ထားသည်')}</option>
              </select>
            </Field>
          )}
        </Modal>
      )}
    </div>
  );
}
