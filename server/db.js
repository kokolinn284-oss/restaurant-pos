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
db.exec('PRAGMA busy_timeout = 5000;');
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

CREATE TABLE IF NOT EXISTS payment_methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS credit_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  staff_id INTEGER,
  paid_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (credit_id) REFERENCES credits(id) ON DELETE CASCADE
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
CREATE INDEX IF NOT EXISTS idx_credit_payments_paid ON credit_payments(paid_at);
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
ensureColumn('order_items', 'cancel_reason', "TEXT NOT NULL DEFAULT ''");
ensureColumn('order_items', 'cancelled_by', 'INTEGER');
ensureColumn('order_items', 'cancelled_at', 'TEXT');
ensureColumn('orders', 'promotion_id', 'INTEGER');
ensureColumn('orders', 'points_used', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('orders', 'points_amount', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('orders', 'customer_name', "TEXT NOT NULL DEFAULT ''");
ensureColumn('orders', 'customer_phone', "TEXT NOT NULL DEFAULT ''");
ensureColumn('orders', 'source', "TEXT NOT NULL DEFAULT 'pos'");
ensureColumn('orders', 'client_ref', 'TEXT');
ensureColumn('orders', 'confirmed_at', 'TEXT');
ensureColumn('orders', 'public_token', "TEXT DEFAULT ''");
ensureColumn('orders', 'void_reason', "TEXT NOT NULL DEFAULT ''");
ensureColumn('orders', 'voided_by', 'INTEGER');
db.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  order_id INTEGER,
  order_no TEXT NOT NULL DEFAULT '',
  table_name TEXT NOT NULL DEFAULT '',
  item_name TEXT NOT NULL DEFAULT '',
  qty REAL NOT NULL DEFAULT 0,
  amount INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  staff_id INTEGER,
  staff_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_client_ref ON orders(client_ref) WHERE client_ref IS NOT NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_public_token ON orders(public_token) WHERE public_token <> \'\'');
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

const DEFAULT_PAYMENT_METHODS = [
  ['cash', 'ငွေသား (Cash)'],
  ['kbzpay', 'KBZPay (KPay QR)'],
  ['wavepay', 'WavePay'],
  ['ayapay', 'AYA Pay'],
  ['bank', 'ဘဏ်ကတ် / Mobile Banking'],
  ['credit', 'အကြွေး / စာရင်းဖွင့်']
];
if (!db.prepare("SELECT 1 FROM settings WHERE key = 'payment_methods_seeded'").get()) {
  const insPm = db.prepare('INSERT OR IGNORE INTO payment_methods (code, name, sort) VALUES (?, ?, ?)');
  DEFAULT_PAYMENT_METHODS.forEach(([code, name], i) => insPm.run(code, name, (i + 1) * 10));
  const known = new Set(DEFAULT_PAYMENT_METHODS.map(([code]) => code));
  let sort = 100;
  for (const row of db.prepare("SELECT DISTINCT method FROM payments WHERE TRIM(method) <> ''").all()) {
    if (!known.has(row.method)) insPm.run(row.method, row.method, sort += 10);
  }
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('payment_methods_seeded', '1')").run();
}

const count = (table) => db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;

export function seed() {
  const defaults = {
    shop_name: 'စည်တော်ကြီး မြန်မာရိုးရာ စားသောက်ဆိုင် & စည်ဘီယာ',
    shop_name_en: 'Si Daw Gyi Traditional Restaurant & Beer Garden',
    address: 'အမှတ် (၂၈)၊ အင်းစိန်လမ်းမကြီး၊ လှည်းတန်း၊ ကမာရွတ်မြို့နယ်၊ ရန်ကုန်မြို့။',
    phone: '09-450022334, 09-798887766',
    currency: 'MMK',
    tax_rate: '5',
    service_rate: '0',
    footer: 'ဝယ်ယူအားပေးမှုကို အထူးကျေးဇူးတင်ရှိပါသည်။ ဝန်ဆောင်မှုအပေါ် အကြံပြုလိုပါက ဖုန်း ၀၉-၄၅၀၀၂၂၃၃၄ သို့ ဆက်သွယ်နိုင်ပါသည်။ (ကျေးဇူးပြု၍ ဘောင်ချာအား သိမ်းထားပေးပါ)',
    receipt_printer_width: '80',
    points_per_1000: '1',
    point_value: '1',
    printer_mode: 'browser',
    printer_host: '',
    printer_port: '9100',
    printer_name: '',
    version: '1.0'
  };
  const insSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) insSetting.run(k, v);

  if (count('staff') === 0) {
    const ins = db.prepare('INSERT INTO staff (name, pin, role) VALUES (?, ?, ?)');
    ins.run('ဆိုင်ရှင်', hashPin('1234'), 'owner');
    ins.run('ကောင်တာ', hashPin('1111'), 'cashier');
    ins.run('စားပွဲထိုး', hashPin('2222'), 'waiter');
  }

  if (count('categories') === 0) {
    const ins = db.prepare('INSERT INTO categories (name, sort) VALUES (?, ?)');
    const cats = [
      'မြန်မာထမင်းနှင့် ဟင်းလျာများ',
      'ထမင်းကြော်နှင့် ခေါက်ဆွဲကြော်',
      'မုန့်ဟင်းခါးနှင့် ရှမ်းအစားအစာ',
      'အသားကင်နှင့် အကြော်အမြည်း',
      'အရံဟင်းနှင့် ရိုးရာဟင်းချို',
      'သစ်သီးဖျော်ရည်နှင့် အအေး',
      'လက်ဖက်ရည်နှင့် ကော်ဖီ',
      'စည်ဘီယာနှင့် အဖျော်ယမကာ'
    ];
    cats.forEach((c, i) => ins.run(c, (i + 1) * 10));
  }

  if (count('menu_items') === 0) {
    const ins = db.prepare(`INSERT INTO menu_items (category_id, name, price, cost, unit, sort, is_alcohol, station, image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const items = [
      // 1. မြန်မာထမင်းနှင့် ဟင်းလျာများ
      [1, 'ကြက်သားဆီပြန်ဟင်း + ထမင်း', 6500, 3200, 'ပွဲ', 1, 0, 'kitchen', '/menu/chicken_curry_rice.webp'],
      [1, 'ဝက်သားနီချက် + ထမင်း', 7000, 3600, 'ပွဲ', 2, 0, 'kitchen', '/menu/pork_curry_rice.webp'],
      [1, 'ငါးကြင်းဆီပြန်ဟင်း + ထမင်း', 6500, 3100, 'ပွဲ', 3, 0, 'kitchen', '/menu/fish_fried_rice.webp'],
      [1, 'အမဲသားနှပ်ဟင်း + ထမင်း', 8000, 4200, 'ပွဲ', 4, 0, 'kitchen', '/menu/pork_curry_rice.webp'],
      [1, 'ပုစွန်ဆီပြန်ဟင်း + ထမင်း', 8500, 4500, 'ပွဲ', 5, 0, 'kitchen', '/menu/chicken_curry_rice.webp'],
      [1, 'ထမင်းဖြူ (ပွဲ)', 1000, 400, 'ပွဲ', 6, 0, 'kitchen', '/menu/boiled_peas.webp'],

      // 2. ထမင်းကြော်နှင့် ခေါက်ဆွဲကြော်
      [2, 'ကြက်သားထမင်းကြော် (ကြက်ဥပါ)', 5500, 2600, 'ပွဲ', 1, 0, 'kitchen', '/menu/chicken_fried_rice.webp'],
      [2, 'ဝက်သားထမင်းကြော် (ကြက်ဥပါ)', 5500, 2600, 'ပွဲ', 2, 0, 'kitchen', '/menu/pork_fried_rice.webp'],
      [2, 'ပင်လယ်စာထမင်းကြော်', 7000, 3500, 'ပွဲ', 3, 0, 'kitchen', '/menu/fish_fried_rice.webp'],
      [2, 'ကြက်သားခေါက်ဆွဲကြော်', 5000, 2400, 'ပွဲ', 4, 0, 'kitchen', '/menu/fried_noodles.webp'],
      [2, 'ပင်လယ်စာကြာဇံကြော်', 6500, 3200, 'ပွဲ', 5, 0, 'kitchen', '/menu/fried_noodles.webp'],
      [2, 'ကြက်သားထမင်းပေါင်း', 6000, 2800, 'ပွဲ', 6, 0, 'kitchen', '/menu/chicken_curry_rice.webp'],

      // 3. မုန့်ဟင်းခါးနှင့် ရှမ်းအစားအစာ
      [3, 'မုန့်ဟင်းခါး (ဘဲဥ၊ အကြော်စုံပါ)', 3500, 1600, 'ပွဲ', 1, 0, 'kitchen', '/menu/mohinga.webp'],
      [3, 'ရခိုင်မုန့်တီ (သုပ် / အရည်)', 3500, 1500, 'ပွဲ', 2, 0, 'kitchen', '/menu/mont_di.webp'],
      [3, 'ရှမ်းခေါက်ဆွဲ (ကြက် / ဝက်)', 4000, 1900, 'ပွဲ', 3, 0, 'kitchen', '/menu/shan_noodles.webp'],
      [3, 'နန်းကြီးသုပ် (ကြက်သားပါ)', 4500, 2100, 'ပွဲ', 4, 0, 'kitchen', '/menu/mohinga.webp'],

      // 4. အသားကင်နှင့် အကြော်အမြည်း
      [4, 'ကြက်သားကင် (မာလာဆော့စ်)', 8500, 4200, 'ပွဲ', 1, 0, 'kitchen', '/menu/grilled_chicken.webp'],
      [4, 'ဝက်သုံးထပ်သားကင်', 8000, 4000, 'ပွဲ', 2, 0, 'kitchen', '/menu/grilled_pork.webp'],
      [4, 'ကြက်တောင်ပံကြော် (၅ တောင့်)', 6500, 3100, 'ပွဲ', 3, 0, 'kitchen', '/menu/fried_chicken.webp'],
      [4, 'ငါးဖယ်သုပ်', 4500, 2000, 'ပွဲ', 4, 0, 'kitchen', '/menu/mont_di.webp'],
      [4, 'လက်ဖက်သုပ် (အကြော်စုံပါ)', 4000, 1800, 'ပွဲ', 5, 0, 'kitchen', '/menu/boiled_peas.webp'],
      [4, 'ငါးကြော်ခြောက် (ခရမ်းချဉ်သီးဆော့စ်)', 6500, 3000, 'ပွဲ', 6, 0, 'kitchen', '/menu/fried_dried_fish.webp'],

      // 5. အရံဟင်းနှင့် ရိုးရာဟင်းချို
      [5, 'ချဉ်ပေါင်ရွက်ကြော်', 2500, 1100, 'ပန်းကန်', 1, 0, 'kitchen', '/menu/roselle_stirfry.webp'],
      [5, 'ပဲပြုတ် (ဆီဆမ်း)', 2000, 800, 'ပန်းကန်', 2, 0, 'kitchen', '/menu/boiled_peas.webp'],
      [5, 'ကြက်ဥပြုတ်', 1200, 600, 'လုံး', 3, 0, 'kitchen', '/menu/boiled_eggs.webp'],
      [5, 'သီးစုံဟင်းချို', 2500, 1000, 'ပန်းကန်', 4, 0, 'kitchen', '/menu/roselle_stirfry.webp'],
      [5, 'ငပိရည်တို့စရာအစုံ', 3000, 1200, 'ပွဲ', 5, 0, 'kitchen', '/menu/boiled_peas.webp'],

      // 6. သစ်သီးဖျော်ရည်နှင့် အအေး
      [6, 'ထောပတ်သီးဖျော်ရည်', 3500, 1600, 'ခွက်', 1, 0, 'bar', '/menu/fruit_shake.webp'],
      [6, 'လိမ္မော်ရည် (လတ်လတ်ဆတ်ဆတ်)', 3000, 1400, 'ခွက်', 2, 0, 'bar', '/menu/orange_juice.webp'],
      [6, 'သံပုရာရည်', 2000, 800, 'ခွက်', 3, 0, 'bar', '/menu/fruit_shake.webp'],
      [6, 'ကိုကာကိုလာ (အေး)', 2000, 1200, 'ဘူး', 4, 0, 'bar', '/menu/cola.webp'],
      [6, 'ရေသန့် (၁ လီတာ)', 1000, 400, 'ဘူး', 5, 0, 'bar', '/menu/purified_water.webp'],

      // 7. လက်ဖက်ရည်နှင့် ကော်ဖီ
      [7, 'ရိုးရာလက်ဖက်ရည် (ချိုစိမ့်)', 1800, 700, 'ခွက်', 1, 0, 'bar', '/menu/milk_tea.webp'],
      [7, 'ရိုးရာလက်ဖက်ရည် (ပေါ့ကျ)', 1800, 700, 'ခွက်', 2, 0, 'bar', '/menu/milk_tea.webp'],
      [7, 'နို့လက်ဖက်ရည်အေး', 2500, 1000, 'ခွက်', 3, 0, 'bar', '/menu/milk_tea_iced.webp'],
      [7, 'ကော်ဖီ (အပူ)', 2500, 1000, 'ခွက်', 4, 0, 'bar', '/menu/coffee.webp'],
      [7, 'ကော်ဖီအေး (Iced Coffee)', 3000, 1200, 'ခွက်', 5, 0, 'bar', '/menu/coffee.webp'],

      // 8. စည်ဘီယာနှင့် အဖျော်ယမကာ
      [8, 'မြန်မာဒရော့ဖ်ဘီယာ (ဖန်ခွက်)', 3000, 1500, 'ခွက်', 1, 1, 'bar', '/menu/draft_beer_glass.webp'],
      [8, 'မြန်မာဒရော့ဖ်ဘီယာ (ကရား)', 10000, 5000, 'ကရား', 2, 1, 'bar', '/menu/draft_beer_mug.webp'],
      [8, 'မြန်မာဘီယာ (ပုလင်း)', 4800, 3200, 'ပုလင်း', 3, 1, 'bar', '/menu/beer_bottle.webp'],
      [8, 'တိုက်ဂါဘီယာ (ပုလင်း)', 5200, 3500, 'ပုလင်း', 4, 1, 'bar', '/menu/beer_bottle.webp'],
      [8, 'ဟိုင်းနီကန်ဘီယာ (ပုလင်း)', 5800, 4000, 'ပုလင်း', 5, 1, 'bar', '/menu/beer_bottle.webp'],
      [8, 'Grand Royal ဝီစကီ (ပုလင်း)', 28000, 19000, 'ပုလင်း', 6, 1, 'bar', '/menu/whisky_bottle.webp'],
      [8, 'Grand Royal ဝီစကီ (ပက်/ခွက်)', 3500, 1800, 'ခွက်', 7, 1, 'bar', '/menu/whisky_glass.webp'],
      [8, 'ဂျင် (ခွက်)', 3000, 1500, 'ခွက်', 8, 1, 'bar', '/menu/gin_glass.webp']
    ];

    for (const it of items) ins.run(...it);
  }

  if (count('tables') === 0) {
    const ins = db.prepare('INSERT INTO tables (name, zone, seats) VALUES (?, ?, ?)');
    for (let i = 1; i <= 8; i++) ins.run(`စားပွဲ ${i}`, 'ဆိုင်တွင်း (Aircon)', 4);
    for (let i = 9; i <= 14; i++) ins.run(`စားပွဲ ${i}`, 'အပြင်ဘက် (Garden)', 4);
    ins.run('VIP-1', 'VIP အခန်း', 8);
    ins.run('VIP-2', 'VIP အခန်း', 10);
  }

  if (count('inventory_items') === 0) {
    const ins = db.prepare('INSERT INTO inventory_items (name, unit, qty, reorder_level, cost) VALUES (?, ?, ?, ?, ?)');
    const inv = [
      ['ဆန် (ပေါ်ဆန်းမွှေး)', 'ကီလို', 100, 20, 3500],
      ['ကြက်သားလတ်လတ်ဆတ်ဆတ်', 'ကီလို', 30, 8, 12000],
      ['ဝက်သား (သုံးထပ်သား)', 'ကီလို', 25, 6, 16000],
      ['ငါးကြင်းလတ်ဆတ်', 'ကီလို', 15, 5, 11000],
      ['အမဲသား', 'ကီလို', 15, 5, 22000],
      ['ပုစွန်ကျား', 'ကီလို', 10, 3, 28000],
      ['ပဲဆီသန့်', 'လီတာ', 30, 10, 11000],
      ['ကြက်သွန်နီ/ဖြူ', 'ကီလို', 20, 5, 4500],
      ['ငရုတ်သီးစိမ်း/ခြောက်', 'ကီလို', 8, 2, 7000],
      ['ပဲပြုတ်', 'ကီလို', 10, 3, 3000],
      ['လက်ဖက်ညွန့်အိ', 'ကီလို', 8, 2, 8500],
      ['နို့ဆီ/နို့စိမ်း', 'ဘူး', 48, 12, 2800],
      ['လက်ဖက်ခြောက်/ကော်ဖီမှုန့်', 'ကီလို', 6, 2, 9000],
      ['ရေသန့် (၁ လီတာ)', 'ဘူး', 120, 30, 400],
      ['ကိုကာကိုလာ (ဘူး)', 'ဘူး', 72, 24, 1200],
      ['ဒရပ်ဘီယာ (စည်)', 'လီတာ', 100, 20, 4500],
      ['မြန်မာဘီယာ (ပုလင်း)', 'ပုလင်း', 48, 12, 3200],
      ['တိုက်ဂါဘီယာ (ပုလင်း)', 'ပုလင်း', 36, 12, 3500],
      ['ဟိုင်းနီကန်ဘီယာ (ပုလင်း)', 'ပုလင်း', 36, 12, 4000],
      ['Grand Royal ဝီစကီ', 'ပုလင်း', 18, 6, 19000]
    ];
    for (const row of inv) ins.run(...row);
  }

  if (count('customers') === 0) {
    const ins = db.prepare('INSERT INTO customers (name, phone, points, tier) VALUES (?, ?, ?, ?)');
    ins.run('ဦးကျော်သူ', '09-450012345', 50, 'gold');
    ins.run('ဒေါ်သန်းသန်းဆင့်', '09-798881234', 20, 'normal');
    ins.run('ကိုဝင်းမင်းထွန်း', '09-250098765', 85, 'vip');
  }

  if (count('recipe_items') === 0 && count('menu_items') > 0 && count('inventory_items') > 0) {
    const mi = Object.fromEntries(db.prepare('SELECT id, name FROM menu_items').all().map(r => [r.name, r.id]));
    const inv = Object.fromEntries(db.prepare('SELECT id, name FROM inventory_items').all().map(r => [r.name, r.id]));
    const recipes = {
      'ကြက်သားဆီပြန်ဟင်း + ထမင်း': [['ဆန် (ပေါ်ဆန်းမွှေး)', 0.18], ['ကြက်သားလတ်လတ်ဆတ်ဆတ်', 0.15], ['ပဲဆီသန့်', 0.04], ['ကြက်သွန်နီ/ဖြူ', 0.03]],
      'ဝက်သားနီချက် + ထမင်း': [['ဆန် (ပေါ်ဆန်းမွှေး)', 0.18], ['ဝက်သား (သုံးထပ်သား)', 0.15], ['ပဲဆီသန့်', 0.04], ['ကြက်သွန်နီ/ဖြူ', 0.03]],
      'ကြက်သားထမင်းကြော် (ကြက်ဥပါ)': [['ဆန် (ပေါ်ဆန်းမွှေး)', 0.18], ['ကြက်သားလတ်လတ်ဆတ်ဆတ်', 0.1], ['ပဲဆီသန့်', 0.03]],
      'မုန့်ဟင်းခါး (ဘဲဥ၊ အကြော်စုံပါ)': [['ပဲဆီသန့်', 0.03], ['ကြက်သွန်နီ/ဖြူ', 0.02]],
      'ရေသန့် (၁ လီတာ)': [['ရေသန့် (၁ လီတာ)', 1]],
      'ကိုကာကိုလာ (အေး)': [['ကိုကာကိုလာ (ဘူး)', 1]],
      'မြန်မာဒရော့ဖ်ဘီယာ (ဖန်ခွက်)': [['ဒရပ်ဘီယာ (စည်)', 0.33]],
      'မြန်မာဒရော့ဖ်ဘီယာ (ကရား)': [['ဒရပ်ဘီယာ (စည်)', 1.2]],
      'မြန်မာဘီယာ (ပုလင်း)': [['မြန်မာဘီယာ (ပုလင်း)', 1]],
      'တိုက်ဂါဘီယာ (ပုလင်း)': [['တိုက်ဂါဘီယာ (ပုလင်း)', 1]],
      'ဟိုင်းနီကန်ဘီယာ (ပုလင်း)': [['ဟိုင်းနီကန်ဘီယာ (ပုလင်း)', 1]],
      'Grand Royal ဝီစကီ (ပုလင်း)': [['Grand Royal ဝီစကီ', 1]],
      'Grand Royal ဝီစကီ (ပက်/ခွက်)': [['Grand Royal ဝီစကီ', 0.05]]
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
    ins.run('နေ့လယ်စာ ပရိုမိုးရှင်း (၁၀%)', 'percent', 10, 15000, '11:00', '14:00', 1);
    ins.run('ညနေဘီယာ Happy Hour (၅%)', 'percent', 5, 20000, '17:00', '20:00', 1);
    ins.run('၃၀,၀၀၀ ကျပ်အထက် ၂,၀၀၀ လျှော့', 'amount', 2000, 30000, '', '', 1);
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
// seedAlcoholMenu(); // integrated in seed()

/* One-time backfill of seeded menu photos (keeps later manual clears). */
function seedMenuImages() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'menu_images_seeded'").get()) return;
  const images = {
    'ကြက်သားထမင်းကြော်': 'chicken_fried_rice',
    'ဝက်သားထမင်းကြော်': 'pork_fried_rice',
    'ငါးကြင်းထမင်းကြော်': 'fish_fried_rice',
    'ကြက်သားဟင်းထမင်း': 'chicken_curry_rice',
    'ဝက်သားဟင်းထမင်း': 'pork_curry_rice',
    'မုန့်ဟင်းခါး': 'mohinga',
    'ခေါက်ဆွဲကြော်': 'fried_noodles',
    'ရှမ်းခေါက်ဆွဲ': 'shan_noodles',
    'မုန့်တီ': 'mont_di',
    'ကြက်သားကင်': 'grilled_chicken',
    'ဝက်သားကင်': 'grilled_pork',
    'ငါးကြော်ခြောက်': 'fried_dried_fish',
    'ကြက်သားကြော်': 'fried_chicken',
    'ပဲပြုတ်': 'boiled_peas',
    'ချဉ်ပေါင်ရွက်ကြော်': 'roselle_stirfry',
    'ကြက်ဥပြုတ်': 'boiled_eggs',
    'ရေသန့်ဘူး': 'purified_water',
    'ကိုကာကိုလာ': 'cola',
    'လိမ္မော်ရည်': 'orange_juice',
    'ဖျော်ရည်': 'fruit_shake',
    'လက်ဖက်ရည်': 'milk_tea',
    'လဖက်ရည်': 'milk_tea',
    'ကော်ဖီ': 'coffee',
    'နို့လက်ဖက်ရည်': 'milk_tea_iced',
    'နို့လဖက်ရည်': 'milk_tea_iced',
    'မြန်မာဘီယာ (ဘူး)': 'beer_bottle',
    'တိုက်ဂါဘီယာ (ဘူး)': 'beer_bottle',
    'ဟိုင်းနီကန်ဘီယာ (ဘူး)': 'beer_bottle',
    'ဒရပ်ဘီယာ (ခွက်)': 'draft_beer_glass',
    'ဒရပ်ဘီယာ (ကရား)': 'draft_beer_mug',
    'ဝီစကီ (ဘူး)': 'whisky_bottle',
    'ဝီစကီ (ခွက်)': 'whisky_glass',
    'ရမ် (ဘူး)': 'whisky_bottle',
    'ရမ် (ခွက်)': 'whisky_glass',
    'ဂျင်း (ခွက်)': 'gin_glass'
  };
  const upd = db.prepare("UPDATE menu_items SET image = ? WHERE name = ? AND (image IS NULL OR TRIM(image) = '')");
  for (const [name, slug] of Object.entries(images)) upd.run(`/menu/${slug}.webp`, name);
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('menu_images_seeded', '1')").run();
}
seedMenuImages();

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
  const order = db.prepare(`
    SELECT o.*, cu.name AS member_name, cu.phone AS member_phone
    FROM orders o LEFT JOIN customers cu ON cu.id = o.customer_id
    WHERE o.id = ?
  `).get(orderId);
  if (!order) return null;
  const items = db.prepare(`
    SELECT oi.*, COALESCE(m.is_alcohol, 0) AS is_alcohol, COALESCE(m.station, 'kitchen') AS station
    FROM order_items oi LEFT JOIN menu_items m ON m.id = oi.item_id
    WHERE oi.order_id = ? ORDER BY oi.id
  `).all(orderId);
  for (const it of items) {
    it.modifiers = db.prepare('SELECT * FROM order_item_modifiers WHERE order_item_id = ?').all(it.id);
  }
  const payments = db.prepare(`
    SELECT p.*, COALESCE(m.name, p.method) AS method_name
    FROM payments p LEFT JOIN payment_methods m ON m.code = p.method
    WHERE p.order_id = ? ORDER BY p.id
  `).all(orderId);
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
