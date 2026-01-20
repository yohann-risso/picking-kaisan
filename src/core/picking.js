// core/picking.js
import { state } from "../config.js";
import {
  mostrarToast,
  feedbackVisual,
  mostrarAnimacaoCaixa,
} from "./interface.js";
import { atualizarInterface } from "./interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { inserirProdutoNaRota } from "../utils/roteamento.js";

import { enqueueEvent } from "../utils/queue.js";

// Mantém import por compat (não usamos mais no fluxo offline-first)
// import { registrarRetiradaV2 } from "../services/supabase.js";

export function carregarOperadores() {
  const ops = [
    "Bryan Gomes",
    "Deygles Matos",
    "Filipe Lopes",
    "Gabriel Lagoa",
    "Heitor Zavoli",
    "Kaique Teixeira",
    "Lucas Paiva",
    "Yohann Risso",
  ];

  if (!window.aguardarElemento) {
    console.warn("aguardarElemento não disponível no escopo global.");
    return;
  }

  aguardarElemento("operadorModal", (el) => {
    el.innerHTML = ops
      .map((op) => `<option value="${op}">${op}</option>`)
      .join("");
  });
}

export async function biparProduto() {
  const input = document.getElementById("skuInput");
  const btn = document.querySelector(".input-group .btn");
  const valor = (input?.value || "").trim().toUpperCase();
  const operador = window.operadorSelecionado;

  // ctx único (novo). fallback para grupo (compatibilidade)
  const ctx = window.pickingContexto?.tipo
    ? window.pickingContexto
    : { tipo: "GRUPO", grupo: window.grupoSelecionado, operador };

  // Trava UI de bipagem (rápido)
  if (input) input.disabled = true;
  if (btn) btn.disabled = true;

  const liberar = () => {
    if (input) {
      input.value = "";
      input.disabled = false;
      input.focus();
    }
    if (btn) btn.disabled = false;
  };

  if (!valor) {
    mostrarToast("Informe um SKU/EAN", "warning");
    return liberar();
  }

  if (!ctx || !operador) {
    mostrarToast("Operador não definido", "error");
    return liberar();
  }

  const idx = state.produtos.findIndex(
    (p) =>
      (p.sku || "").toUpperCase() === valor ||
      (p.ean || "").toUpperCase() === valor
  );

  if (idx === -1) {
    mostrarToast("Produto não encontrado", "error");
    return liberar();
  }

  const produto = state.produtos[idx];
  const dist = produto.distribuicaoAtual || { A: 0, B: 0, C: 0, D: 0 };
  let caixa = "";

  // Regra atual: retira sempre na ordem A->B->C->D
  if (dist.A > 0) {
    dist.A--;
    caixa = "A";
  } else if (dist.B > 0) {
    dist.B--;
    caixa = "B";
  } else if (dist.C > 0) {
    dist.C--;
    caixa = "C";
  } else if (dist.D > 0) {
    dist.D--;
    caixa = "D";
  }

  if (!caixa) {
    mostrarToast("Produto sem caixa para retirar", "error");
    return liberar();
  }

  // ✅ OFFLINE-FIRST: grava evento local imediatamente (não espera rede)
  // Observação: sender no main.js transforma esse payload em POST no Supabase.
  const timestamp = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .replace(" ", "T");

  const payload = {
    timestamp,
    operador,
    sku: produto.sku,
    romaneio: produto.romaneio,
    caixa,

    // Contexto do picking (grupo/avulso)
    grupo:
      ctx.tipo === "GRUPO"
        ? parseInt(ctx.grupo ?? window.grupoSelecionado)
        : null,
    modo: ctx.tipo === "AVULSO" ? "AVULSO" : null,
    chave: ctx.tipo === "AVULSO" ? String(ctx.chave || "").trim() : null,
    nl: ctx.tipo === "AVULSO" ? !!ctx.nl : null,

    // Se existir no seu dataset (não obrigatório)
    pedido: produto.pedido ?? null,
  };

  enqueueEvent("RETIRADA", payload).catch((e) => {
    console.error("❌ Falha ao enfileirar evento:", e);
    // IMPORTANTE: mesmo se falhar a fila, a operação já alterou o estado local.
    // Aqui você pode opcionalmente reverter dist, mas eu NÃO recomendo,
    // pois isso reintroduz dependência/instabilidade na UX.
    mostrarToast(
      "⚠️ Ação feita, mas falhou ao registrar na fila local.",
      "warning"
    );
  });

  // Move para retirados caso tenha zerado o total local
  const total = (dist.A || 0) + (dist.B || 0) + (dist.C || 0) + (dist.D || 0);
  if (total === 0) {
    const registroRetirado = {
      ...produto,
      caixa,
      distribuicaoOriginal: {
        ...(produto.distribuicaoOriginal || { A: 0, B: 0, C: 0, D: 0 }),
      },
    };

    if (ctx.tipo === "GRUPO") {
      registroRetirado.grupo = ctx.grupo;
    } else {
      registroRetirado.modo = "AVULSO";
      registroRetirado.chave = String(ctx.chave || "").trim();
      registroRetirado.nl = !!ctx.nl;
    }

    state.retirados.unshift(registroRetirado);
    state.produtos.splice(idx, 1);
  }

  // UI feedback imediato
  mostrarAnimacaoCaixa(caixa);
  feedbackVisual(produto.sku, "success");
  atualizarInterface();
  salvarProgressoLocal();
  liberar();
}

export function moverProdutoParaTopo(sku) {
  const idx = state.produtos.findIndex(
    (p) => (p.sku || "").toUpperCase() === (sku || "").toUpperCase()
  );
  if (idx !== -1) {
    const [item] = state.produtos.splice(idx, 1);
    inserirProdutoNaRota(item, state);
  }
}

/**
 * Move o produto para o endereço secundário, se existir.
 * Caso não haja endereço secundário, move o produto para o fim da lista.
 */
export function pularProduto(sku) {
  const idx = state.produtos.findIndex(
    (p) => (p.sku || "").toUpperCase() === (sku || "").toUpperCase()
  );
  if (idx === -1) {
    console.warn("Produto não encontrado para pular:", sku);
    return;
  }

  const [produto] = state.produtos.splice(idx, 1);

  // Verifica se há endereço secundário
  const [, novoEndereco] = (produto.endereco || "").split("•");
  const novo = novoEndereco?.trim();

  if (novo && /A\d+-B\d+-R\d+-C\d+-N\d+/.test(novo)) {
    // Atualiza endereço e ordem
    produto.endereco = novo;
    produto.ordemEndereco = extrairOrdemEndereco(novo);

    // Garante que não duplica
    const jaExiste = state.produtos.some(
      (p) => p.sku === produto.sku && p.romaneio === produto.romaneio
    );

    if (!jaExiste) {
      // insere novamente na rota (na nova posição ordenada)
      inserirProdutoNaRota(produto, state);
    }

    mostrarToast(
      `➡️ Produto ${produto.sku} avançou para o endereço secundário.`,
      "info"
    );
  } else {
    // Sem endereço secundário → manda pro fim
    state.produtos.push(produto);
    mostrarToast(`↪️ ${produto.sku} movido para o fim da lista.`, "info");
  }

  atualizarInterface();
  salvarProgressoLocal();
}

/** Extrai ordem numérica do endereço para comparação */
function extrairOrdemEndereco(endereco = "") {
  const [endPrimario = ""] = endereco.split("•").map((e) => e.trim());
  const match = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(endPrimario);
  return match ? match.slice(1).map(Number) : [999, 999, 999, 999, 999];
}
