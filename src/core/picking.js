import { state } from "../config.js";
import { mostrarToast, feedbackVisual } from "./interface.js";
import { registrarRetirada } from "../services/supabase.js";
import { atualizarInterface } from "./interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { mostrarAnimacaoCaixa } from "./interface.js";
import { inserirProdutoNaRota } from "../utils/roteamento.js";

export function carregarOperadores() {
  const ops = [
    "Alan Ramos",
    "Anderson Dutra",
    "Deygles Matos",
    "Felipe Moraes",
    "Filipe Silva",
    "Gabriel Lagoa",
    "João Alves",
    "Kaique Teixeira",
    "Lucas Paiva",
    "Marrony Portugal",
    "Nalbert Pereira",
    "Rony Côrrea",
    "Wesley Conceição",
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