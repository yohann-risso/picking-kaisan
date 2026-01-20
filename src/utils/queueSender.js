// utils/queueSender.js
import { getHeaders } from "../config.js";

// Envia 1 evento da fila para o Supabase (via proxy)
export async function sendQueueEventToSupabase(ev) {
  if (!ev?.type) throw new Error("Evento inválido (sem type).");

  // Hoje vamos suportar só RETIRADA (expande depois)
  if (ev.type !== "RETIRADA") {
    throw new Error(`Tipo não suportado: ${ev.type}`);
  }

  const payload = ev.payload;

  // Importante: se a sua tabela "retiradas" ainda NÃO tiver colunas extras,
  // evite mandar coisas desconhecidas para não quebrar.
  // Aqui mandamos apenas o que já existe no seu registrarRetiradaV2.
  const minimal = {
    timestamp: payload.timestamp,
    operador: payload.operador,
    sku: payload.sku,
    romaneio: payload.romaneio,
    caixa: payload.caixa,
    status: "RETIRADO",

    // contexto (o seu supabase.js já usa isso no avulso)
    grupo: payload.grupo ?? null,
    modo: payload.modo ?? null,
    chave: payload.chave ?? null,
    nl: payload.nl ?? null,
    pedido: payload.pedido ?? null,
  };

  const res = await fetch("/api/proxy?endpoint=/rest/v1/retiradas", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(minimal),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }

  return true;
}
