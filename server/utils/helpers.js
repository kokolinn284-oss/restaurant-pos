import { getSettings, setSettings, db } from '../db.js';

export const ymdLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function normalizeTs(value) {
  if (!value) return null;
  const m = String(value).trim().replace('T', ' ').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::(\d{2}))?$/);
  return m ? `${m[1]} ${m[2]}:${m[3] || '00'}` : null;
}

export const roundQty = (value) => Math.round((Number(value) || 0) * 1000) / 1000;

export const DEFAULT_STATIONS = [
  { value: 'kitchen', label: 'မီးဖိုချောင်', label_en: 'Kitchen' },
  { value: 'bar', label: 'ဘား', label_en: 'Bar' },
];
export const DEFAULT_UNITS = ['ပွဲ', 'ခွက်', 'ဘူး', 'ပုလင်း', 'ပန်းကန်'];

export function readSettingsList(key) {
  try {
    const v = JSON.parse(getSettings()[key] || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveSettingsList(key, list) {
  setSettings({ [key]: JSON.stringify(list) });
}

export function getStations() {
  const custom = readSettingsList('custom_stations')
    .map(st => (typeof st === 'string' ? { value: st, label: st } : st))
    .filter(st => st && st.value && !DEFAULT_STATIONS.some(d => d.value === st.value));
  return [...DEFAULT_STATIONS, ...custom];
}

export function resolveStation(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return 'kitchen';
  const low = raw.toLowerCase();
  const found = getStations().find(st =>
    String(st.value).toLowerCase() === low ||
    String(st.label || '').toLowerCase() === low ||
    String(st.label_en || '').toLowerCase() === low
  );
  return found ? found.value : null;
}

export function stationTitle(value) {
  const st = getStations().find(s => s.value === value);
  return String(st?.label_en || st?.label || value || 'KITCHEN').toUpperCase();
}

export function getUnits() {
  const seen = new Set();
  const out = [];
  const saved = readSettingsList('custom_units').map(u => (typeof u === 'string' ? u : u?.name));
  const used = db.prepare("SELECT DISTINCT unit FROM menu_items WHERE TRIM(COALESCE(unit, '')) != ''").all().map(r => r.unit);
  for (const u of [...DEFAULT_UNITS, ...saved, ...used]) {
    const name = String(u || '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}


export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
