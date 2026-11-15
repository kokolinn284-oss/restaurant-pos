import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.POS_DATA_DIR
  ? path.resolve(process.env.POS_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
export const DB_PATH = path.join(DATA_DIR, 'pos.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  pin TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cashier',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  cost INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  zone TEXT NOT NULL DEFAULT '',
  seats INTEGER NOT NULL DEFAULT 4
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL,
  table_id INTEGER,
  type TEXT NOT NULL DEFAULT 'dine_in',
  status TEXT NOT NULL DEFAULT 'open',
  guests INTEGER NOT NULL DEFAULT 1,
  staff_id INTEGER,
  customer_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL DEFAULT 0,
  discount INTEGER NOT NULL DEFAULT 0,
  tax INTEGER NOT NULL DEFAULT 0,
  service INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  closed_at TEXT,
  client_ref TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  item_id INTEGER,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_item_modifiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  staff_id INTEGER,
  paid_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'normal',
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  cost INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  qty REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  staff_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL DEFAULT '',
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  staff_id INTEGER
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER,
  opened_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  closed_at TEXT,
  opening_cash INTEGER NOT NULL DEFAULT 0,
  closing_cash INTEGER,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  party_size INTEGER NOT NULL DEFAULT 2,
  table_id INTEGER,
  reserved_at TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'booked',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  order_id INTEGER,
  amount INTEGER NOT NULL,
  paid INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  settled_at TEXT
);

CREATE TABLE IF NOT EXISTS recipe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  inventory_item_id INTEGER NOT NULL,
  qty REAL NOT NULL DEFAULT 0,
  UNIQUE(menu_item_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percent',
  value INTEGER NOT NULL DEFAULT 0,
  min_subtotal INTEGER NOT NULL DEFAULT 0,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_opened ON orders(opened_at);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_reservations_at ON reservations(reserved_at);
CREATE INDEX IF NOT EXISTS idx_credits_customer ON credits(customer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_staff ON sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item ON order_items(item_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_item ON stock_moves(item_id);
`);

const PIN_PREFIX = 'scrypt$';

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${PIN_PREFIX}${salt}$${hash}`;
}

export function verifyPin(pin, stored) {
  if (!stored) return false;
  if (!String(stored).startsWith(PIN_PREFIX)) return String(stored) === String(pin);
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(pin), salt, 32);
  const known = Buffer.from(hash, 'hex');
  return candidate.length === known.length && crypto.timingSafeEqual(candidate, known);
}

function ensureColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
ensureColumn('order_items', 'stock_deducted', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('orders', 'promotion_id', 'INTEGER');
ensureColumn('orders', 'customer_name', "TEXT NOT NULL DEFAULT ''");
ensureColumn('orders', 'customer_phone', "TEXT NOT NULL DEFAULT ''");
ensureColumn('orders', 'source', "TEXT NOT NULL DEFAULT 'pos'");
ensureColumn('orders', 'client_ref', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_ref ON orders(client_ref) WHERE client_ref IS NOT NULL');
ensureColumn('menu_items', 'is_alcohol', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('menu_items', 'station', "TEXT NOT NULL DEFAULT 'kitchen'");
ensureColumn('menu_items', 'image', "TEXT NOT NULL DEFAULT ''");
ensureColumn('menu_items', 'code', "TEXT NOT NULL DEFAULT ''");
ensureColumn('inventory_items', 'sku', "TEXT NOT NULL DEFAULT ''");
ensureColumn('inventory_items', 'category', "TEXT NOT NULL DEFAULT ''");
ensureColumn('expenses', 'spent_on', "TEXT NOT NULL DEFAULT ''");
ensureColumn('expenses', 'method', "TEXT NOT NULL DEFAULT 'cash'");
ensureColumn('expenses', 'vendor', "TEXT NOT NULL DEFAULT ''");
db.exec("UPDATE expenses SET spent_on = date(created_at) WHERE spent_on = ''");

const DEFAULT_EXPENSE_CATEGORIES = [
  'ပစ္စည်းဝယ်ခြင်း', 'လစာ', 'ဆိုင်ငှားခ', 'မီတာ/ရေ', 'ပြင်ဆင်မှု', 'သယ်ယူပို့ဆောင်ခ', 'အခြား'
];
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'expense_categories_seeded'").get()) {
  const insCat = db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)');
  for (const name of DEFAULT_EXPENSE_CATEGORIES) insCat.run(name);
  for (const row of db.prepare("SELECT DISTINCT category FROM expenses WHERE TRIM(category) <> ''").all()) insCat.run(row.category);
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('expense_categories_seeded', '1')").run();
}

const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;

export function seed() {
  const defaults = {
    shop_name: 'စည်တော်ကြီး စားသောက်ဆိုင်',
    shop_name_en: 'Sintawgyi Restaurant',
    address: 'မြို့မဈေး၊ နယ်မြို့',
    phone: '09-000000000',
    currency: 'MMK',
    tax_rate: '0',
    service_rate: '0',
    footer: 'ကျေးဇူးတင်ပါတယ်။ နောက်တစ်ကြိမ် ကြိုဆိုပါတယ်။',
    receipt_printer_width: '80',
    points_per_1000: '1',
    printer_mode: 'browser',
    printer_host: '',
    printer_port: '9100',
    printer_name: '',
    version: '1.0'
  };
  const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) insSetting.run(k, v);
  // migrate old demo shop name
  db.prepare("UPDATE settings SET value = ? WHERE key = 'shop_name' AND value = ?")
    .run('စည်တော်ကြီး စားသောက်ဆိုင်', 'ရွှေမြို့ စားသောက်ဆိုင်');
  db.prepare("UPDATE settings SET value = ? WHERE key = 'shop_name_en' AND value = ?")
    .run('Sintawgyi Restaurant', 'Shwe Myo Restaurant');

  if (count('staff') === 0) {
    const ins = db.prepare('INSERT INTO staff (name, pin, role) VALUES (?, ?, ?)');
    ins.run('ဆိုင်ရှင်', hashPin('1234'), 'owner');
    ins.run('ကောင်တာ', hashPin('1111'), 'cashier');
    ins.run('စားပွဲထိုး', hashPin('2222'), 'waiter');
  }

  if (count('categories') === 0) {
    const ins = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)');
    const cats = ['မြန်မာထမင်း', 'ခေါက်ဆွဲ & မုန့်ဟင်းခါး', 'အသားကင် & ကြော်', 'ဟင်းချို & အခြမ်း', 'အအေးနှင့် သောက်ရေ', 'ကော်ဖီ & လဖက်ရည်'];
    cats.forEach((c, i) => ins.run(c, i));
  }

  if (count('menu_items') === 0) {
    const ins = db.prepare('INSERT INTO menu_items (category_id, name, price, cost, unit, sort) VALUES (?, ?, ?, ?, ?, ?)');
    const items = [
      [1, 'ကြက်သားထမင်းကြော်', 3500, 1800, 'ပွဲ', 1],
      [1, 'ဝက်သားထမင်းကြော်', 3500, 1800, 'ပွဲ', 2],
      [1, 'ငါးကြင်းထမင်းကြော်', 4000, 2000, 'ပွဲ', 3],
      [1, 'ကြက်သားဟင်းထမင်း', 4000, 1900, 'ပွဲ', 4],
      [1, 'ဝက်သားဟင်းထမင်း', 4000, 1900, 'ပွဲ', 5],
      [2, 'မုန့်ဟင်းခါး', 2500, 1200, 'ပွဲ', 1],
      [2, 'ခေါက်ဆွဲကြော်', 3000, 1500, 'ပွဲ', 2],
      [2, 'ရှမ်းခေါက်ဆွဲ', 3000, 1500, 'ပွဲ', 3],
      [2, 'မုန့်တီ', 3000, 1400, 'ပွဲ', 4],
      [3, 'ကြက်သားကင်', 6000, 3200, 'ပွဲ', 1],
      [3, 'ဝက်သားကင်', 5500, 2800, 'ပွဲ', 2],
      [3, 'ငါးကြော်ခြောက်', 5000, 2500, 'ပွဲ', 3],
      [3, 'ကြက်သားကြော်', 4500, 2200, 'ပွဲ', 4],
      [4, 'ပဲပြုတ်', 1500, 600, 'ပန်းကန်', 1],
      [4, 'ချဉ်ပေါင်ရွက်ကြော်', 2000, 900, 'ပန်းကန်', 2],
      [4, 'ကြက်ဥပြုတ်', 1000, 500, 'လုံး', 3],
      [5, 'ရေသန့်ဘူး', 700, 300, 'ဘူး', 1],
      [5, 'ကိုကာကိုလာ', 1200, 700, 'ဘူး', 2],
      [5, 'လိမ္မော်ရည်', 1500, 800, 'ခွက်', 3],
      [5, 'ဖျော်ရည်', 2000, 900, 'ခွက်', 4],
      [6, 'လဖက်ရည်', 1500, 600, 'ခွက်', 1],
      [6, 'ကော်ဖီ', 2000, 800, 'ခွက်', 2],
      [6, 'နို့လဖက်ရည်', 2000, 800, 'ခွက်', 3]
    ];
    for (const it of items) ins.run(...it);
  }

  if (count('tables') === 0) {
    const ins = db.prepare('INSERT INTO tables (name, zone, seats) VALUES (?, ?, ?)');
    for (let i = 1; i <= 8; i++) ins.run(`စားပွဲ ${i}`, 'အပြင်', 4);
    ins.run('အခန်း 1', 'အခန်း', 8);
    ins.run('အခန်း 2', 'အခန်း', 8);
  }

  if (count('inventory_items') === 0) {
    const ins = db.prepare('INSERT INTO inventory_items (name, unit, qty, reorder_level, cost) VALUES (?, ?, ?, ?, ?)');
    const inv = [
      ['ဆန်', 'ကီလို', 50, 10, 2200],
      ['ကြက်သား', 'ကီလို', 15, 5, 9000],
      ['ဝက်သား', 'ကီလို', 12, 5, 11000],
      ['ငါး', 'ကီလို', 8, 3, 8000],
      ['ဆီ', 'လီတာ', 10, 3, 4500],
      ['ကြက်သွန်', 'ကီလို', 6, 2, 3000],
      ['ငရုတ်သီး', 'ကီလို', 2, 1, 5000],
      ['ရေသန့်ဘူး', 'ဘူး', 60, 20, 300]
    ];
    for (const row of inv) ins.run(...row);
  }

  if (count('customers') === 0) {
    const ins = db.prepare('INSERT INTO customers (name, phone, points, tier) VALUES (?, ?, ?, ?)');
    ins.run('ဦးသောင်းလှ', '09-111111111', 12, 'normal');
    ins.run('မခင်မြ', '09-222222222', 35, 'gold');
  }

  if (count('recipe_items') === 0 && count('menu_items') > 0 && count('inventory_items') > 0) {
    const mi = Object.fromEntries(db.prepare('SELECT id, name FROM menu_items').all().map(r => [r.name, r.id]));
    const inv = Object.fromEntries(db.prepare('SELECT id, name FROM inventory_items').all().map(r => [r.name, r.id]));
    const recipes = {
      'ကြက်သားထမင်းကြော်': [['ဆန်', 0.15], ['ကြက်သား', 0.12], ['ဆီ', 0.03], ['ကြက်သွန်', 0.02]],
      'ဝက်သားထမင်းကြော်': [['ဆန်', 0.15], ['ဝက်သား', 0.12], ['ဆီ', 0.03], ['ကြက်သွန်', 0.02]],
      'ကြက်သားကင်': [['ကြက်သား', 0.25], ['ဆီ', 0.02], ['ငရုတ်သီး', 0.01]],
      'ဝက်သားကင်': [['ဝက်သား', 0.25], ['ဆီ', 0.02], ['ငရုတ်သီး', 0.01]],
      'မုန့်ဟင်းခါး': [['ဆန်', 0.1], ['ဆီ', 0.02]],
      'ရေသန့်ဘူး': [['ရေသန့်ဘူး', 1]]
    };
    const ins = db.prepare('INSERT INTO recipe_items (menu_item_id, inventory_item_id, qty) VALUES (?, ?, ?)');
    for (const [name, lines] of Object.entries(recipes)) {
      if (!mi[name]) continue;
      for (const [invName, qty] of lines) {
        if (inv[invName]) ins.run(mi[name], inv[invName], qty);
      }
    }
  }

  if (count('promotions') === 0) {
    const ins = db.prepare('INSERT INTO promotions (name, type, value, min_subtotal, start_time, end_time, active) VALUES (?, ?, ?, ?, ?, ?, ?)');
    ins.run('ညနေ ၅% လျှော့', 'percent', 5, 0, '17:00', '21:00', 1);
    ins.run('၁၀,၀၀၀ အထက် ၁,၀၀၀ လျှော့', 'amount', 1000, 10000, '', '', 1);
  }
}

seed();

/* Alcohol / beer corner — seeded by name so it is safe on existing databases. */
function seedAlcoholMenu() {
  const catName = 'ဘီယာ & အရက်';
  let cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(catName);
  if (!cat) {
    const r = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)').run(catName, 90);
    cat = { id: r.lastInsertRowid };
  }

  const menu = [
    ['မြန်မာဘီယာ (ဘူး)', 2500, 1700, 'ဘူး', 1],
    ['တိုက်ဂါဘီယာ (ဘူး)', 2800, 1900, 'ဘူး', 2],
    ['ဟိုင်းနီကန်ဘီယာ (ဘူး)', 3000, 2100, 'ဘူး', 3],
    ['ဒရပ်ဘီယာ (ခွက်)', 1500, 700, 'ခွက်', 4],
    ['ဒရပ်ဘီယာ (ကရား)', 6000, 2800, 'ကရား', 5],
    ['ဝီစကီ (ဘူး)', 18000, 12000, 'ဘူး', 6],
    ['ဝီစကီ (ခွက်)', 2500, 1200, 'ခွက်', 7],
    ['ရမ် (ဘူး)', 12000, 8000, 'ဘူး', 8],
    ['ရမ် (ခွက်)', 1800, 800, 'ခွက်', 9],
    ['ဂျင်း (ခွက်)', 2000, 900, 'ခွက်', 10]
  ];
  const findItem = db.prepare('SELECT id FROM menu_items WHERE name = ?');
  const insItem = db.prepare(`INSERT INTO menu_items (category_id, name, price, cost, unit, sort, is_alcohol, station)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'bar')`);
  for (const [name, price, cost, unit, sort] of menu) {
    if (!findItem.get(name)) insItem.run(cat.id, name, price, cost, unit, sort);
  }

  const stock = [
    ['ဘီယာဘူး', 'ဘူး', 120, 24, 1700],
    ['ဒရပ်ဘီယာ', 'လီတာ', 40, 10, 4500],
    ['ဝီစကီဘူး', 'ဘူး', 12, 3, 12000],
    ['ရမ်ဘူး', 'ဘူး', 10, 3, 8000],
    ['ဂျင်ဘူး', 'ဘူး', 6, 2, 9000]
  ];
  const findInv = db.prepare('SELECT id FROM inventory_items WHERE name = ?');
  const insInv = db.prepare('INSERT INTO inventory_items (name, unit, qty, reorder_level, cost) VALUES (?, ?, ?, ?, ?)');
  for (const row of stock) if (!findInv.get(row[0])) insInv.run(...row);

  const mi = Object.fromEntries(db.prepare('SELECT id, name FROM menu_items').all().map(r => [r.name, r.id]));
  const inv = Object.fromEntries(db.prepare('SELECT id, name FROM inventory_items').all().map(r => [r.name, r.id]));
  const recipes = {
    'မြန်မာဘီယာ (ဘူး)': [['ဘီယာဘူး', 1]],
    'တိုက်ဂါဘီယာ (ဘူး)': [['ဘီယာဘူး', 1]],
    'ဟိုင်းနီကန်ဘီယာ (ဘူး)': [['ဘီယာဘူး', 1]],
    'ဒရပ်ဘီယာ (ခွက်)': [['ဒရပ်ဘီယာ', 0.33]],
    'ဒရပ်ဘီယာ (ကရား)': [['ဒရပ်ဘီယာ', 1.5]],
    'ဝီစကီ (ဘူး)': [['ဝီစကီဘူး', 1]],
    'ဝီစကီ (ခွက်)': [['ဝီစကီဘူး', 0.04]],
    'ရမ် (ဘူး)': [['ရမ်ဘူး', 1]],
    'ရမ် (ခွက်)': [['ရမ်ဘူး', 0.04]],
    'ဂျင်း (ခွက်)': [['ဂျင်ဘူး', 0.04]]
  };
  const hasRecipe = db.prepare('SELECT COUNT(*) AS c FROM recipe_items WHERE menu_item_id = ?');
  const insRecipe = db.prepare('INSERT INTO recipe_items (menu_item_id, inventory_item_id, qty) VALUES (?, ?, ?)');
  for (const [name, lines] of Object.entries(recipes)) {
    const itemId = mi[name];
    if (!itemId || hasRecipe.get(itemId).c) continue;
    for (const [invName, qty] of lines) if (inv[invName]) insRecipe.run(itemId, inv[invName], qty);
  }
}
seedAlcoholMenu();

/* Hash legacy plaintext PINs and drop expired sessions. */
function migrateStaffPins() {
  const rows = db.prepare('SELECT id, pin FROM staff').all();
  const upd = db.prepare('UPDATE staff SET pin = ? WHERE id = ?');
  for (const r of rows) {
    if (!String(r.pin).startsWith(PIN_PREFIX)) upd.run(hashPin(r.pin), r.id);
  }
}
migrateStaffPins();
db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now','localtime')").run();


export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function setSettings(obj) {
  const ins = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'key' || k === 'value') continue;
    ins.run(k, String(v));
  }
}

export function nextOrderNo() {
  const day = new Date();
  const ymd = `${String(day.getFullYear()).slice(2)}${String(day.getMonth() + 1).padStart(2, '0')}${String(day.getDate()).padStart(2, '0')}`;
  const row = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE order_no LIKE ?").get(`${ymd}-%`);
  return `${ymd}-${String(row.c + 1).padStart(3, '0')}`;
}

export function orderTotals(orderId) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? AND status != ?').all(orderId, 'cancelled');
  let subtotal = 0;
  for (const it of items) {
    const mods = db.prepare('SELECT * FROM order_item_modifiers WHERE order_item_id = ?').all(it.id);
    const modSum = mods.reduce((s, m) => s + m.price, 0);
    subtotal += Math.round((it.price + modSum) * it.qty);
  }
  return { subtotal, items };
}

export function orderWithItems(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const items = db.prepare(`
    SELECT oi.*, COALESCE(m.is_alcohol, 0) AS is_alcohol, COALESCE(m.station, 'kitchen') AS station
    FROM order_items oi LEFT JOIN menu_items m ON m.id = oi.item_id
    WHERE oi.order_id = ? ORDER BY oi.id
  `).all(orderId);
  for (const it of items) {
    it.modifiers = db.prepare('SELECT * FROM order_item_modifiers WHERE order_item_id = ?').all(it.id);
  }
  const payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY id').all(orderId);
  return { ...order, items, payments };
}

export function tableStatus() {
  return db.prepare(`
    SELECT t.*,
      o.id AS order_id, o.order_no, o.total, o.opened_at, o.guests,
      COALESCE(b.bills, 0) AS bills, COALESCE(b.total, 0) AS open_total
    FROM tables t
    LEFT JOIN orders o ON o.id = (
      SELECT id FROM orders WHERE table_id = t.id AND status = 'open' ORDER BY id LIMIT 1
    )
    LEFT JOIN (
      SELECT table_id, COUNT(*) AS bills, SUM(total) AS total
      FROM orders WHERE status = 'open' GROUP BY table_id
    ) b ON b.table_id = t.id
    ORDER BY t.zone, t.id
  `).all();
}
