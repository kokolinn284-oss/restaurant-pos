import React, { useState, useRef } from 'react';
import { useI18n } from '../i18n.jsx';
import { Icon, Modal } from './ui.jsx';
import { downloadCsv, parseCsv } from '../csv.js';

export function DataTableToolbar({
  search,
  setSearch,
  categoryFilter,
  advancedFilters,
  setAdvancedFilters,
  filterOptions = {},
  sortField,
  setSortField,
  sortOrder,
  setSortOrder,
  sortOptions = [],
  viewMode,
  setViewMode,
  selectedCount = 0,
  totalCount = 0,
  filteredCount = 0,
  onSelectAll,
  onDeselectAll,
  allSelected = false,
  bulkActions = [],
  onExportExcel,
  onImportExcel,
  sampleTemplate,
  primaryAction,
  activeFilterCount = 0,
}) {
  const { t } = useI18n();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importModal, setImportModal] = useState(false);

  return (
    <div className="data-toolbar-wrapper">
      {/* Main Top Toolbar */}
      <div className="data-toolbar">
        {/* Search & Advanced Search Toggle */}
        <div className="toolbar-search-group">
          <div className="search-box">
            <Icon name="search" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('အမြန် ရှာဖွေပါ...')}
              aria-label={t('အမြန် ရှာဖွေပါ')}
            />
            {search && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setSearch('')}
                aria-label={t('ရှင်းလင်း')}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`btn ghost icon-text ${showAdvanced || activeFilterCount > 0 ? 'active-filter' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
            title={t('အသေးစိတ်ရှာဖွေမှု')}
          >
            <Icon name="filter" size={15} />
            <span className="hide-mobile">{t('အသေးစိတ်')}</span>
            {activeFilterCount > 0 && <span className="filter-badge">{activeFilterCount}</span>}
          </button>
        </div>

        {/* Category Dropdown Filter */}
        {categoryFilter && (
          <div className="toolbar-category-group">
            <div className="category-select-wrapper">
              <Icon name="tag" size={15} />
              <select
                value={categoryFilter.value}
                onChange={(e) =>
                  categoryFilter.onChange(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                aria-label={t('အမျိုးအစား ရွေးချယ်ရန်')}
              >
                <option value="all">
                  {t('အမျိုးအစား အားလုံး')} ({categoryFilter.counts ? categoryFilter.counts('all') : totalCount})
                </option>
                {categoryFilter.options?.map((c) => {
                  const count = categoryFilter.counts ? categoryFilter.counts(c.id) : null;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} {count !== null ? `(${count})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        )}

        {/* Sorting Dropdown & Order Toggle */}
        {sortOptions.length > 0 && (
          <div className="toolbar-sort-group">
            <div className="sort-select-wrapper">
              <Icon name="sort" size={15} />
              <select
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                aria-label={t('စီစဉ်ရန်')}
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="icon-btn sort-dir-btn"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? t('အငယ်မှ အကြီး') : t('အကြီးမှ အငယ်')}
              aria-label={t('အစီအစဉ် ပြောင်းလဲရန်')}
            >
              <Icon name={sortOrder === 'asc' ? 'sortAsc' : 'sortDesc'} size={16} />
            </button>
          </div>
        )}

        {/* Multi-View Mode Segment (Grid / Table) */}
        {viewMode && setViewMode && (
          <div className="view-mode-seg" role="group" aria-label={t('မြင်ကွင်း ပုံစံ')}>
            <button
              type="button"
              className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title={t('ကတ်ကွက် မြင်ကွင်း')}
              aria-label={t('ကတ်ကွက် မြင်ကွင်း')}
            >
              <Icon name="grid" size={16} />
              <span className="view-btn-label hide-mobile">{t('ကတ်ကွက်')}</span>
            </button>
            <button
              type="button"
              className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title={t('ဇယားကွက် မြင်ကွင်း')}
              aria-label={t('ဇယားကွက် မြင်ကွင်း')}
            >
              <Icon name="list" size={16} />
              <span className="view-btn-label hide-mobile">{t('ဇယား')}</span>
            </button>
          </div>
        )}

        {/* Excel Import / Export & Actions */}
        <div className="toolbar-actions-group">
          {onExportExcel && (
            <button
              type="button"
              className="btn ghost icon-text"
              onClick={onExportExcel}
              title={t('Excel သို့ ထုတ်ယူမည်')}
            >
              <Icon name="download" size={15} />
              <span className="hide-mobile">Excel</span>
            </button>
          )}

          {onImportExcel && (
            <button
              type="button"
              className="btn ghost icon-text"
              onClick={() => setImportModal(true)}
              title={t('Excel မှ တင်သွင်းမည်')}
            >
              <Icon name="upload" size={15} />
              <span className="hide-mobile">{t('တင်သွင်း')}</span>
            </button>
          )}

          {primaryAction}
        </div>
      </div>

      {/* Advanced Search & Filtering Panel */}
      {showAdvanced && advancedFilters && (
        <div className="advanced-filter-panel">
          <div className="panel-title-row">
            <strong><Icon name="filter" size={15} /> {t('အသေးစိတ် ရှာဖွေ/စစ်ထုတ်ခြင်း')}</strong>
            <button
              type="button"
              className="link-btn small"
              onClick={() => {
                setSearch('');
                setAdvancedFilters({});
              }}
            >
              {t('ရှာဖွေမှု အားလုံး ရှင်းလင်းမည်')}
            </button>
          </div>

          <div className="filter-grid">
            {filterOptions.status && (
              <label className="filter-field">
                <span>{t('အခြေအနေ')}</span>
                <select
                  value={advancedFilters.status ?? 'all'}
                  onChange={(e) =>
                    setAdvancedFilters({ ...advancedFilters, status: e.target.value })
                  }
                >
                  <option value="all">{t('အားလုံး')}</option>
                  {filterOptions.status.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {filterOptions.station && (
              <label className="filter-field">
                <span>{t('ဌာန')}</span>
                <select
                  value={advancedFilters.station ?? 'all'}
                  onChange={(e) =>
                    setAdvancedFilters({ ...advancedFilters, station: e.target.value })
                  }
                >
                  <option value="all">{t('အားလုံး')}</option>
                  <option value="kitchen">{t('မီးဖိုချောင်')}</option>
                  <option value="bar">{t('ဘား')}</option>
                </select>
              </label>
            )}

            <label className="filter-field">
              <span>{t('အနည်းဆုံး စျေးနှုန်း/တန်ဖိုး')}</span>
              <input
                type="number"
                value={advancedFilters.minPrice ?? ''}
                onChange={(e) =>
                  setAdvancedFilters({ ...advancedFilters, minPrice: e.target.value })
                }
                placeholder="0"
              />
            </label>

            <label className="filter-field">
              <span>{t('အများဆုံး စျေးနှုန်း/တန်ဖိုး')}</span>
              <input
                type="number"
                value={advancedFilters.maxPrice ?? ''}
                onChange={(e) =>
                  setAdvancedFilters({ ...advancedFilters, maxPrice: e.target.value })
                }
                placeholder="100,000"
              />
            </label>

            {filterOptions.hasImage !== undefined && (
              <label className="filter-field">
                <span>{t('ဓာတ်ပုံ ပါ/မပါ')}</span>
                <select
                  value={advancedFilters.hasImage ?? 'all'}
                  onChange={(e) =>
                    setAdvancedFilters({ ...advancedFilters, hasImage: e.target.value })
                  }
                >
                  <option value="all">{t('အားလုံး')}</option>
                  <option value="yes">{t('ဓာတ်ပုံ ပါရှိသည်')}</option>
                  <option value="no">{t('ဓာတ်ပုံ မပါရှိပါ')}</option>
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Bulk Actions Floating / Sticky Bar */}
      {selectedCount > 0 && (
        <div className="bulk-actions-bar">
          <div className="bulk-selection-info">
            <span className="bulk-badge">{selectedCount}</span>
            <strong>{t('ခု ရွေးချယ်ထားသည်')}</strong>
            <button
              type="button"
              className="link-btn small"
              onClick={allSelected ? onDeselectAll : onSelectAll}
            >
              {allSelected ? t('ရွေးချယ်မှု ပယ်ဖျက်') : t('အားလုံး ရွေးမည်')} ({filteredCount})
            </button>
          </div>

          <div className="bulk-action-buttons">
            {bulkActions.map((action, idx) => (
              <button
                key={idx}
                type="button"
                className={`btn sm ${action.variant || 'ghost'}`}
                onClick={action.onClick}
              >
                {action.icon && <Icon name={action.icon} size={14} />}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      {importModal && onImportExcel && (
        <ExcelImportModal
          onClose={() => setImportModal(false)}
          onImport={async (items) => {
            await onImportExcel(items);
            setImportModal(false);
          }}
          sampleTemplate={sampleTemplate}
        />
      )}
    </div>
  );
}

// Reusable Pagination Component
export function Pagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
}) {
  const { t } = useI18n();
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalItems / pageSize) || 1;
  const startItem = totalItems === 0 ? 0 : pageSize === 'all' ? 1 : (currentPage - 1) * pageSize + 1;
  const endItem = pageSize === 'all' ? totalItems : Math.min(currentPage * pageSize, totalItems);

  if (totalItems === 0) return null;

  return (
    <div className="pagination-bar">
      <div className="pagination-info">
        <span>
          {t('ပစ္စည်း')} <strong>{startItem}–{endItem}</strong> ({t('စုစုပေါင်း')} <strong>{totalItems}</strong> {t('ခု')})
        </span>

        {onPageSizeChange && (
          <div className="page-size-selector">
            <span>{t('တစ်မျက်နှာလျှင်')}</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              aria-label={t('တစ်မျက်နှာလျှင် ပြသမည့် အရေအတွက်')}
            >
              {pageSizeOptions.map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
              <option value="all">{t('အားလုံး')}</option>
            </select>
          </div>
        )}
      </div>

      {pageSize !== 'all' && totalPages > 1 && (
        <div className="pagination-controls">
          <button
            type="button"
            className="icon-btn"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(1)}
            title={t('ပထမဆုံး စာမျက်နှာ')}
            aria-label={t('ပထမဆုံး စာမျက်နှာ')}
          >
            <Icon name="chevronsLeft" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            title={t('ရှေ့ စာမျက်နှာ')}
            aria-label={t('ရှေ့ စာမျက်နှာ')}
          >
            <Icon name="chevronLeft" size={16} />
          </button>

          <span className="page-indicator">
            {currentPage} / {totalPages}
          </span>

          <button
            type="button"
            className="icon-btn"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            title={t('နောက် စာမျက်နှာ')}
            aria-label={t('နောက် စာမျက်နှာ')}
          >
            <Icon name="chevronRight" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(totalPages)}
            title={t('နောက်ဆုံး စာမျက်နှာ')}
            aria-label={t('နောက်ဆုံး စာမျက်နှာ')}
          >
            <Icon name="chevronsRight" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

// Excel / CSV Import Modal Dialog
function ExcelImportModal({ onClose, onImport, sampleTemplate }) {
  const { t } = useI18n();
  const [parsedRows, setParsedRows] = useState([]);
  const [headerMap, setHeaderMap] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        const rows = parseCsv(text);
        if (!rows || rows.length < 2) {
          setError(t('ဖိုင်တွင် အချက်အလက်များ မတွေ့ပါ သို့မဟုတ် ခေါင်းစဉ်သာ ပါရှိပါသည်'));
          return;
        }

        const headers = rows[0].map((h) => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        // Map column indexes
        const map = {
          name: headers.findIndex((h) => h.includes('အမည်') || h.includes('name') || h.includes('item')),
          category: headers.findIndex((h) => h.includes('အမျိုးအစား') || h.includes('cat')),
          price: headers.findIndex((h) => h.includes('ဈေး') || h.includes('စျေး') || h.includes('price')),
          cost: headers.findIndex((h) => h.includes('ကုန်ကျ') || h.includes('cost')),
          unit: headers.findIndex((h) => h.includes('ယူနစ်') || h.includes('unit')),
          code: headers.findIndex((h) => h.includes('ကုဒ်') || h.includes('code') || h.includes('sku')),
          station: headers.findIndex((h) => h.includes('ဌာန') || h.includes('station')),
          qty: headers.findIndex((h) => h.includes('လက်ကျန်') || h.includes('အရေအတွက်') || h.includes('qty')),
          reorder: headers.findIndex((h) => h.includes('သတိပေး') || h.includes('reorder')),
        };

        if (map.name === -1) {
          setError(t('ဖိုင်တွင် "အမည်" (Name) ကော်လံ မပါရှိပါ'));
          return;
        }

        setHeaderMap(map);
        const mapped = dataRows
          .map((r) => ({
            name: r[map.name] || '',
            category_name: map.category !== -1 ? r[map.category] : '',
            price: map.price !== -1 ? Number(r[map.price]) || 0 : 0,
            cost: map.cost !== -1 ? Number(r[map.cost]) || 0 : 0,
            unit: map.unit !== -1 ? r[map.unit] : '',
            code: map.code !== -1 ? r[map.code] : '',
            station: map.station !== -1 ? r[map.station] : 'kitchen',
            qty: map.qty !== -1 ? Number(r[map.qty]) || 0 : 0,
            reorder_level: map.reorder !== -1 ? Number(r[map.reorder]) || 0 : 0,
          }))
          .filter((it) => it.name.trim() !== '');

        setParsedRows(mapped);
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleDownloadSample = () => {
    if (sampleTemplate) {
      downloadCsv(sampleTemplate.filename, sampleTemplate.headers, sampleTemplate.sampleRows);
    }
  };

  const handleConfirm = async () => {
    if (!parsedRows.length) return;
    setBusy(true);
    try {
      await onImport(parsedRows);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={t('Excel / CSV မှ အချက်အလက် တင်သွင်းမည်')}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('မလုပ်တော့')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || parsedRows.length === 0}
          onClick={handleConfirm}
        >
          {busy ? t('တင်သွင်းနေပါသည်...') : `${t('အတည်ပြု တင်သွင်းမည်')} (${parsedRows.length} ${t('ခု')})`}
        </button>
      </>}
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="row between wrap gap">
          <p className="muted small" style={{ margin: 0 }}>
            {t('CSV ဖိုင် (Excel မှ သိမ်းဆည်းထားသော CSV UTF-8) ကို ရွေးချယ်ပါ')}
          </p>
          {sampleTemplate && (
            <button type="button" className="link-btn small" onClick={handleDownloadSample}>
              <Icon name="download" size={14} /> {t('နမူနာ Excel Template ဒေါင်းလုဒ်')}
            </button>
          )}
        </div>

        <div className="upload-dropzone" onClick={() => fileRef.current?.click()}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFile}
          />
          <div className="upload-icon"><Icon name="file" size={32} /></div>
          <h4>{t('CSV ဖိုင် ရွေးချယ်ရန် နှိပ်ပါ')}</h4>
          <p className="muted small">{t('သို့မဟုတ် ဤနေရာသို့ ဖိုင်ဆွဲထည့်ပါ')}</p>
        </div>

        {error && <div className="alert-box error">{error}</div>}

        {parsedRows.length > 0 && (
          <div className="import-preview-section">
            <div className="row between" style={{ marginBottom: 8 }}>
              <strong>{t('တင်သွင်းမည့် အချက်အလက်များ')} ({parsedRows.length} {t('ခု')})</strong>
            </div>
            <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto' }}>
              <table className="table compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('အမည်')}</th>
                    <th>{t('အမျိုးအစား')}</th>
                    <th>{t('ဈေးနှုန်း')}</th>
                    <th>{t('ကုန်ကျစရိတ်')}</th>
                    <th>{t('ယူနစ်')}</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 15).map((row, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><strong>{row.name}</strong></td>
                      <td className="muted">{row.category_name || '—'}</td>
                      <td>{row.price?.toLocaleString()}</td>
                      <td className="muted">{row.cost?.toLocaleString()}</td>
                      <td>{row.unit || '—'}</td>
                    </tr>
                  ))}
                  {parsedRows.length > 15 && (
                    <tr>
                      <td colSpan="6" className="center muted">
                        ... {t('နောက်ထပ်')} {parsedRows.length - 15} {t('ခု ကျန်ရှိပါသည်')} ...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
