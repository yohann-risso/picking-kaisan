import { toast } from "../components/Toast.js";
import { state } from "../config.js";
import { atualizarInterface } from "../core/interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import {
  mostrarLoaderInline,
  esconderLoaderInline,
} from "../core/interface.js";
import { inserirProdutoNaRota } from "../utils/roteamento.js";

/**
 * ESVAZIAR CESTO
 * Envia requisição ao GAS para registrar o zeramento
 * e depois move o produto para o endereço secundário (se houver)
 * ou empurra para o fim da lista.
 */
export async function zerarEnderecoExterno(endereco) {
  const match = endereco.match(/A(\d+)-B(\d+)-R(\d+)/);
  if (!match) return toast("❌ Endereço inválido", "error");

  const operador = (window.operadorSelecionado || "DESCONHECIDO")
    .toLowerCase()
    .replace(/\s+/g, "");

  const time = new Date()
    .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .replace(",", "");

  const ws = `${match[1]}-${match[2]}-${match[3]}`;
  const loaderId = `loader-zerar-${endereco}`;
  const gasURL = window?.env?.GAS_ZERAR_URL;

  if (!gasURL) {
    toast("❌ URL de zeramento não configurada", "error");
    return;
  }

  const url =
    `${gasURL}` +
    `&WS=${ws}` +
    `&func=Update` +
    `&ENDERECO=${encodeURIComponent(endereco.trim())}` +
    `&SKU=VAZIO` +
    `&OPERADOR=${operador}` +
    `&TIME=${time}`;

  console.log(`🔗 Enviando para GAS: ${url}`);

  mostrarLoaderInline(loaderId);

  try {
    const res = await fetch(url);
    const txt = await res.text();

    if (!res.ok) throw new Error(txt);

    console.log("📩 GAS OK:", txt);
    toast(`🧹 Cesto ${endereco} esvaziado.`, "success");

    // comportamento local
    moverProdutoParaFimPorEndereco(endereco.trim());
  } catch (e) {
    console.warn("⚠️ Erro ao comunicar com GAS:", e.message);
    toast("⚠️ Erro no GAS — ação aplicada somente localmente.", "warning");

    moverProdutoParaFimPorEndereco(endereco.trim());
  } finally {
    esconderLoaderInline(loaderId);
  }
}

function extrairOrdemEndereco(endereco = "") {
  const [p] = endereco.split("•").map((e) => e.trim());
  const m = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(p);
  return m ? m.slice(1).map(Number) : [999, 999, 999, 999, 999];
}

/** Move produto ao segundo endereço ou fim da rota */
function moverProdutoParaFimPorEndereco(enderecoZerado) {
  const idx = state.produtos.findIndex(
    (p) =>
      p.endereco?.split("•")[0]?.trim().toUpperCase() ===
      enderecoZerado.toUpperCase()
  );

  if (idx === -1) return;

  const [produto] = state.produtos.splice(idx, 1);

  const [_, endereco2] = (produto.endereco || "").split("•");
  const novo = endereco2?.trim();

  if (novo && /A\d+-B\d+-R\d+-C\d+-N\d+/.test(novo)) {
    produto.endereco = novo;
    produto.ordemEndereco = extrairOrdemEndereco(novo);
    inserirProdutoNaRota(produto, state);
  } else {
    state.produtos.push(produto);
  }

  atualizarInterface();
  salvarProgressoLocal();

  setTimeout(async () => {
    try {
      produto.endereco = novo;
      produto.ordemEndereco = extrairOrdemEndereco(novo);

      console.log(
        `💾 Endereço atualizado no cache local: ${produto.sku} → ${novo}`
      );

      salvarProgressoLocal();
      atualizarInterface();

      await atualizarEnderecoCacheSupabase(produto.sku, novo);
    } catch (err) {
      console.error("❌ Erro ao atualizar cache:", err);
    }
  }, 5000);
}
