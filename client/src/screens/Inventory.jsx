import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty } from '../components/ui.jsx';
import { DataTableToolbar, Pagination } from '../components/DataTableToolbar.jsx';
import { downloadCsv } from '../csv.js';

export default function Inventory({ reload, showToast, go }) {
  const { t } = useI18n();
  const [inv, setInv] = useState({ items: [], moves: [] });
  const [moveItem, setMoveItem] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({
    name: '',
    unit: 'ကီလို',
    qty: 0,
    reorder_level: 0,
    cost: 0,
    sku: '',
    category: '',
  });
  const [move, setMove] = useState({ type: 'in', qty: '', note: '' });

  // Toolbar & Data Management States
  const [search, setSearch] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState({});
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table' | 'compact'
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [bulkMoveModal, setBulkMoveModal] = useState(false);
  const [bulkMoveForm, setBulkMoveForm] = useState({ type: 'in', qty: '', note: '' });

  const load = async () => {
    try {
      setInv(await api('/inventory'));
    } catch {}
  };
  useEffect(() => {
    load();
  }, []);

  // Reset page when filtering or searching
  useEffect(() => {
    setCurrentPage(1);
  }, [search, advancedFilters, sortField, sortOrder, pageSize]);

  const saveItem = async () => {
    try {
      if (!form.name.trim()) return showToast(t('အမည် ထည့်ပါ'));
      const payload = {
        name: form.name.trim(),
        unit: form.unit || 'ကီလို',
        qty: Number(form.qty) || 0,
        reorder_level: Number(form.reorder_level) || 0,
        cost: Math.round(Number(form.cost) || 0),
        sku: form.sku || '',
        category: form.category || '',
      };
      if (editItem) {
        await api(`/inventory/${editItem.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast(t('ပစ္စည်း ပြင်ဆင်ပြီးပါပြီ'));
      } else {
        await api('/inventory', { method: 'POST', body: JSON.stringify(payload) });
        showToast(t('ပစ္စည်း ထည့်ပြီးပါပြီ'));
      }
      setAddOpen(false);
      setEditItem(null);
      setForm({ name: '', unit: 'ကီလို', qty: 0, reorder_level: 0, cost: 0, sku: '', category: '' });
      await load();
    } catch (e) {
      showToast(e.message);
    }
  };

  const deleteItem = async (it) => {
    if (!window.confirm(`"${it.name}" ${t('ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api(`/inventory/${it.id}`, { method: 'DELETE' });
      await load();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  const applyMove = async () => {
    if (!move.qty) return showToast(t('အရေအတွက် ထည့်ပါ'));
    try {
      await api(`/inventory/${moveItem.id}/move`, { method: 'POST', body: JSON.stringify(move) });
      setMoveItem(null);
      setMove({ type: 'in', qty: '', note: '' });
      await load();
      showToast(t('စာရင်း ပြင်ပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  // Bulk Actions
  const handleBulkDelete = async () => {
    if (!window.confirm(`${selectedIds.length} ${t('ခု ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api('/inventory/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      setSelectedIds([]);
      await load();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  const handleBulkMoveSubmit = async () => {
    if (!bulkMoveForm.qty) return showToast(t('အရေအတွက် ထည့်ပါ'));
    try {
      await api('/inventory/bulk-move', {
        method: 'POST',
        body: JSON.stringify({
          ids: selectedIds,
          type: bulkMoveForm.type,
          qty: Number(bulkMoveForm.qty),
          note: bulkMoveForm.note,
        }),
      });
      setSelectedIds([]);
      setBulkMoveModal(false);
      setBulkMoveForm({ type: 'in', qty: '', note: '' });
      await load();
      showToast(t('စာရင်း ပြင်ပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  // Filtering & Sorting
  const filteredItems = (inv.items || []).filter((it) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchName = it.name.toLowerCase().includes(q);
      const matchSku = (it.sku || '').toLowerCase().includes(q);
      const matchCat = (it.category || '').toLowerCase().includes(q);
      if (!matchName && !matchSku && !matchCat) return false;
    }

    if (advancedFilters.status && advancedFilters.status !== 'all') {
      const isLow = it.qty <= it.reorder_level;
      const isOut = it.qty <= 0;
      if (advancedFilters.status === 'low' && !isLow) return false;
      if (advancedFilters.status === 'out' && !isOut) return false;
      if (advancedFilters.status === 'in_stock' && isLow) return false;
    }

    if (advancedFilters.minPrice && it.cost < Number(advancedFilters.minPrice)) return false;
    if (advancedFilters.maxPrice && it.cost > Number(advancedFilters.maxPrice)) return false;

    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (typeof valA === 'string') {
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortOrder === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
  });

  const paginatedItems =
    pageSize === 'all'
      ? sortedItems
      : sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Selection
  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  const handleSelectAll = () => setSelectedIds(filteredItems.map((i) => i.id));
  const handleDeselectAll = () => setSelectedIds([]);
  const allSelected = filteredItems.length > 0 && selectedIds.length === filteredItems.length;

  // Active Filters Count
  const activeFilterCount = Object.keys(advancedFilters).filter(
    (k) => advancedFilters[k] && advancedFilters[k] !== 'all' && advancedFilters[k] !== ''
  ).length + (search ? 1 : 0);

  // Excel Export
  const handleExportExcel = () => {
    const list = selectedIds.length > 0
      ? inv.items.filter((i) => selectedIds.includes(i.id))
      : filteredItems;

    const headers = ['SKU/ကုဒ်', 'ပစ္စည်းအမည်', 'အမျိုးအစား', 'လက်ကျန်', 'ယူနစ်', 'သတိပေးအဆင့်', 'ကုန်ကျစရိတ်'];
    const rows = list.map((it) => [
      it.sku || '',
      it.name,
      it.category || '',
      it.qty,
      it.unit,
      it.reorder_level,
      it.cost,
    ]);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(`inventory_${dateStr}.csv`, headers, rows);
    showToast(t('Excel သို့ ထုတ်ယူပြီးပါပြီ'));
  };

  // Excel Import
  const handleImportExcel = async (importedItems) => {
    try {
      const res = await api('/inventory/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ items: importedItems }),
      });
      await load();
      showToast(
        `${t('ပစ္စည်းများ တင်သွင်းပြီးပါပြီ')} — ${res.total || importedItems.length} ${t('ခု')}`
      );
    } catch (err) {
      showToast(err.message);
    }
  };

  const sampleInventoryTemplate = {
    filename: 'sample_inventory_template.csv',
    headers: ['ပစ္စည်းအမည် (Name)', 'ယူနစ် (Unit)', 'လက်ကျန် (Qty)', 'သတိပေးအဆင့် (Reorder)', 'ကုန်ကျစရိတ် (Cost)', 'SKU/ကုဒ်'],
    sampleRows: [
      ['ဆန်', 'အိတ်', '10', '3', '45000', 'INV01'],
      ['ကြက်သား', 'ကီလို', '25', '5', '9000', 'INV02'],
      ['ဆီ', 'လီတာ', '30', '8', '6500', 'INV03'],
    ],
  };

  const sortOptions = [
    { value: 'name', label: t('အမည် (A–Z)') },
    { value: 'qty', label: t('လက်ကျန် အရေအတွက်') },
    { value: 'reorder_level', label: t('သတိပေးအဆင့်') },
    { value: 'cost', label: t('ကုန်ကျစရိတ်') },
  ];

  const bulkActions = [
    {
      label: t('လက်ကျန် ဖြည့်/ထုတ်'),
      icon: 'box',
      variant: 'ghost',
      onClick: () => {
        setBulkMoveForm({ type: 'in', qty: '', note: '' });
        setBulkMoveModal(true);
      },
    },
    {
      label: t('Export လုပ်မည်'),
      icon: 'download',
      variant: 'ghost',
      onClick: handleExportExcel,
    },
    {
      label: t('ဖျက်မည်'),
      icon: 'trash',
      variant: 'danger',
      onClick: handleBulkDelete,
    },
  ];

  const lowCount = (inv.items || []).filter((it) => it.qty <= it.reorder_level).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>{t('ဂိုဒေါင်း')}</h2>
          <p className="muted small">
            {t('ကုန်ကြမ်း လက်ကျန် — ဟင်းရောင်းပြီးတိုင်း recipe အလိုက် အလိုအလျောက် နုတ်သည်')}
          </p>
        </div>
        <div className="row gap">
          {lowCount > 0 && <span className="badge bad">{lowCount} {t('ပြတ်တော့မည်')}</span>}
          <button type="button" className="btn ghost" onClick={() => go('expenses')}>
            <Icon name="cash" size={16} /> {t('အသုံးစရိတ်')}
          </button>
          <button
            type="button"
            className="btn"
            data-action="add-inventory"
            onClick={() => {
              setEditItem(null);
              setForm({ name: '', unit: 'ကီလို', qty: 0, reorder_level: 0, cost: 0, sku: '', category: '' });
              setAddOpen(true);
            }}
          >
            <Icon name="plus" size={16} /> {t('ပစ္စည်း')}
          </button>
        </div>
      </div>

      {/* Enhanced DataTable Toolbar */}
      <DataTableToolbar
        search={search}
        setSearch={setSearch}
        advancedFilters={advancedFilters}
        setAdvancedFilters={setAdvancedFilters}
        filterOptions={{
          status: [
            { value: 'low', label: t('ပြတ်တော့မည် / သတိပေးအဆင့်') },
            { value: 'out', label: t('ကုန်သွားသည် (0)') },
            { value: 'in_stock', label: t('လက်ကျန် လုံလောက်သည်') },
          ],
        }}
        sortField={sortField}
        setSortField={setSortField}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        sortOptions={sortOptions}
        viewMode={viewMode}
        setViewMode={setViewMode}
        selectedCount={selectedIds.length}
        totalCount={(inv.items || []).length}
        filteredCount={filteredItems.length}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
        allSelected={allSelected}
        bulkActions={bulkActions}
        onExportExcel={handleExportExcel}
        onImportExcel={handleImportExcel}
        sampleTemplate={sampleInventoryTemplate}
        activeFilterCount={activeFilterCount}
      />

      {sortedItems.length === 0 ? (
        <Empty text={t('ပစ္စည်း မတွေ့ပါ')} />
      ) : (
        <>
          {/* VIEW MODE 1: GRID VIEW */}
          {viewMode === 'grid' && (
            <div className="inv-grid view-switch-panel">
              {paginatedItems.map((it) => {
                const low = it.qty <= it.reorder_level;
                const isSelected = selectedIds.includes(it.id);
                const pct =
                  it.reorder_level > 0
                    ? Math.max(4, Math.min(100, (it.qty / (it.reorder_level * 3)) * 100))
                    : 100;

                return (
                  <div
                    className={`inv-card ${low ? 'low' : ''} ${isSelected ? 'selected' : ''}`}
                    key={it.id}
                  >
                    <div className="row between top">
                      <label className="row gap checkbox-row">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(it.id)}
                        />
                        <div>
                          <strong className="inv-title">{it.name}</strong>
                          {it.sku && <small className="muted block">{it.sku}</small>}
                        </div>
                      </label>
                      <span className={`badge ${low ? 'bad' : 'ok'}`}>
                        {low ? t('ပြတ်တော့မည်') : t('ပုံမှန်')}
                      </span>
                    </div>

                    <div className="inv-stock-display">
                      <span className="inv-stock-number" style={{ color: low ? '#dc2626' : 'inherit' }}>
                        {it.qty}
                      </span>
                      <span className="inv-stock-unit">{it.unit}</span>
                    </div>

                    <div className="stock-bar-wrap">
                      <div className="stock-bar">
                        <i style={{ width: `${pct}%`, background: low ? '#ef4444' : '#10b981' }} />
                      </div>
                      <div className="row between small muted mt-4">
                        <span>{t('သတိပေးအဆင့်')} {it.reorder_level} {it.unit}</span>
                        <span>{t('ကုန်ကျ')} {money(it.cost)}</span>
                      </div>
                    </div>

                    <div className="inv-actions-row">
                      <button
                        type="button"
                        className="btn sm ghost icon-text act-add"
                        onClick={() => {
                          setMoveItem(it);
                          setMove({ type: 'in', qty: '', note: '' });
                        }}
                        title={t('လက်ကျန် ဖြည့်မည်')}
                      >
                        <Icon name="plus" size={13} />
                        <span>{t('ဖြည့်')}</span>
                      </button>
                      <button
                        type="button"
                        className="btn sm ghost icon-text act-remove"
                        onClick={() => {
                          setMoveItem(it);
                          setMove({ type: 'out', qty: '', note: '' });
                        }}
                        title={t('လက်ကျန် ထုတ်မည်')}
                      >
                        <Icon name="minus" size={13} />
                        <span>{t('ထုတ်')}</span>
                      </button>
                      <button
                        type="button"
                        className="btn sm ghost icon-text act-edit"
                        onClick={() => {
                          setEditItem(it);
                          setForm({ ...it });
                          setAddOpen(true);
                        }}
                        title={t('ပြင်ဆင်ရန်')}
                      >
                        <Icon name="edit" size={13} />
                        <span>{t('ပြင်')}</span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn small act-delete"
                        onClick={() => deleteItem(it)}
                        title={t('ဖျက်')}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 2: TABLE VIEW */}
          {viewMode === 'table' && (
            <div className="table-wrap view-switch-panel">
              <table className="table">
                <thead>
                  <tr>
                    <th className="col-xs">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={allSelected ? handleDeselectAll : handleSelectAll}
                        aria-label={t('အားလုံး ရွေးမည်')}
                      />
                    </th>
                    <th>{t('ပစ္စည်း အမည်')}</th>
                    <th>{t('လက်ကျန်')}</th>
                    <th>{t('ယူနစ်')}</th>
                    <th>{t('သတိပေးအဆင့်')}</th>
                    <th>{t('ကုန်ကျစရိတ်')}</th>
                    <th>{t('အခြေအနေ')}</th>
                    <th className="right">{t('လုပ်ဆောင်ချက်')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((it) => {
                    const low = it.qty <= it.reorder_level;
                    const isSelected = selectedIds.includes(it.id);

                    return (
                      <tr key={it.id} className={isSelected ? 'selected-row' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(it.id)}
                          />
                        </td>
                        <td>
                          <strong>{it.name}</strong>
                          {it.sku && <small className="muted"> ({it.sku})</small>}
                        </td>
                        <td>
                          <strong style={{ color: low ? '#ef4444' : 'inherit' }}>{it.qty}</strong>
                        </td>
                        <td className="muted">{it.unit}</td>
                        <td className="muted">{it.reorder_level}</td>
                        <td>{money(it.cost)}</td>
                        <td>
                          {low ? (
                            <span className="badge bad">{t('ပြတ်တော့မည်')}</span>
                          ) : (
                            <span className="badge ok">{t('ပုံမှန်')}</span>
                          )}
                        </td>
                        <td className="right nowrap">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setMoveItem(it);
                              setMove({ type: 'in', qty: '', note: '' });
                            }}
                          >
                            {t('ဖြည့်')}
                          </button>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setMoveItem(it);
                              setMove({ type: 'out', qty: '', note: '' });
                            }}
                          >
                            {t('ထုတ်')}
                          </button>
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => {
                              setEditItem(it);
                              setForm({ ...it });
                              setAddOpen(true);
                            }}
                          >
                            {t('ပြင်')}
                          </button>
                          <button
                            type="button"
                            className="link-btn danger"
                            onClick={() => deleteItem(it)}
                          >
                            {t('ဖျက်')}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={filteredItems.length}
            onPageChange={(p) => setCurrentPage(p)}
            onPageSizeChange={(sz) => setPageSize(sz)}
          />
        </>
      )}

      {/* Recent Movements Section */}
      <section className="panel mt-12">
        <div className="panel-head">
          <h3>
            <Icon name="box" size={16} /> {t('မကြာမီ လှုပ်ရှားမှုများ')}
          </h3>
        </div>
        {inv.moves.length === 0 ? (
          <div className="empty">{t('မရှိသေးပါ')}</div>
        ) : (
          <div className="list">
            {inv.moves.slice(0, 15).map((m) => {
              const item = (inv.items || []).find((i) => i.id === m.item_id);
              const label =
                m.type === 'in'
                  ? t('ဝင်')
                  : m.type === 'out'
                  ? t('ထွက်')
                  : m.type === 'sale'
                  ? t('အရောင်း အတွက် နုတ်')
                  : m.type === 'void_return'
                  ? t('ပြန်သွင်း')
                  : t('ညှိ');
              return (
                <div className="list-row static" key={m.id}>
                  <div className="grow">
                    <strong>
                      {item?.name || '—'}{' '}
                      <span
                        className={`badge ${
                          m.type === 'out' || m.type === 'sale' ? 'bad' : 'ok'
                        }`}
                      >
                        {label}
                      </span>
                    </strong>
                    <small className="muted">
                      {m.created_at} {m.note && `· ${m.note}`}
                    </small>
                  </div>
                  <span className="amount">
                    {m.type === 'out' || m.type === 'sale' ? '-' : '+'}
                    {m.qty}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add / Edit Inventory Modal */}
      {addOpen && (
        <Modal
          title={editItem ? t('ပစ္စည်း ပြင်ဆင်') : t('ပစ္စည်း အသစ်')}
          onClose={() => setAddOpen(false)}
          footer={<>
            <button type="button" className="btn ghost" onClick={() => setAddOpen(false)}>
              {t('မလုပ်တော့')}
            </button>
            <button type="button" className="btn" onClick={saveItem}>
              {t('သိမ်းမည်')}
            </button>
          </>}
        >
          <Field label={t('အမည်')}>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('ဥပမာ — ဆန်၊ ကြက်သား')}
            />
          </Field>
          <div className="form-grid">
            <Field label={t('ယူနစ်')}>
              <input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="ကီလို"
              />
            </Field>
            <Field label={t('လက်ကျန်')}>
              <input
                type="number"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
              />
            </Field>
            <Field label={t('သတိပေးအဆင့်')}>
              <input
                type="number"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
              />
            </Field>
            <Field label={t('ကုန်ကျစရိတ်')}>
              <input
                type="number"
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </Field>
            <Field label={t('SKU / ကုဒ်')}>
              <input
                value={form.sku || ''}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                placeholder="INV-01"
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Single Move Stock Modal */}
      {moveItem && (
        <Modal
          title={`${moveItem.name} — ${move.type === 'in' ? t('ဖြည့်မည်') : t('ထုတ်မည်')}`}
          onClose={() => setMoveItem(null)}
          footer={<>
            <button type="button" className="btn ghost" onClick={() => setMoveItem(null)}>
              {t('မလုပ်တော့')}
            </button>
            <button type="button" className="btn" onClick={applyMove}>
              {t('အတည်ပြု')}
            </button>
          </>}
        >
          <Field label={t('အမျိုးအစား')}>
            <select
              value={move.type}
              onChange={(e) => setMove({ ...move, type: e.target.value })}
            >
              <option value="in">{t('ဖြည့်သွင်း (ဝင်)')}</option>
              <option value="out">{t('ထုတ်ယူ (ထွက်)')}</option>
              <option value="adjust">{t('စာရင်းညှိ')}</option>
            </select>
          </Field>
          <Field label={`${t('အရေအတွက်')} (${moveItem.unit})`}>
            <input
              type="number"
              step="0.1"
              value={move.qty}
              onChange={(e) => setMove({ ...move, qty: e.target.value })}
            />
          </Field>
          <Field label={t('မှတ်ချက်')}>
            <input
              value={move.note}
              onChange={(e) => setMove({ ...move, note: e.target.value })}
              placeholder={t('ဥပမာ — စျေးဝယ်ယူလာခြင်း')}
            />
          </Field>
        </Modal>
      )}

      {/* Bulk Move Stock Modal */}
      {bulkMoveModal && (
        <Modal
          title={t('ရွေးချယ်ထားသော ပစ္စည်းများ လက်ကျန် ဖြည့်/ထုတ်')}
          onClose={() => setBulkMoveModal(false)}
          footer={<>
            <button type="button" className="btn ghost" onClick={() => setBulkMoveModal(false)}>
              {t('မလုပ်တော့')}
            </button>
            <button type="button" className="btn" onClick={handleBulkMoveSubmit}>
              {t('အတည်ပြု')}
            </button>
          </>}
        >
          <p className="muted small">
            {selectedIds.length} {t('ခု အတွက် စာရင်း ထည့်သွင်းမည်-')}
          </p>
          <Field label={t('အမျိုးအစား')}>
            <select
              value={bulkMoveForm.type}
              onChange={(e) => setBulkMoveForm({ ...bulkMoveForm, type: e.target.value })}
            >
              <option value="in">{t('ဖြည့်သွင်း (ဝင်)')}</option>
              <option value="out">{t('ထုတ်ယူ (ထွက်)')}</option>
            </select>
          </Field>
          <Field label={t('အရေအတွက်')}>
            <input
              type="number"
              step="0.1"
              value={bulkMoveForm.qty}
              onChange={(e) => setBulkMoveForm({ ...bulkMoveForm, qty: e.target.value })}
            />
          </Field>
          <Field label={t('မှတ်ချက်')}>
            <input
              value={bulkMoveForm.note}
              onChange={(e) => setBulkMoveForm({ ...bulkMoveForm, note: e.target.value })}
              placeholder={t('ဥပမာ — လက်ကျန်စစ်ဆေးခြင်း')}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
