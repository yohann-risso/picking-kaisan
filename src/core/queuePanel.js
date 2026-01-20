// core/queuePanel.js
import {
  getQueueStats,
  processQueueOnce,
  clearByStatus,
  STATUS,
} from "../utils/queue.js";

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString("pt-BR");
  } catch {
    return "-";
  }
}

function fmtNext(ts) {
  if (!ts) return "-";
  const diff = Math.max(0, ts - Date.now());
  const s = Math.ceil(diff / 1000);
  return s <= 0 ? "agora" : `${s}s`;
}

function badgeForStatus(st) {
  if (st === STATUS.OK) return `<span class="badge bg-success">OK</span>`;
  if (st === STATUS.SENDING)
    return `<span class="badge bg-info text-dark">SENDING</span>`;
  if (st === STATUS.ERROR) return `<span class="badge bg-danger">ERROR</span>`;
  return `<span class="badge bg-warning text-dark">PENDING</span>`;
}

export async function renderQueuePanel() {
  const statsEl = document.getElementById("filaStats");
  const bodyEl = document.getElementById("filaTabela");
  if (!statsEl || !bodyEl) return;

  const { stats, all } = await getQueueStats();

  statsEl.textContent =
    `Total ${stats.total} | ` +
    `Pend ${stats.pending} | ` +
    `Send ${stats.sending} | ` +
    `OK ${stats.ok} | ` +
    `Erro ${stats.error}`;

  const rows = all.slice(0, 200).map((ev) => {
    const p = ev.payload || {};
    return `
      <tr>
        <td>${fmtTime(ev.createdAt)}</td>
        <td><span class="badge bg-secondary">${ev.type}</span></td>
        <td>${badgeForStatus(ev.status)}</td>
        <td>${p.sku ?? "-"}</td>
        <td>${p.romaneio ?? "-"}</td>
        <td>${p.caixa ?? "-"}</td>
        <td>${ev.attempts ?? 0}</td>
        <td>${fmtNext(ev.nextRetryAt)}</td>
        <td style="max-width:280px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${ev.lastError ?? ""}
        </td>
      </tr>
    `;
  });

  bodyEl.innerHTML = rows.join("") || `<tr><td colspan="9">Fila vazia.</td></tr>`;
}

export function setupQueuePanel() {
  const statusBtn = document.getElementById("pollingStatus");
  if (statusBtn) {
    statusBtn.addEventListener("click", async () => {
      await renderQueuePanel();
      new bootstrap.Modal(document.getElementById("modalFila")).show();
    });
  }

  document.getElementById("btnFilaSyncAgora")?.addEventListener("click", async () => {
    await processQueueOnce({ batchSize: 25 });
    await renderQueuePanel();
  });

  document.getElementById("btnFilaLimparOk")?.addEventListener("click", async () => {
    await clearByStatus([STATUS.OK]);
    await renderQueuePanel();
  });

  document.getElementById("btnFilaLimparTudo")?.addEventListener("click", async () => {
    await clearByStatus([STATUS.OK, STATUS.ERROR]);
    await renderQueuePanel();
  });

  // Re-render automático quando modal estiver aberto
  const modalEl = document.getElementById("modalFila");
  modalEl?.addEventListener("shown.bs.modal", () => {
    const t = setInterval(() => renderQueuePanel().catch(() => {}), 1200);
    modalEl._queueTimer = t;
  });
  modalEl?.addEventListener("hidden.bs.modal", () => {
    if (modalEl._queueTimer) clearInterval(modalEl._queueTimer);
    modalEl._queueTimer = null;
  });
}
