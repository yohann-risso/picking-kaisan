import { toast } from "../components/Toast.js";
import { state } from "../config.js";
import { atualizarInterface } from "../core/interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { inserirProdutoNaRota } from "../utils/roteamento.js";

/**
 * Ao clicar no ❌ do card, o endereço principal é desativado localmente
 * e o produto passa a assumir o endereço secundário (se existir).
 * A chamada remota ao GAS foi desativada.
 */
export async function zerarEnderecoExterno(endereco) {
  const match = endereco.match(/A(\d+)-B(\d+)-R(\d+)/);
  if (!match) return toast("❌ Endereço inválido", "error");

  const loaderId = `loader-zerar-${endereco}`;
  console.log(`⚙️ Zerando endereço localmente: ${endereco}`);

  // 🔸 pula direto para o comportamento local, sem enviar ao GAS
  moverProdutoParaFimPorEndereco(endereco.trim());

  // feedback visual
  toast(
    `🔁 Endereço ${endereco} movido para o endereço secundário (local).`,
    "info"
  );
}

/** Extrai a ordem de um endereço (A,B,R,C,N) */
function extrairOrdemEndereco(endereco = "") {
  const [endPrimario = ""] = endereco.split("•").map((e) => e.trim());
  const match = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(endPrimario);
  return match ? match.slice(1).map(Number) : [999, 999, 999, 999, 999];
}

/** Move o produto para o segundo endereço após o zeramento */
function moverProdutoParaFimPorEndereco(enderecoZerado) {
  const idx = state.produtos.findIndex((p) => {
    const enderecoPrimario = p.endereco?.split("•")[0]?.trim().toUpperCase();
    return enderecoPrimario === enderecoZerado.trim().toUpperCase();
  });

  if (idx === -1) {
    console.warn("Produto com endereço não encontrado:", enderecoZerado);
    return;
  }

  const [produto] = state.produtos.splice(idx, 1);

  // Atualiza para o segundo endereço (se existir)
  const [_, novoEndereco] = (produto.endereco || "").split("•");
  const novo = novoEndereco?.trim();

  if (!novo || !/A\d+-B\d+-R\d+-C\d+-N\d+/.test(novo)) {
    console.warn("Endereço secundário inválido:", novo);

    // ⚠️ Garante que não duplica
    const jaExiste = state.produtos.some(
      (p) => p.sku === produto.sku && p.romaneio === produto.romaneio
    );

    if (!jaExiste) {
      state.produtos.push(produto);
    }

    atualizarInterface();
    salvarProgressoLocal();
    return;
  }

  // Atualiza o produto com o novo endereço
  produto.endereco = novo;
  produto.ordemEndereco = extrairOrdemEndereco(novo);

  // ⚠️ Garante que não duplica
  const jaExiste = state.produtos.some(
    (p) => p.sku === produto.sku && p.romaneio === produto.romaneio
  );

  if (!jaExiste) {
    inserirProdutoNaRota(produto, state);
  }

  console.log(`🔁 Produto ${produto.sku} movido para o endereço secundário.`);
  atualizarInterface();
  salvarProgressoLocal();
}
