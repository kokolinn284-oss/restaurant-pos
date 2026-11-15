import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty, Switch } from '../components/ui.jsx';

const emptyItem = { name: '', price: '', cost: '', unit: 'ပွဲ', category_id: null, available: 1, is_alcohol: 0, station: 'kitchen' };
const emptyPromo = { name: '', type: 'percent', value: 5, min_subtotal: 0, start_time: '', end_time: '', active: 1 };

export default function MenuAdmin({ data, reload, showToast }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('items');
  const [catId, setCatId] = useState('all');
  const [edit, setEdit] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [promoEdit, setPromoEdit] = useState(null);
  const [recipeFor, setRecipeFor] = useState(null);
  const [recipeLines, setRecipeLines] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [recipeBusy, setRecipeBusy] = useState(false);

  const items = data.items.filter(i => catId === 'all' || i.category_id === catId);
  const promotions = data.promotions || [];

  useEffect(() => {
    if (!recipeFor) return;
    let alive = true;
    Promise.all([api(`/recipes/${recipeFor.id}`), api('/inventory')])
      .then(([lines, inv]) => {
        if (!alive) return;
        setRecipeLines(lines.map(l => ({ inventory_item_id: l.inventory_item_id, qty: l.qty })));
        setInventory(inv.items || []);
      })
      .catch(e => showToast(e.message));
    return () => { alive = false; };
  }, [recipeFor]);

  const saveItem = async () => {
    try {
      if (!edit.name || !edit.price) return showToast(t('အမည်နှင့် စျေးနှုန်း ထည့်ပါ'));
      const payload = {
        category_id: Number(edit.category_id || edit.categoryId || data.categories[0]?.id),
        name: edit.name,
        price: Number(edit.price),
        cost: Number(edit.cost) || 0,
        unit: edit.unit || '',
        available: edit.available ? 1 : 0,
        sort: edit.sort || 0,
        is_alcohol: edit.is_alcohol ? 1 : 0,
        station: edit.station === 'bar' ? 'bar' : 'kitchen'
      };
      if (edit.id) await api(`/items/${edit.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/items', { method: 'POST', body: JSON.stringify(payload) });
      setEdit(null);
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const removeItem = async (it) => {
    if (!window.confirm(`"${it.name}" ${t('ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api(`/items/${it.id}`, { method: 'DELETE' });
      await reload();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const toggle = async (it) => {
    try {
      await api(`/items/${it.id}`, { method: 'PATCH', body: JSON.stringify({ available: it.available ? 0 : 1 }) });
      await reload();
    } catch (e) { showToast(e.message); }
  };

  const addCat = async () => {
    if (!catName.trim()) return;
    try {
      await api('/categories', { method: 'POST', body: JSON.stringify({ name: catName.trim() }) });
      setCatName('');
      setCatModal(false);
      await reload();
    } catch (e) { showToast(e.message); }
  };

  const delCat = async (c) => {
    if (!window.confirm(`"${c.name}" ${t('ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      if (catId === c.id) setCatId('all');
      await reload();
    } catch (e) { showToast(e.message); }
  };

  const savePromo = async () => {
    try {
      if (!promoEdit.name) return showToast(t('အမည် ထည့်ပါ'));
      const payload = {
        name: promoEdit.name,
        type: promoEdit.type,
        value: Number(promoEdit.value) || 0,
        min_subtotal: Number(promoEdit.min_subtotal) || 0,
        start_time: promoEdit.start_time || '',
        end_time: promoEdit.end_time || '',
        active: promoEdit.active ? 1 : 0
      };
      if (promoEdit.id) await api(`/promotions/${promoEdit.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/promotions', { method: 'POST', body: JSON.stringify(payload) });
      setPromoEdit(null);
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
  };

  const togglePromo = async (p) => {
    try {
      await api(`/promotions/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: p.active ? 0 : 1 }) });
      await reload();
    } catch (e) { showToast(e.message); }
  };

  const removePromo = async (p) => {
    if (!window.confirm(`"${p.name}" ${t('ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api(`/promotions/${p.id}`, { method: 'DELETE' });
      await reload();
    } catch (e) { showToast(e.message); }
  };

  const addRecipeLine = () => setRecipeLines(lines => [...lines, { inventory_item_id: '', qty: 1 }]);
  const setLine = (i, patch) => setRecipeLines(lines => lines.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  const removeLine = (i) => setRecipeLines(lines => lines.filter((_, idx) => idx !== i));

  const saveRecipe = async () => {
    setRecipeBusy(true);
    try {
      const lines = recipeLines.filter(l => l.inventory_item_id && Number(l.qty) > 0)
        .map(l => ({ inventory_item_id: Number(l.inventory_item_id), qty: Number(l.qty) }));
      await api(`/recipes/${recipeFor.id}`, { method: 'PUT', body: JSON.stringify({ lines }) });
      setRecipeFor(null);
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) { showToast(e.message); }
    setRecipeBusy(false);
  };

  return (
    <div className="stack">
      <div className="tabs">
        <button className={`tab ${tab === 'items' ? 'on' : ''}`} onClick={() => setTab('items')}>
          <Icon name="menu" size={15} /> {t('မီနူး')} <span className="tab-count">{data.items.length}</span>
        </button>
        <button className={`tab ${tab === 'promotions' ? 'on' : ''}`} onClick={() => setTab('promotions')}>
          <Icon name="tag" size={15} /> {t('ပရိုမိုးရှင်း')} <span className="tab-count">{promotions.length}</span>
        </button>
      </div>

      {tab === 'items' && (
        <>
          <div className="toolbar">
            <div className="chips">
              <button className={`chip ${catId === 'all' ? 'on' : ''}`} onClick={() => setCatId('all')}>{t('အားလုံး')}</button>
              {data.categories.map(c => (
                <button key={c.id} className={`chip ${catId === c.id ? 'on' : ''}`} onClick={() => setCatId(c.id)}>
                  {c.name}
                  <span className="chip-x" onClick={(e) => { e.stopPropagation(); delCat(c); }}>×</span>
                </button>
              ))}
              <button className="chip add" onClick={() => setCatModal(true)}><Icon name="plus" size={14} /> {t('အမျိုးအစား')}</button>
            </div>
            <button className="btn" onClick={() => setEdit({ ...emptyItem, categoryId: catId === 'all' ? data.categories[0]?.id : catId })}>
              <Icon name="plus" size={16} /> {t('ဟင်း အသစ်')}
            </button>
          </div>

          {items.length === 0 ? <Empty text={t('ဟင်း မရှိသေးပါ')} /> : (
            <div className="menu-list">
              {items.map(it => (
                <div className="menu-row" key={it.id}>
                  <div className="mr-top">
                    <strong>{it.name}{it.is_alcohol && <span className="alc-flag">18+</span>}</strong>
                    <span className="mr-price">{money(it.price)}</span>
                  </div>
                  <div className="mr-sub">
                    {data.categories.find(c => c.id === it.category_id)?.name} · {t(it.station === 'bar' ? 'ဘား' : 'မီးဖိုချောင်')} · {t('ကုန်ကျစရိတ်')} {money(it.cost)}
                  </div>
                  <div className="mr-foot">
                    <button className={`badge ${it.available ? 'ok' : 'bad'}`} onClick={() => toggle(it)}>
                      {it.available ? t('ရောင်းချနေသည်') : t('ပိတ်ထားသည်')}
                    </button>
                    <div className="row gap">
                      <button className="link-btn" onClick={() => setRecipeFor(it)}><Icon name="box" size={13} /> {t('ပါဝင်ပစ္စည်း')}</button>
                      <button className="link-btn" onClick={() => setEdit({ ...it, categoryId: it.category_id })}>{t('ပြင်')}</button>
                      <button className="link-btn danger" onClick={() => removeItem(it)}>{t('ဖျက်')}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {items.length === 0 ? null : (
            <div className="table-wrap hide-mobile">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('အမည်')}</th>
                    <th>{t('အမျိုးအစား')}</th>
                    <th>{t('ဈေးနှုန်း')}</th>
                    <th>{t('ကုန်ကျစရိတ်')}</th>
                    <th>{t('အခြေအနေ')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id}>
                      <td><strong>{it.name}{it.is_alcohol && <span className="alc-flag">18+</span>}</strong></td>
                      <td className="muted">{data.categories.find(c => c.id === it.category_id)?.name} · {t(it.station === 'bar' ? 'ဘား' : 'မီးဖိုချောင်')}</td>
                      <td><strong>{money(it.price)}</strong></td>
                      <td className="muted">{money(it.cost)}</td>
                      <td>
                        <button className={`badge ${it.available ? 'ok' : 'bad'}`} onClick={() => toggle(it)}>
                          {it.available ? t('ရောင်းချနေသည်') : t('ပိတ်ထားသည်')}
                        </button>
                      </td>
                      <td className="right" style={{ whiteSpace: 'nowrap' }}>
                        <button className="link-btn" onClick={() => setRecipeFor(it)}><Icon name="box" size={13} /> {t('ပါဝင်ပစ္စည်း')}</button>
                        <button className="link-btn" onClick={() => setEdit({ ...it, categoryId: it.category_id })}>{t('ပြင်')}</button>
                        <button className="link-btn danger" onClick={() => removeItem(it)}>{t('ဖျက်')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'promotions' && (
        <>
          <div className="toolbar">
            <div>
              <h3>{t('ပရိုမိုးရှင်း')}</h3>
              <p className="muted small" style={{ margin: '3px 0 0' }}>{t('ငွေရှင်းချိန် အလိုအလျောက် ရွေးချယ်နိုင်မည့် အထူးဈေးများ')}</p>
            </div>
            <button className="btn amber" onClick={() => setPromoEdit({ ...emptyPromo })}><Icon name="plus" size={16} /> {t('ပရိုမိုးရှင်း အသစ်')}</button>
          </div>
          {promotions.length === 0 ? <Empty text={t('ပရိုမိုးရှင်း မရှိသေးပါ')} /> : (
            <div className="promo-grid">
              {promotions.map(p => (
                <div className={`promo-card ${p.active ? '' : 'off'}`} key={p.id}>
                  <div className="row between">
                    <span className={`badge ${p.active ? 'ok' : 'bad'}`}>{p.active ? t('အသက်ဝင်နေသည်') : t('ပိတ်ထားသည်')}</span>
                    <Switch on={!!p.active} onClick={() => togglePromo(p)} label={p.name} />
                  </div>
                  <div className="promo-value">
                    {p.type === 'percent' ? `${p.value}%` : money(p.value)}
                    <small>{p.type === 'percent' ? t('လျော့') : t('လျှော့ငွေ')}</small>
                  </div>
                  <div className="promo-name">{p.name}</div>
                  <div className="promo-meta">
                    {p.min_subtotal > 0 ? `${t('အနည်းဆုံး ဝယ်ယူငွေ')} ${money(p.min_subtotal)}` : t('ကန့်သတ်ချက် မရှိ')}
                  </div>
                  <div className="promo-meta">
                    <Icon name="clock" size={12} /> {p.start_time || '00:00'} – {p.end_time || '23:59'}
                  </div>
                  <div className="row gap" style={{ marginTop: 4 }}>
                    <button className="btn ghost sm" onClick={() => setPromoEdit({ ...p })}>{t('ပြင်')}</button>
                    <button className="btn danger sm" onClick={() => removePromo(p)}>{t('ဖျက်')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {edit && (
        <Modal title={edit.id ? t('ဟင်း ပြင်ဆင်') : t('ဟင်း အသစ်')} onClose={() => setEdit(null)} footer={<>
          <button className="btn ghost" onClick={() => setEdit(null)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={saveItem}>{t('သိမ်းမည်')}</button>
        </>}>
          <div className="form-grid">
            <Field label={t('အမည်')}><input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label={t('အမျိုးအစား')}>
              <select value={edit.categoryId || edit.category_id} onChange={e => setEdit({ ...edit, categoryId: Number(e.target.value) })}>
                {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label={t('ရောင်းစျေး (ကျပ်)')}><input type="number" value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} /></Field>
            <Field label={t('ကုန်ကျစရိတ် (ကျပ်)')}><input type="number" value={edit.cost} onChange={e => setEdit({ ...edit, cost: e.target.value })} /></Field>
            <Field label={t('ယူနစ်')}><input value={edit.unit} onChange={e => setEdit({ ...edit, unit: e.target.value })} /></Field>
            <Field label={t('ဌာန')} hint={t('ဘား ပစ္စည်းများ မီးဖိုချောင် KDS တွင် မပြပါ')}>
              <select value={edit.station || 'kitchen'} onChange={e => setEdit({ ...edit, station: e.target.value })}>
                <option value="kitchen">{t('မီးဖိုချောင်')}</option>
                <option value="bar">{t('ဘား')}</option>
              </select>
            </Field>
            <Field label={t('အရက် (18+)')}>
              <select value={edit.is_alcohol ? 1 : 0} onChange={e => setEdit({ ...edit, is_alcohol: Number(e.target.value) })}>
                <option value={0}>{t('ပုံမှန်')}</option>
                <option value={1}>18+</option>
              </select>
            </Field>
            <Field label={t('အခြေအနေ')}>
              <select value={edit.available ? 1 : 0} onChange={e => setEdit({ ...edit, available: Number(e.target.value) })}>
                <option value={1}>{t('ရောင်းချနေသည်')}</option>
                <option value={0}>{t('ပိတ်ထားသည်')}</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {catModal && (
        <Modal title={t('အမျိုးအစား အသစ်')} onClose={() => setCatModal(false)} footer={<>
          <button className="btn ghost" onClick={() => setCatModal(false)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={addCat}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('အမည်')}><input value={catName} onChange={e => setCatName(e.target.value)} placeholder={t('ဥပမာ — ကြော်ချက်')} /></Field>
        </Modal>
      )}

      {promoEdit && (
        <Modal title={promoEdit.id ? t('ပရိုမိုးရှင်း ပြင်') : t('ပရိုမိုးရှင်း အသစ်')} onClose={() => setPromoEdit(null)} footer={<>
          <button className="btn ghost" onClick={() => setPromoEdit(null)}>{t('မလုပ်တော့')}</button>
          <button className="btn" onClick={savePromo}>{t('သိမ်းမည်')}</button>
        </>}>
          <Field label={t('အမည်')}><input value={promoEdit.name} onChange={e => setPromoEdit({ ...promoEdit, name: e.target.value })} placeholder={t('ဥပမာ — ညနေ ၅% လျှော့')} /></Field>
          <div className="form-grid">
            <Field label={t('အမျိုးအစား')}>
              <select value={promoEdit.type} onChange={e => setPromoEdit({ ...promoEdit, type: e.target.value })}>
                <option value="percent">{t('ရာခိုင်နှုန်း')} (%)</option>
                <option value="amount">{t('ငွေပမာဏ')} (Ks)</option>
              </select>
            </Field>
            <Field label={promoEdit.type === 'percent' ? t('လျော့ %') : t('လျှော့ငွေ')}>
              <input type="number" value={promoEdit.value} onChange={e => setPromoEdit({ ...promoEdit, value: e.target.value })} />
            </Field>
            <Field label={t('အနည်းဆုံး ဝယ်ယူငွေ')}>
              <input type="number" value={promoEdit.min_subtotal} onChange={e => setPromoEdit({ ...promoEdit, min_subtotal: e.target.value })} />
            </Field>
            <Field label={t('အခြေအနေ')}>
              <select value={promoEdit.active ? 1 : 0} onChange={e => setPromoEdit({ ...promoEdit, active: Number(e.target.value) })}>
                <option value={1}>{t('အသက်ဝင်နေသည်')}</option>
                <option value={0}>{t('ပိတ်ထားသည်')}</option>
              </select>
            </Field>
            <Field label={t('စတင်ချိန်')}><input type="time" value={promoEdit.start_time} onChange={e => setPromoEdit({ ...promoEdit, start_time: e.target.value })} /></Field>
            <Field label={t('ပြီးဆုံးချိန်')}><input type="time" value={promoEdit.end_time} onChange={e => setPromoEdit({ ...promoEdit, end_time: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {recipeFor && (
        <Modal wide title={`${recipeFor.name} — ${t('ပါဝင်ပစ္စည်း')}`} onClose={() => setRecipeFor(null)} footer={<>
          <button className="btn ghost" onClick={() => setRecipeFor(null)}>{t('မလုပ်တော့')}</button>
          <button className="btn" disabled={recipeBusy} onClick={saveRecipe}>{t('သိမ်းမည်')}</button>
        </>}>
          <p className="hint" style={{ marginTop: 0 }}>
            {t('ဒီဟင်း ရောင်းပြီးတိုင်း ပါဝင်ပစ္စည်းများ လက်ကျန်မှ အလိုအလျောက် နုတ်သွားမည်။')}
          </p>
          <div className="recipe-lines">
            {recipeLines.length === 0 && <div className="empty">{t('ပါဝင်ပစ္စည်း မသတ်မှတ်ရသေးပါ')}</div>}
            {recipeLines.map((line, i) => {
              const inv = inventory.find(x => x.id === Number(line.inventory_item_id));
              return (
                <div className="recipe-line" key={i}>
                  <select value={line.inventory_item_id} onChange={e => setLine(i, { inventory_item_id: e.target.value })}>
                    <option value="">{t('ပစ္စည်း ရွေးပါ')}</option>
                    {inventory.map(x => (
                      <option key={x.id} value={x.id}>{x.name} ({x.qty} {x.unit})</option>
                    ))}
                  </select>
                  <input type="number" step="0.1" min="0" value={line.qty} onChange={e => setLine(i, { qty: e.target.value })} placeholder={t('ပမာဏ')} />
                  <button className="icon-btn" onClick={() => removeLine(i)} aria-label={t('ဖျက်')}><Icon name="trash" size={15} /></button>
                  {inv && <div className="hint" style={{ gridColumn: '1 / -1', marginTop: -3 }}>{t('လက်ကျန်')} {inv.qty} {inv.unit}</div>}
                </div>
              );
            })}
          </div>
          <button className="btn ghost sm" onClick={addRecipeLine}><Icon name="plus" size={15} /> {t('ပစ္စည်း ထည့်')}</button>
        </Modal>
      )}
    </div>
  );
}
