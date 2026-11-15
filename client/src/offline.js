const DRAFT_KEY = 'pos_offline_drafts_v1';
const CACHE_KEY = 'pos_bootstrap_cache_v1';
const listeners = new Set();
let syncing = false;

function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch { return fallback; }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function emit() {
  const list = getDrafts();
  for (const fn of listeners) {
    try { fn(list); } catch {}
  }
}

export function subscribeDrafts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === DRAFT_KEY) emit(); });
}

export function uid(prefix = 'id') {
  const raw = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${raw}`;
}

export function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function getDrafts() {
  const list = readJson(DRAFT_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveAll(list) {
  writeJson(DRAFT_KEY, list);
  emit();
}

export function getDraft(key) {
  return getDrafts().find(d => d.key === key) || null;
}

export function updateDraft(key, updater) {
  let next = null;
  saveAll(getDrafts().map(d => {
    if (d.key !== key) return d;
    next = updater({ ...d });
    return next;
  }));
  return next;
}

export function removeDraft(key) {
  saveAll(getDrafts().filter(d => d.key !== key));
}

function taxRates(settings = {}) {
  return {
    tax_rate: Number(settings.tax_rate || 0),
    service_rate: Number(settings.service_rate || 0),
    points_per_1000: Number(settings.points_per_1000 || 0)
  };
}

export function itemTotal(item) {
  const mods = (item.modifiers || []).reduce((s, m) => s + (Number(m.price) || 0), 0);
  return Math.round(((Number(item.price) || 0) + mods) * (Number(item.qty) || 0));
}

export function computeTotals(draft, discount = draft?.discount || 0) {
  const items = (draft?.items || []).filter(i => i.status !== 'cancelled');
  const subtotal = items.reduce((s, it) => s + itemTotal(it), 0);
  const disc = Math.min(Math.max(0, Math.round(Number(discount) || 0)), subtotal);
  const rates = draft?.settings || {};
  const tax = Math.round((subtotal - disc) * Number(rates.tax_rate || 0) / 100);
  const service = Math.round((subtotal - disc) * Number(rates.service_rate || 0) / 100);
  return { subtotal, discount: disc, tax, service, total: subtotal - disc + tax + service };
}

function withTotals(draft) {
  return { ...draft, ...computeTotals(draft), updated_at: nowLocal() };
}

export function createDraft({ type = 'takeaway', tableId = null, guests = 1, staff = null, data = {} }) {
  const key = uid('offline');
  const draft = withTotals({
    key,
    client_ref: uid('ref'),
    version: 1,
    order_no: `OFF-${key.slice(-4).toUpperCase()}`,
    type,
    table_id: tableId ? Number(tableId) : null,
    guests: Number(guests) || 1,
    note: '',
    customer_id: null,
    staff_id: staff?.id || null,
    staff_name: staff?.name || '',
    settings: taxRates(data.settings),
    opened_at: nowLocal(),
    created_at: nowLocal(),
    updated_at: nowLocal(),
    status: 'open',
    sync: 'pending',
    error: '',
    paid_at: null,
    discount: 0,
    items: [],
    payments: []
  });
  saveAll([...getDrafts(), draft]);
  return draft;
}

export function tableDrafts(tableId) {
  return getDrafts().filter(d => d.table_id === Number(tableId) && d.status !== 'void');
}

export function openDraftForTable(tableId) {
  return tableDrafts(tableId).filter(d => d.status === 'open').slice(-1)[0] || null;
}

export function addDraftItem(key, menuItem) {
  return updateDraft(key, d => {
    if (d.status !== 'open') return d;
    const same = d.items.find(i => i.item_id === menuItem.id && i.status === 'new'
      && !i.note && !(i.modifiers || []).length);
    const items = same
      ? d.items.map(i => i === same ? { ...i, qty: i.qty + 1 } : i)
      : [...d.items, {
        id: uid('oi'),
        item_id: menuItem.id,
        name: menuItem.name,
        price: Math.round(Number(menuItem.price) || 0),
        qty: 1,
        note: '',
        status: 'new',
        sent_at: null,
        stock_deducted: 0,
        modifiers: [],
        is_alcohol: menuItem.is_alcohol ? 1 : 0,
        station: menuItem.station || 'kitchen',
        created_at: nowLocal()
      }];
    return withTotals({ ...d, items });
  });
}

export function changeDraftQty(key, itemId, qty) {
  return updateDraft(key, d => {
    if (d.status !== 'open') return d;
    const items = d.items
      .map(i => i.id === itemId ? { ...i, qty: Number(qty) } : i)
      .filter(i => i.qty > 0);
    return withTotals({ ...d, items });
  });
}

export function saveDraftItem(key, itemId, { qty, note }) {
  return updateDraft(key, d => {
    if (d.status !== 'open') return d;
    const items = d.items
      .map(i => i.id === itemId ? { ...i, qty: Number(qty) || 1, note: note || '' } : i);
    return withTotals({ ...d, items });
  });
}

export function removeDraftItem(key, itemId) {
  return updateDraft(key, d => withTotals({ ...d, items: d.items.filter(i => i.id !== itemId) }));
}

export function sendDraftKitchen(key) {
  let sent = 0;
  updateDraft(key, d => {
    if (d.status !== 'open') return d;
    const stamp = nowLocal();
    const items = d.items.map(i => {
      if (i.status !== 'new') return i;
      sent++;
      return { ...i, status: 'cooking', sent_at: stamp, stock_deducted: 1 };
    });
    return { ...d, items, updated_at: stamp };
  });
  return sent;
}

export function payDraft(key, { discount = 0, promotionId = null, customerId = null, payments = [] }) {
  return updateDraft(key, d => {
    if (d.status !== 'open') return d;
    const totals = computeTotals(d, discount);
    const stamp = nowLocal();
    return {
      ...d,
      ...totals,
      status: 'paid',
      paid_at: stamp,
      updated_at: stamp,
      promotion_id: promotionId || null,
      customer_id: customerId ? Number(customerId) : null,
      payments: payments.map(p => ({ ...p, id: uid('pay'), paid_at: stamp })),
      receipt_no: d.order_no
    };
  });
}

export function markDraftError(key, message) {
  return updateDraft(key, d => ({ ...d, sync: 'failed', error: String(message || 'Sync failed'), updated_at: nowLocal() }));
}

export function draftToOrder(draft) {
  if (!draft) return null;
  const totals = computeTotals(draft);
  return {
    ...draft,
    id: draft.key,
    subtotal: draft.subtotal ?? totals.subtotal,
    discount: draft.discount ?? totals.discount,
    tax: draft.tax ?? totals.tax,
    service: draft.service ?? totals.service,
    total: draft.total ?? totals.total,
    items: draft.items || [],
    payments: draft.payments || [],
    closed_at: draft.paid_at || draft.closed_at || null,
    offline: true
  };
}

export function cacheBootstrap(data) {
  if (!data) return;
  try { writeJson(CACHE_KEY, { at: Date.now(), data }); } catch {}
}

export function getCachedBootstrap() {
  const cached = readJson(CACHE_KEY, null);
  return cached?.data || null;
}

export function pendingCount(list = getDrafts()) {
  return list.filter(d => d.status === 'paid').length;
}

export async function syncDrafts(apiFn) {
  if (syncing) return { busy: true, synced: 0, failed: 0 };
  syncing = true;
  let synced = 0;
  let failed = 0;
  let fatal = null;
  try {
    const drafts = getDrafts().filter(d => d.status === 'paid' && d.items.length > 0);
    for (const d of drafts) {
      try {
        await apiFn('/sync/order', {
          method: 'POST',
          body: JSON.stringify({
            clientRef: d.client_ref,
            type: d.type,
            tableId: d.table_id,
            guests: d.guests,
            note: d.note,
            openedAt: d.opened_at,
            staffId: d.staff_id,
            customerId: d.customer_id,
            items: d.items.map(i => ({
              itemId: i.item_id,
              name: i.name,
              price: i.price,
              qty: i.qty,
              note: i.note,
              status: i.status,
              sentAt: i.sent_at,
              createdAt: i.created_at,
              modifiers: i.modifiers || []
            })),
            paid: d.status === 'paid' ? {
              discount: d.discount,
              promotionId: d.promotion_id,
              customerId: d.customer_id,
              payments: d.payments.map(p => ({ method: p.method, amount: p.amount, ref: p.ref || '' })),
              paidAt: d.paid_at
            } : null
          })
        });
        removeDraft(d.key);
        synced++;
      } catch (e) {
        if (e.offline || e.status === 401) { fatal = e; break; }
        markDraftError(d.key, e.message);
        failed++;
      }
    }
  } finally {
    syncing = false;
  }
  return { busy: false, synced, failed, fatal };
}
