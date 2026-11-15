import React, { useEffect, useState } from 'react';
import { api, money } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal, Field, Empty, Switch } from '../components/ui.jsx';
import { DataTableToolbar, Pagination } from '../components/DataTableToolbar.jsx';
import { ImagePickerModal } from '../components/FoodPresetPicker.jsx';
import { getFoodImage } from '../foodPresets.js';
import { downloadCsv } from '../csv.js';

const emptyItem = {
  name: '',
  price: '',
  cost: '',
  unit: 'ပွဲ',
  category_id: null,
  available: 1,
  is_alcohol: 0,
  station: 'kitchen',
  image: '',
  code: '',
};

const emptyPromo = {
  name: '',
  type: 'percent',
  value: 5,
  min_subtotal: 0,
  start_time: '',
  end_time: '',
  active: 1,
};

export default function MenuAdmin({ data, reload, showToast }) {
  const { t } = useI18n();
  const [tab, setTab] = useState('items'); // 'items' | 'promotions'
  const [catId, setCatId] = useState('all');

  // Toolbar & Data Management States
  const [search, setSearch] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState({});
  const [sortField, setSortField] = useState('sort');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table' | 'compact'
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Modals
  const [edit, setEdit] = useState(null);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const [catEdit, setCatEdit] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', sort: 0 });
  const [catSearch, setCatSearch] = useState('');
  const [bulkCatModal, setBulkCatModal] = useState(false);
  const [targetCatId, setTargetCatId] = useState('');
  const [promoEdit, setPromoEdit] = useState(null);
  const [recipeFor, setRecipeFor] = useState(null);
  const [recipeLines, setRecipeLines] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [recipeBusy, setRecipeBusy] = useState(false);

  const promotions = data.promotions || [];

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, catId, advancedFilters, sortField, sortOrder, pageSize]);

  // Load recipe inventory dependencies
  useEffect(() => {
    if (!recipeFor) return;
    let alive = true;
    Promise.all([api(`/recipes/${recipeFor.id}`), api('/inventory')])
      .then(([lines, inv]) => {
        if (!alive) return;
        setRecipeLines(lines.map((l) => ({ inventory_item_id: l.inventory_item_id, qty: l.qty })));
        setInventory(inv.items || []);
      })
      .catch((e) => showToast(e.message));
    return () => {
      alive = false;
    };
  }, [recipeFor]);

  // Filter & Search Logic
  const filteredItems = data.items.filter((i) => {
    // Quick Category Chip
    if (catId !== 'all' && i.category_id !== catId) return false;

    // Advanced Category
    if (
      advancedFilters.categoryId &&
      advancedFilters.categoryId !== 'all' &&
      i.category_id !== Number(advancedFilters.categoryId)
    ) {
      return false;
    }

    // Search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchName = i.name.toLowerCase().includes(q);
      const matchCode = (i.code || '').toLowerCase().includes(q);
      const catName = (data.categories.find((c) => c.id === i.category_id)?.name || '').toLowerCase();
      if (!matchName && !matchCode && !catName.includes(q)) return false;
    }

    // Station
    if (
      advancedFilters.station &&
      advancedFilters.station !== 'all' &&
      (i.station || 'kitchen') !== advancedFilters.station
    ) {
      return false;
    }

    // Status
    if (advancedFilters.status && advancedFilters.status !== 'all') {
      if (advancedFilters.status === 'available' && !i.available) return false;
      if (advancedFilters.status === 'unavailable' && i.available) return false;
    }

    // Price range
    if (advancedFilters.minPrice && i.price < Number(advancedFilters.minPrice)) return false;
    if (advancedFilters.maxPrice && i.price > Number(advancedFilters.maxPrice)) return false;

    // Has image
    if (advancedFilters.hasImage === 'yes' && !i.image) return false;
    if (advancedFilters.hasImage === 'no' && i.image) return false;

    return true;
  });

  // Sorting
  const sortedItems = [...filteredItems].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (sortField === 'category') {
      valA = data.categories.find((c) => c.id === a.category_id)?.name || '';
      valB = data.categories.find((c) => c.id === b.category_id)?.name || '';
    } else if (sortField === 'sort') {
      valA = a.sort || 0;
      valB = b.sort || 0;
    }
    if (typeof valA === 'string') {
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortOrder === 'asc' ? (Number(valA) || 0) - (Number(valB) || 0) : (Number(valB) || 0) - (Number(valA) || 0);
  });

  // Pagination slicing
  const paginatedItems =
    pageSize === 'all'
      ? sortedItems
      : sortedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Selection handlers
  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedIds(filteredItems.map((i) => i.id));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const allSelected =
    filteredItems.length > 0 && selectedIds.length === filteredItems.length;

  // Active filter count
  const activeFilterCount = Object.keys(advancedFilters).filter(
    (k) => advancedFilters[k] && advancedFilters[k] !== 'all' && advancedFilters[k] !== ''
  ).length + (search ? 1 : 0);

  // Actions
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
        sort: Number(edit.sort) || 0,
        is_alcohol: edit.is_alcohol ? 1 : 0,
        station: edit.station === 'bar' ? 'bar' : 'kitchen',
        image: edit.image || '',
        code: edit.code || '',
      };
      if (edit.id) await api(`/items/${edit.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/items', { method: 'POST', body: JSON.stringify(payload) });
      setEdit(null);
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  const removeItem = async (it) => {
    if (!window.confirm(`"${it.name}" ${t('ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api(`/items/${it.id}`, { method: 'DELETE' });
      await reload();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  const toggle = async (it) => {
    try {
      await api(`/items/${it.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ available: it.available ? 0 : 1 }),
      });
      await reload();
    } catch (e) {
      showToast(e.message);
    }
  };

  const saveCat = async () => {
    if (!catForm.name.trim()) return showToast(t('အမျိုးအစား အမည် ထည့်ပါ'));
    try {
      const payload = {
        name: catForm.name.trim(),
        sort: Number(catForm.sort) || 0,
      };
      if (catEdit) {
        await api(`/categories/${catEdit.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast(t('အမျိုးအစား ပြင်ဆင်ပြီးပါပြီ'));
      } else {
        await api('/categories', { method: 'POST', body: JSON.stringify(payload) });
        showToast(t('အမျိုးအစား အသစ် ထည့်ပြီးပါပြီ'));
      }
      setCatModal(false);
      setCatEdit(null);
      setCatForm({ name: '', sort: 0 });
      await reload();
    } catch (e) {
      showToast(e.message);
    }
  };

  const moveCat = async (cat, direction) => {
    const list = [...data.categories].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const idx = list.findIndex((c) => c.id === cat.id);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const other = list[targetIdx];
    try {
      const curSort = cat.sort ?? idx * 10;
      const otherSort = other.sort ?? targetIdx * 10;
      await api(`/categories/${cat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sort: otherSort }),
      });
      await api(`/categories/${other.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ sort: curSort }),
      });
      await reload();
      showToast(t('အစီအစဉ် ပြောင်းလဲပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  const delCat = async (c) => {
    const dishCount = data.items.filter((i) => i.category_id === c.id).length;
    if (dishCount > 0) {
      return showToast(`${t('ဒီအမျိုးအစားတွင် ဟင်း')} ${dishCount} ${t('မျိုး ရှိနေသောကြောင့် ဖျက်၍မရပါ')}`);
    }
    if (!window.confirm(`"${c.name}" ${t('ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE' });
      if (catId === c.id) setCatId('all');
      await reload();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  // Bulk Handlers
  const handleBulkDelete = async () => {
    if (!window.confirm(`${selectedIds.length} ${t('ခု ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api('/items/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selectedIds }) });
      setSelectedIds([]);
      await reload();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  const handleBulkStatus = async (available) => {
    try {
      await api('/items/bulk-status', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, available: available ? 1 : 0 }),
      });
      setSelectedIds([]);
      await reload();
      showToast(t('အခြေအနေ ပြောင်းပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  const handleBulkCategorySave = async () => {
    if (!targetCatId) return;
    try {
      await api('/items/bulk-category', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, category_id: Number(targetCatId) }),
      });
      setSelectedIds([]);
      setBulkCatModal(false);
      await reload();
      showToast(t('အမျိုးအစား ပြောင်းလဲပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  // Excel Export
  const handleExportExcel = (itemsToExport = filteredItems) => {
    const list = selectedIds.length > 0
      ? data.items.filter((i) => selectedIds.includes(i.id))
      : itemsToExport;

    const headers = [
      'ကုဒ်',
      'အမည်',
      'အမျိုးအစား',
      'ရောင်းဈေး',
      'ကုန်ကျစရိတ်',
      'ယူနစ်',
      'ဌာန',
      'အခြေအနေ',
      'အရက်',
      'ပုံ URL',
    ];

    const rows = list.map((it) => [
      it.code || '',
      it.name,
      data.categories.find((c) => c.id === it.category_id)?.name || '',
      it.price,
      it.cost || 0,
      it.unit || 'ပွဲ',
      it.station === 'bar' ? 'ဘား' : 'မီးဖိုချောင်',
      it.available ? 'ရောင်းချနေသည်' : 'ပိတ်ထားသည်',
      it.is_alcohol ? '18+' : 'ပုံမှန်',
      it.image || '',
    ]);

    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(`menu_items_${dateStr}.csv`, headers, rows);
    showToast(t('Excel သို့ ထုတ်ယူပြီးပါပြီ'));
  };

  // Excel Import
  const handleImportExcel = async (importedItems) => {
    try {
      const res = await api('/items/bulk-import', {
        method: 'POST',
        body: JSON.stringify({ items: importedItems }),
      });
      await reload();
      showToast(
        `${t('ဟင်းပွဲများ တင်သွင်းပြီးပါပြီ')} — ${res.total || importedItems.length} ${t('ခု')}`
      );
    } catch (err) {
      showToast(err.message);
    }
  };

  const sampleMenuTemplate = {
    filename: 'sample_menu_template.csv',
    headers: [
      'အမည် (Name)',
      'အမျိုးအစား (Category)',
      'ရောင်းဈေး (Price)',
      'ကုန်ကျစရိတ် (Cost)',
      'ယူနစ် (Unit)',
      'ကုဒ် (Code)',
      'ဌာန (Station)',
    ],
    sampleRows: [
      ['ကြက်သားထမင်းကြော်', 'ထမင်း', '3500', '1800', 'ပွဲ', 'M01', 'kitchen'],
      ['မုန့်ဟင်းခါး', 'မုန့်/ခေါက်ဆွဲ', '2500', '1200', 'ပွဲ', 'M02', 'kitchen'],
      ['မြန်မာဘီယာ (ဘူး)', 'ဘီယာ/အရက်', '4000', '2500', 'ဘူး', 'B01', 'bar'],
    ],
  };

  // Promotions handlers
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
        active: promoEdit.active ? 1 : 0,
      };
      if (promoEdit.id) await api(`/promotions/${promoEdit.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      else await api('/promotions', { method: 'POST', body: JSON.stringify(payload) });
      setPromoEdit(null);
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  const togglePromo = async (p) => {
    try {
      await api(`/promotions/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: p.active ? 0 : 1 }) });
      await reload();
    } catch (e) {
      showToast(e.message);
    }
  };

  const removePromo = async (p) => {
    if (!window.confirm(`"${p.name}" ${t('ဖျက်မှာ သေချာပါသလား?')}`)) return;
    try {
      await api(`/promotions/${p.id}`, { method: 'DELETE' });
      await reload();
      showToast(t('ဖျက်ပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
  };

  // Recipes
  const addRecipeLine = () => setRecipeLines((lines) => [...lines, { inventory_item_id: '', qty: 1 }]);
  const setLine = (i, patch) =>
    setRecipeLines((lines) => lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i) => setRecipeLines((lines) => lines.filter((_, idx) => idx !== i));

  const saveRecipe = async () => {
    setRecipeBusy(true);
    try {
      const lines = recipeLines
        .filter((l) => l.inventory_item_id && Number(l.qty) > 0)
        .map((l) => ({ inventory_item_id: Number(l.inventory_item_id), qty: Number(l.qty) }));
      await api(`/recipes/${recipeFor.id}`, { method: 'PUT', body: JSON.stringify({ lines }) });
      setRecipeFor(null);
      await reload();
      showToast(t('သိမ်းပြီးပါပြီ'));
    } catch (e) {
      showToast(e.message);
    }
    setRecipeBusy(false);
  };

  const sortOptions = [
    { value: 'sort', label: t('ပုံမှန် အစီအစဉ်') },
    { value: 'name', label: t('အမည် (A–Z)') },
    { value: 'price', label: t('ရောင်းဈေး') },
    { value: 'cost', label: t('ကုန်ကျစရိတ်') },
    { value: 'category', label: t('အမျိုးအစား') },
    { value: 'available', label: t('အခြေအနေ') },
  ];

  const bulkActions = [
    {
      label: t('ရောင်းချမှု ဖွင့်မည်'),
      icon: 'check',
      variant: 'ghost',
      onClick: () => handleBulkStatus(true),
    },
    {
      label: t('ရောင်းချမှု ပိတ်မည်'),
      icon: 'close',
      variant: 'ghost',
      onClick: () => handleBulkStatus(false),
    },
    {
      label: t('အမျိုးအစား ပြောင်းမည်'),
      icon: 'tag',
      variant: 'ghost',
      onClick: () => {
        setTargetCatId(data.categories[0]?.id || '');
        setBulkCatModal(true);
      },
    },
    {
      label: t('Export လုပ်မည်'),
      icon: 'download',
      variant: 'ghost',
      onClick: () => handleExportExcel(),
    },
    {
      label: t('ဖျက်မည်'),
      icon: 'trash',
      variant: 'danger',
      onClick: handleBulkDelete,
    },
  ];

  return (
    <div className="stack">
      {/* Top Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'items' ? 'on' : ''}`} onClick={() => setTab('items')}>
          <Icon name="bowl" size={15} /> {t('ဟင်းပွဲများ')} <span className="tab-count">{data.items.length}</span>
        </button>
        <button className={`tab ${tab === 'categories' ? 'on' : ''}`} onClick={() => setTab('categories')}>
          <Icon name="tag" size={15} /> {t('အမျိုးအစား (Type)')} <span className="tab-count">{data.categories.length}</span>
        </button>
        <button className={`tab ${tab === 'promotions' ? 'on' : ''}`} onClick={() => setTab('promotions')}>
          <Icon name="spark" size={15} /> {t('ပရိုမိုးရှင်း')} <span className="tab-count">{promotions.length}</span>
        </button>
      </div>

      {tab === 'items' && (
        <>
          {/* Advanced Enhanced Toolbar with Dropdown Category Filter */}
          <DataTableToolbar
            search={search}
            setSearch={setSearch}
            categoryFilter={{
              value: catId,
              onChange: setCatId,
              options: data.categories,
              counts: (cId) =>
                cId === 'all'
                  ? data.items.length
                  : data.items.filter((i) => i.category_id === cId).length,
            }}
            advancedFilters={advancedFilters}
            setAdvancedFilters={setAdvancedFilters}
            filterOptions={{
              status: [
                { value: 'available', label: t('ရောင်းချနေသည်') },
                { value: 'unavailable', label: t('ပိတ်ထားသည်') },
              ],
              station: true,
              hasImage: true,
            }}
            sortField={sortField}
            setSortField={setSortField}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            sortOptions={sortOptions}
            viewMode={viewMode}
            setViewMode={setViewMode}
            selectedCount={selectedIds.length}
            totalCount={data.items.length}
            filteredCount={filteredItems.length}
            onSelectAll={handleSelectAll}
            onDeselectAll={handleDeselectAll}
            allSelected={allSelected}
            bulkActions={bulkActions}
            onExportExcel={() => handleExportExcel()}
            onImportExcel={handleImportExcel}
            sampleTemplate={sampleMenuTemplate}
            activeFilterCount={activeFilterCount}
            primaryAction={
              <button
                type="button"
                className="btn"
                data-action="add-dish"
                onClick={() =>
                  setEdit({
                    ...emptyItem,
                    categoryId: catId === 'all' ? data.categories[0]?.id : catId,
                  })
                }
              >
                <Icon name="plus" size={16} /> {t('ဟင်း အသစ်')}
              </button>
            }
          />

          {/* Empty State */}
          {sortedItems.length === 0 ? (
            <Empty text={t('ဟင်း မတွေ့ပါ')} />
          ) : (
            <>
              {/* VIEW MODE 1: GRID VIEW (Redesigned for maximum clarity & convenience) */}
              {viewMode === 'grid' && (
                <div className="dish-card-grid">
                  {paginatedItems.map((it) => {
                    const isSelected = selectedIds.includes(it.id);
                    const cat = data.categories.find((c) => c.id === it.category_id);
                    const imgUrl = getFoodImage(it, cat?.name);
                    const profit = it.cost > 0 ? (it.price - it.cost) : 0;
                    const marginPct = (it.cost > 0 && it.price > 0) ? Math.round((profit / it.price) * 100) : 0;

                    return (
                      <div
                        key={it.id}
                        className={`dish-card ${isSelected ? 'selected' : ''} ${!it.available ? 'off' : ''}`}
                      >
                        {/* Top Media Header */}
                        <div
                          className="dish-card-media"
                          onClick={() => setEdit({ ...it, categoryId: it.category_id })}
                          title={`${it.name} — ${t('ပြင်ဆင်ရန် နှိပ်ပါ')}`}
                        >
                          <img
                            src={imgUrl}
                            alt={it.name}
                            className="dish-img"
                            loading="lazy"
                          />
                          <div className="dish-media-overlay" />

                          {/* Top-left: Selection Checkbox */}
                          <label className="dish-checkbox" onClick={(e) => e.stopPropagation()} title={t('ရွေးချယ်ရန်')}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelect(it.id)}
                            />
                          </label>

                          {/* Top-right Badges (18+, Code, Station) */}
                          <div className="dish-media-badges">
                            {it.is_alcohol ? <span className="alc-badge">18+</span> : null}
                            {it.code ? <span className="dish-code-badge">{it.code}</span> : null}
                            <span className="station-badge">
                              {t(it.station === 'bar' ? 'ဘား' : 'မီးဖို')}
                            </span>
                          </div>

                          {/* Bottom-left Category pill */}
                          <span className="dish-cat-pill">
                            {cat?.name || '—'}
                          </span>

                          {/* Bottom-right Status Badge Toggle */}
                          <button
                            type="button"
                            className={`badge dish-status-badge ${it.available ? 'ok' : 'bad'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle(it);
                            }}
                            title={it.available ? t('ရောင်းချမှု ပိတ်မည်') : t('ရောင်းချမှု ဖွင့်မည်')}
                          >
                            <span className={`status-dot ${it.available ? 'on' : 'off'}`} />
                            {it.available ? t('ရောင်းချနေသည်') : t('ပိတ်ထားသည်')}
                          </button>
                        </div>

                        {/* Card Body */}
                        <div className="dish-card-body">
                          {/* Title & Unit */}
                          <div className="dish-title-row">
                            <h4
                              className="dish-title"
                              title={it.name}
                              onClick={() => setEdit({ ...it, categoryId: it.category_id })}
                            >
                              {it.name}
                            </h4>
                            {it.unit && <span className="dish-unit-pill">/{it.unit}</span>}
                          </div>

                          {/* Financials: Price, Cost, Profit Margin */}
                          <div className="dish-financials-box">
                            <div className="price-item">
                              <span className="fin-label">{t('ရောင်းဈေး')}</span>
                              <strong className="fin-price">{money(it.price)}</strong>
                            </div>
                            <div className="price-divider" />
                            <div className="cost-item">
                              <span className="fin-label">{t('ကုန်ကျစရိတ်')}</span>
                              <span className="fin-cost">{it.cost > 0 ? money(it.cost) : '—'}</span>
                            </div>
                            {profit > 0 && (
                              <div className="profit-tag" title={t('အသားတင် အမြတ်ငွေ')}>
                                <small>+{money(profit)}</small>
                                <span>({marginPct}%)</span>
                              </div>
                            )}
                          </div>

                          {/* Card Footer Actions */}
                          <div className="dish-card-foot">
                            <button
                              type="button"
                              className="btn ghost sm icon-text"
                              onClick={() => setRecipeFor(it)}
                              title={t('ပါဝင်ပစ္စည်းများ သတ်မှတ်မည်')}
                            >
                              <Icon name="box" size={14} />
                              <span>{t('ပါဝင်ပစ္စည်း')}</span>
                            </button>
                            <div className="dish-actions-right">
                              <button
                                type="button"
                                className="btn ghost sm icon-text"
                                onClick={() => setEdit({ ...it, categoryId: it.category_id })}
                                title={t('ပြင်ဆင်ရန်')}
                              >
                                <Icon name="edit" size={13} />
                                <span>{t('ပြင်')}</span>
                              </button>
                              <button
                                type="button"
                                className="icon-btn small danger"
                                onClick={() => removeItem(it)}
                                title={t('ဖျက်')}
                              >
                                <Icon name="trash" size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* VIEW MODE 2: TABLE VIEW */}
              {viewMode === 'table' && (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={allSelected ? handleDeselectAll : handleSelectAll}
                            aria-label={t('အားလုံး ရွေးမည်')}
                          />
                        </th>
                        <th style={{ width: 56 }}>{t('ပုံ')}</th>
                        <th>{t('အမည်')}</th>
                        <th>{t('ကုဒ်')}</th>
                        <th>{t('အမျိုးအစား')}</th>
                        <th>{t('ဈေးနှုန်း')}</th>
                        <th>{t('ကုန်ကျစရိတ်')}</th>
                        <th>{t('အခြေအနေ')}</th>
                        <th className="right">{t('လုပ်ဆောင်ချက်')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((it) => {
                        const isSelected = selectedIds.includes(it.id);
                        const cat = data.categories.find((c) => c.id === it.category_id);
                        const imgUrl = getFoodImage(it, cat?.name);

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
                              <div
                                className="table-thumb"
                                onClick={() => setEdit({ ...it, categoryId: it.category_id })}
                              >
                                <img src={imgUrl} alt="" className="thumb-img" />
                              </div>
                            </td>
                            <td>
                              <div className="row gap" style={{ alignItems: 'center' }}>
                                <strong>{it.name}</strong>
                                {it.is_alcohol && <span className="alc-flag">18+</span>}
                              </div>
                            </td>
                            <td className="muted">{it.code || '—'}</td>
                            <td className="muted">
                              {cat?.name} · {t(it.station === 'bar' ? 'ဘား' : 'မီးဖိုချောင်')}
                            </td>
                            <td>
                              <strong>{money(it.price)}</strong>
                            </td>
                            <td className="muted">{money(it.cost)}</td>
                            <td>
                              <button
                                type="button"
                                className={`badge ${it.available ? 'ok' : 'bad'}`}
                                onClick={() => toggle(it)}
                              >
                                {it.available ? t('ရောင်းချနေသည်') : t('ပိတ်ထားသည်')}
                              </button>
                            </td>
                            <td className="right" style={{ whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => setRecipeFor(it)}
                              >
                                <Icon name="box" size={13} /> {t('ပါဝင်ပစ္စည်း')}
                              </button>
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => setEdit({ ...it, categoryId: it.category_id })}
                              >
                                {t('ပြင်')}
                              </button>
                              <button
                                type="button"
                                className="link-btn danger"
                                onClick={() => removeItem(it)}
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

              {/* Pagination Bar */}
              <Pagination
                currentPage={currentPage}
                pageSize={pageSize}
                totalItems={filteredItems.length}
                onPageChange={(p) => setCurrentPage(p)}
                onPageSizeChange={(sz) => setPageSize(sz)}
              />
            </>
          )}
        </>
      )}

      {/* Categories / Type Management Tab */}
      {tab === 'categories' && (
        <div className="stack" style={{ gap: 16 }}>
          {/* Header Toolbar */}
          <div className="page-head" style={{ marginBottom: 0 }}>
            <div>
              <h3>{t('ဟင်းပွဲ အမျိုးအစားများ (Type / Categories)')}</h3>
              <p className="muted small" style={{ margin: '3px 0 0' }}>
                {t('အစားအသောက် အမျိုးအစားများ စီမံခြင်းနှင့် ပြသမည့် ဦးစားပေး အစီအစဉ်များ သတ်မှတ်ခြင်း')}
              </p>
            </div>
            <button
              type="button"
              className="btn"
              data-action="add-category"
              onClick={() => {
                setCatEdit(null);
                setCatForm({ name: '', sort: (data.categories.length + 1) * 10 });
                setCatModal(true);
              }}
            >
              <Icon name="plus" size={16} /> {t('အမျိုးအစား အသစ်')}
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div
            className="stats-grid"
            style={{
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <div className="stat-card">
              <span className="stat-label">{t('စုစုပေါင်း အမျိုးအစား')}</span>
              <strong className="stat-val">{data.categories.length}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('စုစုပေါင်း ဟင်းပွဲ အရေအတွက်')}</span>
              <strong className="stat-val">{data.items.length}</strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">{t('ပျမ်းမျှ ဟင်းပွဲ ပါဝင်မှု')}</span>
              <strong className="stat-val">
                {data.categories.length
                  ? (data.items.length / data.categories.length).toFixed(1)
                  : 0}{' '}
                {t('မျိုး')}
              </strong>
            </div>
          </div>

          {/* Category Search Input */}
          <div className="search-box" style={{ maxWidth: 360 }}>
            <Icon name="search" size={16} />
            <input
              type="text"
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder={t('အမျိုးအစား ရှာဖွေပါ...')}
            />
            {catSearch && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setCatSearch('')}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          {/* Categories Grid */}
          {data.categories.length === 0 ? (
            <Empty text={t('အမျိုးအစား မရှိသေးပါ')} />
          ) : (
            <div className="cat-manage-grid">
              {[...data.categories]
                .filter((c) =>
                  catSearch.trim()
                    ? c.name.toLowerCase().includes(catSearch.trim().toLowerCase())
                    : true
                )
                .sort((a, b) => (a.sort || 0) - (b.sort || 0))
                .map((c, idx, arr) => {
                  const dishes = data.items.filter((i) => i.category_id === c.id);
                  const activeCount = dishes.filter((i) => i.available).length;

                  return (
                    <div className="cat-manage-card" key={c.id}>
                      <div className="cat-card-header">
                        <div className="cat-badge-icon">
                          <Icon name="tag" size={18} />
                        </div>
                        <div className="cat-card-info">
                          <h4 className="cat-card-name" title={c.name}>{c.name}</h4>
                          <span className="cat-sort-label muted small">
                            {t('အစီအစဉ်')} #{c.sort || idx + 1}
                          </span>
                        </div>
                        <div className="cat-card-actions">
                          <button
                            type="button"
                            className="icon-btn small"
                            disabled={idx === 0}
                            onClick={() => moveCat(c, 'up')}
                            title={t('အထက်သို့ ရွှေ့မည်')}
                          >
                            <Icon name="arrow" size={14} style={{ transform: 'rotate(-90deg)' }} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn small"
                            disabled={idx === arr.length - 1}
                            onClick={() => moveCat(c, 'down')}
                            title={t('အောက်သို့ ရွှေ့မည်')}
                          >
                            <Icon name="arrow" size={14} style={{ transform: 'rotate(90deg)' }} />
                          </button>
                        </div>
                      </div>

                      <div className="cat-card-stats">
                        <div className="cat-stat-item">
                          <span className="stat-sub">{t('ဟင်းပွဲ အရေအတွက်')}</span>
                          <strong>{dishes.length} {t('မျိုး')}</strong>
                        </div>
                        <div className="cat-stat-item">
                          <span className="stat-sub">{t('ရောင်းချနေသည်')}</span>
                          <span className="badge ok" style={{ fontSize: 11, padding: '1px 6px', display: 'inline-flex', width: 'fit-content' }}>
                            {activeCount} {t('မျိုး')}
                          </span>
                        </div>
                      </div>

                      <div className="cat-card-footer">
                        <button
                          type="button"
                          className="link-btn small"
                          onClick={() => {
                            setCatId(c.id);
                            setTab('items');
                          }}
                          title={t('ဒီအမျိုးအစားထဲရှိ ဟင်းပွဲများကို ကြည့်ရှုမည်')}
                        >
                          <Icon name="search" size={13} /> {t('ဟင်းများ ကြည့်ရန်')}
                        </button>
                        <div className="row gap" style={{ marginLeft: 'auto' }}>
                          <button
                            type="button"
                            className="btn ghost sm icon-text"
                            onClick={() => {
                              setCatEdit(c);
                              setCatForm({ name: c.name, sort: c.sort || 0 });
                              setCatModal(true);
                            }}
                          >
                            <Icon name="edit" size={13} />
                            <span>{t('ပြင်')}</span>
                          </button>
                          <button
                            type="button"
                            className="icon-btn small danger"
                            onClick={() => delCat(c)}
                            title={dishes.length > 0 ? t('ဒီအမျိုးအစားတွင် ဟင်းများ ရှိနေပါသည်') : t('ဖျက်')}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Promotions Tab */}
      {tab === 'promotions' && (
        <>
          <div className="toolbar">
            <div>
              <h3>{t('ပရိုမိုးရှင်း')}</h3>
              <p className="muted small" style={{ margin: '3px 0 0' }}>
                {t('ငွေရှင်းချိန် အလိုအလျောက် ရွေးချယ်နိုင်မည့် အထူးဈေးများ')}
              </p>
            </div>
            <button
              type="button"
              className="btn amber"
              onClick={() => setPromoEdit({ ...emptyPromo })}
            >
              <Icon name="plus" size={16} /> {t('ပရိုမိုးရှင်း အသစ်')}
            </button>
          </div>
          {promotions.length === 0 ? (
            <Empty text={t('ပရိုမိုးရှင်း မရှိသေးပါ')} />
          ) : (
            <div className="promo-grid">
              {promotions.map((p) => (
                <div className={`promo-card ${p.active ? '' : 'off'}`} key={p.id}>
                  <div className="row between">
                    <span className={`badge ${p.active ? 'ok' : 'bad'}`}>
                      {p.active ? t('အသက်ဝင်နေသည်') : t('ပိတ်ထားသည်')}
                    </span>
                    <Switch on={!!p.active} onClick={() => togglePromo(p)} label={p.name} />
                  </div>
                  <div className="promo-value">
                    {p.type === 'percent' ? `${p.value}%` : money(p.value)}
                    <small>{p.type === 'percent' ? t('လျော့') : t('လျှော့ငွေ')}</small>
                  </div>
                  <div className="promo-name">{p.name}</div>
                  <div className="promo-meta">
                    {p.min_subtotal > 0
                      ? `${t('အနည်းဆုံး ဝယ်ယူငွေ')} ${money(p.min_subtotal)}`
                      : t('ကန့်သတ်ချက် မရှိ')}
                  </div>
                  <div className="promo-meta">
                    <Icon name="clock" size={12} /> {p.start_time || '00:00'} – {p.end_time || '23:59'}
                  </div>
                  <div className="row gap" style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => setPromoEdit({ ...p })}
                    >
                      {t('ပြင်')}
                    </button>
                    <button
                      type="button"
                      className="btn danger sm"
                      onClick={() => removePromo(p)}
                    >
                      {t('ဖျက်')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Edit / Add Dish Modal with Image Picker */}
      {edit && (
        <Modal
          wide
          title={edit.id ? t('ဟင်း ပြင်ဆင်') : t('ဟင်း အသစ်')}
          onClose={() => setEdit(null)}
          footer={<>
            <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
              {t('မလုပ်တော့')}
            </button>
            <button type="button" className="btn" onClick={saveItem}>
              {t('သိမ်းမည်')}
            </button>
          </>}
        >
          {/* Dish Image Section */}
          <div className="dish-image-uploader-card">
            <div className="dish-image-preview-box">
              <img
                src={
                  edit.image ||
                  getFoodImage(
                    edit,
                    data.categories.find((c) => c.id === (edit.categoryId || edit.category_id))?.name
                  )
                }
                alt=""
                className="dish-modal-img"
              />
            </div>
            <div className="dish-image-info">
              <strong>{t('ဟင်းပွဲ ဓာတ်ပုံ')}</strong>
              <p className="muted small">
                {edit.image
                  ? t('စိတ်ကြိုက်ဓာတ်ပုံ ရွေးချယ်ထားပါသည်')
                  : t('နမူနာ အစားအသောက်ပုံ အသုံးပြုနေပါသည်')}
              </p>
              <div className="row gap wrap">
                <button
                  type="button"
                  className="btn ghost sm icon-text"
                  onClick={() => setImagePickerOpen(true)}
                >
                  <Icon name="camera" size={14} /> {t('ဓာတ်ပုံ ရွေးချယ်မည်')}
                </button>
                {edit.image && (
                  <button
                    type="button"
                    className="btn ghost sm danger"
                    onClick={() => setEdit({ ...edit, image: '' })}
                  >
                    <Icon name="trash" size={14} /> {t('ပုံဖျက်')}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="form-grid" style={{ marginTop: 14 }}>
            <Field label={t('အမည်')}>
              <input
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                placeholder={t('ဥပမာ — ကြက်သားထမင်းကြော်')}
              />
            </Field>

            <Field label={t('ကုဒ် / SKU')}>
              <input
                value={edit.code || ''}
                onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                placeholder="M-01"
              />
            </Field>

            <Field label={t('အမျိုးအစား')}>
              <select
                value={edit.categoryId || edit.category_id}
                onChange={(e) => setEdit({ ...edit, categoryId: Number(e.target.value) })}
              >
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={t('ရောင်းစျေး (ကျပ်)')}>
              <input
                type="number"
                value={edit.price}
                onChange={(e) => setEdit({ ...edit, price: e.target.value })}
                placeholder="3500"
              />
            </Field>

            <Field label={t('ကုန်ကျစရိတ် (ကျပ်)')}>
              <input
                type="number"
                value={edit.cost}
                onChange={(e) => setEdit({ ...edit, cost: e.target.value })}
                placeholder="1800"
              />
            </Field>

            <Field label={t('ယူနစ်')}>
              <input
                value={edit.unit}
                onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
                placeholder="ပွဲ"
              />
            </Field>

            <Field label={t('ဌာန')} hint={t('ဘား ပစ္စည်းများ မီးဖိုချောင် KDS တွင် မပြပါ')}>
              <select
                value={edit.station || 'kitchen'}
                onChange={(e) => setEdit({ ...edit, station: e.target.value })}
              >
                <option value="kitchen">{t('မီးဖိုချောင်')}</option>
                <option value="bar">{t('ဘား')}</option>
              </select>
            </Field>

            <Field label={t('အရက် (18+)')}>
              <select
                value={edit.is_alcohol ? 1 : 0}
                onChange={(e) => setEdit({ ...edit, is_alcohol: Number(e.target.value) })}
              >
                <option value={0}>{t('ပုံမှန်')}</option>
                <option value={1}>18+</option>
              </select>
            </Field>

            <Field label={t('အခြေအနေ')}>
              <select
                value={edit.available ? 1 : 0}
                onChange={(e) => setEdit({ ...edit, available: Number(e.target.value) })}
              >
                <option value={1}>{t('ရောင်းချနေသည်')}</option>
                <option value={0}>{t('ပိတ်ထားသည်')}</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {/* Image Picker Sub-Modal */}
      {imagePickerOpen && (
        <ImagePickerModal
          currentImage={edit?.image}
          onSelect={(img) => setEdit((prev) => ({ ...prev, image: img }))}
          onClose={() => setImagePickerOpen(false)}
          showToast={showToast}
        />
      )}

      {/* Add / Edit Category Modal */}
      {catModal && (
        <Modal
          title={catEdit ? t('အမျိုးအစား ပြင်ဆင်') : t('အမျိုးအစား အသစ်')}
          onClose={() => {
            setCatModal(false);
            setCatEdit(null);
          }}
          footer={<>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setCatModal(false);
                setCatEdit(null);
              }}
            >
              {t('မလုပ်တော့')}
            </button>
            <button type="button" className="btn" onClick={saveCat}>
              {t('သိမ်းမည်')}
            </button>
          </>}
        >
          <Field label={t('အမည်')}>
            <input
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              placeholder={t('ဥပမာ — ကြော်ချက်၊ အကင်၊ အအေး')}
            />
          </Field>
          <Field
            label={t('ပြသမည့် အစီအစဉ် (Sort Priority)')}
            hint={t('ဂဏန်းငယ်ပါက ရှေ့ဆုံးတွင် ဦးစားပေး ပြသမည် (ဥပမာ- 1, 2, 3)')}
          >
            <input
              type="number"
              value={catForm.sort}
              onChange={(e) => setCatForm({ ...catForm, sort: e.target.value })}
              placeholder="10"
            />
          </Field>
        </Modal>
      )}

      {/* Bulk Change Category Modal */}
      {bulkCatModal && (
        <Modal
          title={t('အမျိုးအစား ပြောင်းလဲမည်')}
          onClose={() => setBulkCatModal(false)}
          footer={<>
            <button type="button" className="btn ghost" onClick={() => setBulkCatModal(false)}>
              {t('မလုပ်တော့')}
            </button>
            <button type="button" className="btn" onClick={handleBulkCategorySave}>
              {t('ပြောင်းလဲမည်')}
            </button>
          </>}
        >
          <p className="muted small">
            {selectedIds.length} {t('ခုအား အောက်ပါ အမျိုးအစားသို့ ပြောင်းရွှေ့မည်-')}
          </p>
          <Field label={t('အမျိုးအစား')}>
            <select
              value={targetCatId}
              onChange={(e) => setTargetCatId(e.target.value)}
            >
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </Modal>
      )}

      {/* Promotion Edit Modal */}
      {promoEdit && (
        <Modal
          title={promoEdit.id ? t('ပရိုမိုးရှင်း ပြင်') : t('ပရိုမိုးရှင်း အသစ်')}
          onClose={() => setPromoEdit(null)}
          footer={<>
            <button type="button" className="btn ghost" onClick={() => setPromoEdit(null)}>
              {t('မလုပ်တော့')}
            </button>
            <button type="button" className="btn" onClick={savePromo}>
              {t('သိမ်းမည်')}
            </button>
          </>}
        >
          <Field label={t('အမည်')}>
            <input
              value={promoEdit.name}
              onChange={(e) => setPromoEdit({ ...promoEdit, name: e.target.value })}
              placeholder={t('ဥပမာ — ညနေ ၅% လျှော့')}
            />
          </Field>
          <div className="form-grid">
            <Field label={t('အမျိုးအစား')}>
              <select
                value={promoEdit.type}
                onChange={(e) => setPromoEdit({ ...promoEdit, type: e.target.value })}
              >
                <option value="percent">{t('ရာခိုင်နှုန်း')} (%)</option>
                <option value="amount">{t('ငွေပမာဏ')} (Ks)</option>
              </select>
            </Field>
            <Field label={promoEdit.type === 'percent' ? t('လျော့ %') : t('လျှော့ငွေ')}>
              <input
                type="number"
                value={promoEdit.value}
                onChange={(e) => setPromoEdit({ ...promoEdit, value: e.target.value })}
              />
            </Field>
            <Field label={t('အနည်းဆုံး ဝယ်ယူငွေ')}>
              <input
                type="number"
                value={promoEdit.min_subtotal}
                onChange={(e) => setPromoEdit({ ...promoEdit, min_subtotal: e.target.value })}
              />
            </Field>
            <Field label={t('အခြေအနေ')}>
              <select
                value={promoEdit.active ? 1 : 0}
                onChange={(e) => setPromoEdit({ ...promoEdit, active: Number(e.target.value) })}
              >
                <option value={1}>{t('အသက်ဝင်နေသည်')}</option>
                <option value={0}>{t('ပိတ်ထားသည်')}</option>
              </select>
            </Field>
            <Field label={t('စတင်ချိန်')}>
              <input
                type="time"
                value={promoEdit.start_time}
                onChange={(e) => setPromoEdit({ ...promoEdit, start_time: e.target.value })}
              />
            </Field>
            <Field label={t('ပြီးဆုံးချိန်')}>
              <input
                type="time"
                value={promoEdit.end_time}
                onChange={(e) => setPromoEdit({ ...promoEdit, end_time: e.target.value })}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Recipe Modal */}
      {recipeFor && (
        <Modal
          wide
          title={`${recipeFor.name} — ${t('ပါဝင်ပစ္စည်း')}`}
          onClose={() => setRecipeFor(null)}
          footer={<>
            <button type="button" className="btn ghost" onClick={() => setRecipeFor(null)}>
              {t('မလုပ်တော့')}
            </button>
            <button type="button" className="btn" disabled={recipeBusy} onClick={saveRecipe}>
              {t('သိမ်းမည်')}
            </button>
          </>}
        >
          <p className="hint" style={{ marginTop: 0 }}>
            {t('ဒီဟင်း ရောင်းပြီးတိုင်း ပါဝင်ပစ္စည်းများ လက်ကျန်မှ အလိုအလျောက် နုတ်သွားမည်။')}
          </p>
          <div className="recipe-lines">
            {recipeLines.length === 0 && (
              <div className="empty">{t('ပါဝင်ပစ္စည်း မသတ်မှတ်ရသေးပါ')}</div>
            )}
            {recipeLines.map((line, i) => {
              const inv = inventory.find((x) => x.id === Number(line.inventory_item_id));
              return (
                <div className="recipe-line" key={i}>
                  <select
                    value={line.inventory_item_id}
                    onChange={(e) => setLine(i, { inventory_item_id: e.target.value })}
                  >
                    <option value="">{t('ပစ္စည်း ရွေးပါ')}</option>
                    {inventory.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.qty} {x.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={line.qty}
                    onChange={(e) => setLine(i, { qty: e.target.value })}
                    placeholder={t('ပမာဏ')}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => removeLine(i)}
                    aria-label={t('ဖျက်')}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                  {inv && (
                    <div className="hint" style={{ gridColumn: '1 / -1', marginTop: -3 }}>
                      {t('လက်ကျန်')} {inv.qty} {inv.unit}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" className="btn ghost sm" onClick={addRecipeLine}>
            <Icon name="plus" size={15} /> {t('ပစ္စည်း ထည့်')}
          </button>
        </Modal>
      )}
    </div>
  );
}
