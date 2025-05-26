import { toast } from "../components/Toast.js";
import { calcularTempoIdeal } from "../utils/format.js";
import { state } from "../config.js";
import { atualizarInterface } from "../core/interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { mostrarLoaderInline, esconderLoaderInline } from "../core/interface.js";

export async function zerarEnderecoExterno(endereco) {
  const match = endereco.match(/A(\d+)-B(\d+)-R(\d+)/);
  if (!match) return toast("❌ Endereço inválido", "error");

  const operador = encodeURIComponent(
    document.getElementById("operador").value
  );
  const time = encodeURIComponent(new Date().toLocaleString());
  const ws = `${match[1]}-${match[2]}-${match[3]}`;
  const loaderId = `loader-zerar-${endereco}`;

  const gasURL = window?.env?.GAS_ZERAR_URL;
  if (!gasURL) {
    toast("❌ URL de zeramento não configurada", "error");
    return;
  }

  const url =
    `${window.env.GAS_ZERAR_URL}&` +
    `WS=${encodeURIComponent(ws)}` +
    `&func=Update` +
    `&ENDERECO=${encodeURIComponent(endereco)}` +
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
    moverProdutoParaFimPorEndereco(endereco);
  } catch (e) {
    toast("❌ Falha ao marcar zeramento.", "error");
  } finally {
    esconderLoaderInline(loaderId);
  }
}

function moverProdutoParaFimPorEndereco(enderecoZerado) {
  const idx = state.produtos.findIndex((p) => {
    const enderecoPrimario = p.endereco?.split("•")[0]?.trim();
    return enderecoPrimario === enderecoZerado;
  });

  if (idx === -1) {
    console.warn("⚠️ Produto com endereço não encontrado:", enderecoZerado);
    return;
  }

  const [produto] = state.produtos.splice(idx, 1);

  // ✅ Atualiza endereço para o secundário
  const [_, novoEndereco] = (produto.endereco || "").split("•");
  const novo = novoEndereco?.trim();

  if (!novo || !/A\d+-B\d+-R\d+-C\d+-N\d+/.test(novo)) {
    console.warn("⚠️ Endereço secundário inválido:", novo);
    state.produtos.push(produto);
    atualizarInterface();
    salvarProgressoLocal();
    return;
  }

  produto.endereco = novo;

  const novaOrdem = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/
    .exec(novo)
    ?.slice(1)
    .map(Number) || [999, 999, 999, 999, 999];

  produto.ordemEndereco = novaOrdem;

  // ✅ Posição atual do operador (primeiro produto visível ou primeiro retirado)
  const referencia =
    state.produtos[0]?.ordemEndereco ??
    state.retirados[0]?.ordemEndereco ??
    [0, 0, 0, 0, 0];

  // ✅ Decide onde recolocar
  const novoVemDepois = novaOrdem.some((n, i) => n > referencia[i]);

  if (novoVemDepois) {
    // Inserir na ordem correta
    state.produtos.push(produto);
    state.produtos.sort((a, b) => {
      for (let i = 0; i < a.ordemEndereco.length; i++) {
        if (a.ordemEndereco[i] !== b.ordemEndereco[i]) {
          return a.ordemEndereco[i] - b.ordemEndereco[i];
        }
      }
      return 0;
    });
  } else {
    // Coloca no fim
    state.produtos.push(produto);
  }

  console.log(`🔁 Produto ${produto.sku} reposicionado após zeramento.`);

  atualizarInterface();
  salvarProgressoLocal();
  calcularTempoIdeal();
}

