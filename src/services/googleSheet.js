import { toast } from "../components/Toast.js";
import { calcularTempoIdeal } from "../utils/format.js";
import { state } from "../config.js";
import { atualizarInterface } from "../core/interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import {
  mostrarLoaderInline,
  esconderLoaderInline,
} from "../core/interface.js";

export async function zerarEnderecoExterno(endereco) {
  const match = endereco.match(/A(\d+)-B(\d+)-R(\d+)/);
  if (!match) return toast("❌ Endereço inválido", "error");

  const operador = (window.operadorSelecionado || "DESCONHECIDO")
    .toLowerCase()
    .replace(/\s+/g, "");

  const time = new Date()
    .toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    })
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

  console.log(`🔗 URL de zeramento: ${url}`);

  mostrarLoaderInline(loaderId);
  try {
    const res = await fetch(url);
    const txt = await res.text();
    if (!res.ok) throw new Error(txt);

    console.log("📤 Zeramento enviado:", url);
    console.log("📩 Resposta:", txt);
    toast(`✅ Endereço ${endereco} marcado para zeramento.`, "success");
    moverProdutoParaFimPorEndereco(endereco.trim());
  } catch (e) {
    toast("❌ Falha ao marcar zeramento.", "error");
  } finally {
    esconderLoaderInline(loaderId);
  }
}

function extrairOrdemEndereco(endereco = "") {
  const [endPrimario = ""] = endereco.split("•").map((e) => e.trim());
  const match = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(endPrimario);
  return match ? match.slice(1).map(Number) : [999, 999, 999, 999, 999];
}

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

  // ✅ Atualiza endereço para o secundário
  const [_, novoEndereco] = (produto.endereco || "").split("•");
  const novo = novoEndereco?.trim();

  if (!novo || !/A\d+-B\d+-R\d+-C\d+-N\d+/.test(novo)) {
    console.warn("Endereço secundário inválido:", novo);
    state.produtos.push(produto);
    atualizarInterface();
    salvarProgressoLocal();
    return;
  }

  produto.endereco = novo;
  produto.ordemEndereco = extrairOrdemEndereco(novo);

  // 🔄 Ponto de referência = última retirada (ou início)
  const referencia = state.retirados.at(-1)?.ordemEndereco ?? [0, 0, 0, 0, 0];

  function compararOrdem(a, b) {
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  const novoVemDepois = compararOrdem(produto.ordemEndereco, referencia) < 0;

  if (novoVemDepois) {
    // ❌ Novo endereço já ficou para trás → final da lista
    state.produtos.push(produto);
  } else {
    // ✅ Novo endereço ainda está à frente → inserir no ponto correto
    let inserido = false;
    for (let i = 0; i < state.produtos.length; i++) {
      const comp = compararOrdem(
        produto.ordemEndereco,
        state.produtos[i].ordemEndereco
      );
      if (comp < 0) {
        state.produtos.splice(i, 0, produto);
        inserido = true;
        break;
      }
    }
    if (!inserido) {
      state.produtos.push(produto);
    }
  }

  console.log(`🔁 Produto ${produto.sku} reposicionado após zeramento.`);
  atualizarInterface();
  salvarProgressoLocal();
}
