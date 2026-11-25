import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { DATA_DIR, db } from './db.js';

// Middleware & Services
import { authMiddleware } from './middleware/auth.js';
import { clients, handleEvents } from './services/sse.js';

// Modular Routes
import { authRouter } from './routes/auth.js';
import { catalogRouter } from './routes/catalog.js';
import { tablesRouter } from './routes/tables.js';
import { menuRouter } from './routes/menu.js';
import { ordersRouter } from './routes/orders.js';
import { kitchenRouter } from './routes/kitchen.js';
import { reportsRouter } from './routes/reports.js';
import { inventoryRouter } from './routes/inventory.js';
import { financeRouter } from './routes/finance.js';
import { settingsRouter } from './routes/settings.js';

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.POS_TRUST_PROXY === '1') app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));

const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

// Realtime SSE endpoint
app.get('/api/events', handleEvents);

// Public / Unauthenticated routes & customer catalog
app.use(authRouter);
app.use(catalogRouter);

// Authentication & Role-based Authorization Middleware for protected API
app.use('/api', authMiddleware);

// Mount modular feature routers
app.use(tablesRouter);
app.use(menuRouter);
app.use(ordersRouter);
app.use(kitchenRouter);
app.use(reportsRouter);
app.use(inventoryRouter);
app.use(financeRouter);
app.use(settingsRouter);

// Static frontend SPA serving
const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(nets)) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
  }
  console.log(`POS server: http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  Network:  http://${ip}:${PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — closing server…`);
  for (const res of clients) { try { res.end(); } catch {} }
  clients.clear();
  server.close(() => {
    try { db.close(); } catch {}
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
