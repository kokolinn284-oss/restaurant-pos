import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { db, getSettings, orderWithItems } from '../db.js';
import { stationTitle, resolveStation } from '../utils/helpers.js';

export const moneyText = n => Number(n || 0).toLocaleString('en-US');
export const lineText = (a, b, width = 42) => {
  const left = String(a);
  const right = String(b);
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
};

export function buildReceiptText(orderId) {
  const o = orderWithItems(orderId);
  if (!o) throw new Error('Order မတွေ့ပါ');
  const s = getSettings();
  const isProforma = o.status === 'open';
  const tableName = o.table_id ? db.prepare('SELECT name FROM tables WHERE id = ?').get(o.table_id)?.name : '';
  const tax = isProforma ? Math.round(o.subtotal * Number(s.tax_rate || 0) / 100) : o.tax;
  const service = isProforma ? Math.round(o.subtotal * Number(s.service_rate || 0) / 100) : o.service;
  const total = isProforma ? (o.subtotal + tax + service) : o.total;

  const rows = [];
  rows.push((s.shop_name || 'POS').toUpperCase());
  if (s.shop_name_en) rows.push(s.shop_name_en);
  if (s.address) rows.push(s.address);
  if (s.phone) rows.push(`Tel: ${s.phone}`);
  if (isProforma) {
    rows.push('='.repeat(42));
    rows.push('   *** CHECK BILL / UNPAID PROFORMA ***   ');
  }
  rows.push('-'.repeat(42));
  rows.push(lineText(`Order #${o.order_no}`, (o.closed_at || o.opened_at || '').slice(0, 16)));
  rows.push(lineText(tableName ? `Table: ${tableName}` : `Type: ${o.type}`, `Guests: ${o.guests}`));
  rows.push('-'.repeat(42));
  for (const it of o.items) {
    if (it.status === 'cancelled') continue;
    rows.push(lineText(`${it.name} x${it.qty}`, moneyText(Math.round(it.price * it.qty))));
    if (it.note) rows.push(`  * ${it.note}`);
  }
  rows.push('-'.repeat(42));
  rows.push(lineText('Subtotal', moneyText(o.subtotal)));
  if (o.discount) rows.push(lineText('Discount', '-' + moneyText(o.discount)));
  if (tax) rows.push(lineText('Tax', moneyText(tax)));
  if (service) rows.push(lineText('Service', moneyText(service)));
  if (o.points_amount) rows.push(lineText(`Points (${o.points_used})`, '-' + moneyText(o.points_amount)));
  rows.push(lineText(isProforma ? 'TOTAL DUE' : 'TOTAL', moneyText(total)));
  if (!isProforma) {
    const methods = o.payments.map(p => `${p.method_name || p.method}: ${moneyText(p.amount)}`).join('  ');
    if (methods) rows.push(methods);
  } else {
    rows.push('** NOT PAID YET - PROFORMA ONLY **');
  }
  rows.push('-'.repeat(42));
  if (o.items.some(it => it.status !== 'cancelled' && it.is_alcohol)) {
    rows.push('18+ Alcohol - not for sale to under 18');
  }
  rows.push(s.footer || '');
  rows.push('');
  return rows.join('\n');
}

export function buildKitchenText(orderId, station = 'kitchen') {
  const o = orderWithItems(orderId);
  if (!o) throw new Error('Order မတွေ့ပါ');
  const table = o.table_id ? db.prepare('SELECT name FROM tables WHERE id = ?').get(o.table_id)?.name : '';
  const rows = [`${stationTitle(station)} TICKET`, '-'.repeat(42), `#${o.order_no}  ${table || o.type}`, new Date().toLocaleString('en-GB'), '-'.repeat(42)];
  for (const it of o.items) {
    if (it.status !== 'cooking') continue;
    if ((it.station || 'kitchen') !== station) continue;
    rows.push(`${it.name}  x${it.qty}`);
    if (it.note) rows.push(`   >> ${it.note}`);
  }
  rows.push('-'.repeat(42), '');
  return rows.join('\n');
}

export function runPrinter(text) {
  const s = getSettings();
  const mode = s.printer_mode || 'browser';
  if (mode === 'network') {
    const host = s.printer_host;
    const port = Number(s.printer_port) || 9100;
    if (!host) return Promise.reject(new Error('Printer IP မထည့်ရသေးပါ'));
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port, timeout: 5000 }, () => {
        const data = Buffer.concat([Buffer.from([0x1b, 0x40]), Buffer.from(text + '\n\n\n', 'utf8'), Buffer.from([0x1d, 0x56, 0x00])]);
        sock.end(data);
      });
      sock.on('close', resolve);
      sock.on('error', reject);
      sock.on('timeout', () => { sock.destroy(); reject(new Error('Printer ချိတ်ဆက်မှု timeout')); });
    });
  }
  if (mode === 'windows') {
    const file = path.join(os.tmpdir(), `pos-print-${Date.now()}.txt`);
    fs.writeFileSync(file, text, 'utf8');
    const name = (s.printer_name || '').replace(/'/g, "''");
    const cmd = name
      ? `Get-Content -LiteralPath '${file.replace(/'/g, "''")}' -Encoding UTF8 | Out-Printer -Name '${name}'`
      : `Get-Content -LiteralPath '${file.replace(/'/g, "''")}' -Encoding UTF8 | Out-Printer`;
    return new Promise((resolve, reject) => {
      const p = spawn('powershell.exe', ['-NoProfile', '-Command', cmd], { windowsHide: true });
      let err = '';
      p.stderr.on('data', d => { err += d.toString(); });
      p.on('error', reject);
      p.on('close', code => {
        try { fs.unlinkSync(file); } catch {}
        code === 0 ? resolve() : reject(new Error(err || `Print failed (${code})`));
      });
    });
  }
  return Promise.reject(new Error('Printer mode ကို Settings မှာ ရွေးပါ'));
}
