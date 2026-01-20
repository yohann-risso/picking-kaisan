// utils/queue.js

const DB_NAME = "picking-kaisan-db";
const DB_VERSION = 1;
const STORE = "event_queue";

const STATUS = {
  PENDING: "PENDING",
  SENDING: "SENDING",
  OK: "OK",
  ERROR: "ERROR",
};

function uuid() {
  // UUID simples e bom o suficiente p/ idempotência
  return (crypto?.randomUUID?.() || `evt_${Date.now()}_${Math.random()}`)
    .toString()
    .replace(/\s+/g, "");
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function txStore(mode = "readonly") {
  const db = await openDB();
  const tx = db.transaction(STORE, mode);
  const store = tx.objectStore(STORE);
  return { db, tx, store };
}

export async function enqueueEvent(type, payload) {
  const item = {
    id: uuid(),
    type,
    payload,
    status: STATUS.PENDING,
    attempts: 0,
    createdAt: Date.now(),
    lastError: null,
    nextRetryAt: 0,
  };

  const { db, tx, store } = await txStore("readwrite");
  await new Promise((resolve, reject) => {
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
  return item;
}

export async function listEvents({ limit = 200 } = {}) {
  const { db, store } = await txStore("readonly");
  const items = [];

  await new Promise((resolve, reject) => {
    const req = store.index("createdAt").openCursor(null, "prev");
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || items.length >= limit) return resolve();
      items.push(cursor.value);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });

  db.close();
  return items;
}

export async function getQueueStats() {
  const all = await listEvents({ limit: 2000 });
  const stats = {
    total: all.length,
    pending: all.filter((x) => x.status === STATUS.PENDING).length,
    sending: all.filter((x) => x.status === STATUS.SENDING).length,
    ok: all.filter((x) => x.status === STATUS.OK).length,
    error: all.filter((x) => x.status === STATUS.ERROR).length,
  };
  return { stats, all };
}

export async function updateEvent(id, patch) {
  const { db, store } = await txStore("readwrite");
  const item = await new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!item) {
    db.close();
    return null;
  }

  const updated = { ...item, ...patch };

  await new Promise((resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  db.close();
  return updated;
}

export async function clearByStatus(statusList = [STATUS.OK]) {
  const { db, store } = await txStore("readwrite");
  const all = await listEvents({ limit: 5000 });

  const toDelete = all.filter((x) => statusList.includes(x.status));
  for (const item of toDelete) {
    await new Promise((resolve, reject) => {
      const req = store.delete(item.id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  db.close();
  return toDelete.length;
}

// ---------------------------
// PROCESSADOR (retry/backoff)
// ---------------------------

let _isProcessing = false;
let _timer = null;

// injetado pelo app (ex: função que faz POST na tabela retiradas)
let _sender = null;

export function setQueueSender(fn) {
  _sender = fn;
}

function backoffMs(attempts) {
  // 1s, 2s, 5s, 10s, 20s, 30s...
  const steps = [1000, 2000, 5000, 10000, 20000, 30000];
  return steps[Math.min(attempts, steps.length - 1)];
}

export async function processQueueOnce({ batchSize = 10 } = {}) {
  if (_isProcessing) return;
  if (!_sender) return;

  if (!navigator.onLine) return;

  _isProcessing = true;
  try {
    const { all } = await getQueueStats();

    const now = Date.now();
    const candidates = all
      .filter(
        (x) =>
          (x.status === STATUS.PENDING || x.status === STATUS.ERROR) &&
          (x.nextRetryAt || 0) <= now
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, batchSize);

    for (const ev of candidates) {
      await updateEvent(ev.id, { status: STATUS.SENDING, lastError: null });

      try {
        await _sender(ev); // <- envia para Supabase
        await updateEvent(ev.id, { status: STATUS.OK, lastError: null });
      } catch (err) {
        const attempts = (ev.attempts || 0) + 1;
        await updateEvent(ev.id, {
          status: STATUS.ERROR,
          attempts,
          lastError: String(err?.message || err),
          nextRetryAt: Date.now() + backoffMs(attempts),
        });
      }
    }
  } finally {
    _isProcessing = false;
  }
}

export function startQueueProcessor({ intervalMs = 2000 } = {}) {
  if (_timer) return;
  _timer = setInterval(() => {
    // se o operador estiver bipando (input focado ou desabilitado), deixa quieto
    const input = document.getElementById("skuInput");
    if (input && (document.activeElement === input || input.disabled)) return;
    processQueueOnce().catch(() => {});
  }, intervalMs);

  // tenta assim que voltar a internet
  window.addEventListener("online", () => processQueueOnce().catch(() => {}));
}

export function stopQueueProcessor() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

export async function flushQueue({ timeoutMs = 10000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await processQueueOnce({ batchSize: 25 });
    const { stats } = await getQueueStats();
    if (stats.pending === 0 && stats.error === 0 && stats.sending === 0) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

export { STATUS };
