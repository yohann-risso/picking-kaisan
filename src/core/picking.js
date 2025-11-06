import { state } from "../config.js";
import { mostrarToast, feedbackVisual } from "./interface.js";
import { registrarRetirada } from "../services/supabase.js";
import { atualizarInterface } from "./interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { mostrarAnimacaoCaixa } from "./interface.js";
import { inserirProdutoNaRota } from "../utils/roteamento.js";

export function carregarOperadores() {
  const ops = [
    "Deygles Matos",
    "Filipe Lopes",
    "Gabriel Lagoa",
    "Kaique Teixeira",
    "Lucas Paiva",
    "Marrony Portugal",
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
  const valor = input.value.trim().toUpperCase();
  const grupo = window.grupoSelecionado;
  const operador = window.operadorSelecionado;

  input.disabled = true;
  document.querySelector(".input-group .btn").disabled = true;

  const liberar = () => {
    input.value = "";
    input.disabled = false;
    document.querySelector(".input-group .btn").disabled = false;
    input.focus();
  };

  const idx = state.produtos.findIndex(
    (p) =>
      p.sku.toUpperCase() === valor || (p.ean || "").toUpperCase() === valor
  );

  if (idx === -1) {
    mostrarToast("Produto não encontrado", "error");
    return liberar();
  }

  const produto = state.produtos[idx];
  const dist = produto.distribuicaoAtual;
  let caixa = "";

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

  await registrarRetirada(produto, operador, grupo, caixa);

  const total = dist.A + dist.B + dist.C + dist.D;
  if (total === 0) {
    state.retirados.unshift({
      ...produto,
      caixa,
      grupo,
      distribuicaoOriginal: { ...produto.distribuicaoOriginal },
    });
    state.produtos.splice(idx, 1);
  }

  mostrarAnimacaoCaixa(caixa);
  feedbackVisual(produto.sku, "success");
  atualizarInterface();
  salvarProgressoLocal();
  liberar();
}

export function moverProdutoParaTopo(sku) {
  const idx = state.produtos.findIndex(
    (p) => p.sku.toUpperCase() === sku.toUpperCase()
  );
  if (idx !== -1) {
    const [item] = state.produtos.splice(idx, 1);
    inserirProdutoNaRota(item);
  }
}

/**
 * Move o produto para o endereço secundário, se existir.
 * Caso não haja endereço secundário, move o produto para o fim da lista.
 */
export function pularProduto(sku) {
  const idx = state.produtos.findIndex(
    (p) => p.sku.toUpperCase() === sku.toUpperCase()
  );
  if (idx === -1) {
    console.warn("Produto não encontrado para pular:", sku);
    return;
  }

  const [produto] = state.produtos.splice(idx, 1);

  // Verifica se há endereço secundário
  const [_, novoEndereco] = (produto.endereco || "").split("•");
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
