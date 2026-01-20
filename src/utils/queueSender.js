// utils/queueSender.js
import { getHeaders } from "../config.js";

// Detecta duplicidade de UNIQUE(event_id) no retorno do proxy
function isDuplicateEventIdResponse(text = "") {
  const t = String(text).toLowerCase();

  return (
    t.includes("23505") || // postgres unique_violation
    t.includes("duplicate key") ||
    t.includes("retiradas_event_id_uniq") ||
    (t.includes("unique constraint") && t.includes("event_id"))
  );
}

// Envia 1 evento da fila para o Supabase (via proxy)
export async function sendQueueEventToSupabase(ev) {
  if (!ev?.id || !ev?.type) throw new Error("Evento inválido (sem id/type).");

  if (!navigator.onLine) throw new Error("OFFLINE");

  // Hoje suportamos só RETIRADA
  if (ev.type !== "RETIRADA") {
    throw new Error(`Tipo não suportado: ${ev.type}`);
  }

  const p = ev.payload || {};

  // Monta payload compatível com a tabela public.retiradas
  // (usando event_id para idempotência)
  const minimal = {
    event_id: ev.id,
    timestamp: p.timestamp ?? null,
    operador: p.operador ?? null,
    sku: p.sku ?? null,
    romaneio: p.romaneio ?? null,
    caixa: p.caixa ?? null,
    grupo: p.grupo ?? null,
    status: p.status ?? "RETIRADO",
    modo: p.modo ?? null,
    chave: p.chave ?? null,
    nl: typeof p.nl === "boolean" ? p.nl : null,
    pedido: p.pedido ?? null,
  };

  const res = await fetch("/api/proxy?endpoint=/rest/v1/retiradas", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(minimal),
  });

  if (!res.ok) {
    const txt = await res.text();

    // ✅ Idempotência: se já existe event_id, tratamos como OK
    if (isDuplicateEventIdResponse(txt)) {
      return true;
    }

    // erro real
    throw new Error(txt || `HTTP ${res.status}`);
  }

  return true;
}
