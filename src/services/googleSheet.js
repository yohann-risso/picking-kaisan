import { toast } from "../components/Toast.js";
import { calcularTempoIdeal } from "../utils/format.js";
import { state } from "../config.js";
import { atualizarInterface } from "../core/interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";

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

  const url = `${gasURL}WS=${encodeURIComponent(
    ws
  )}&func=Update&ENDERECO=${encodeURIComponent(
    endereco
  )}&SKU=VAZIO&OPERADOR=${operador}&TIME=${time}`;

  mostrarLoaderInline(loaderId);
  try {
    const res = await fetch(url);
    const txt = await res.text();
    if (!res.ok) throw new Error(txt);
    toast(`✅ Endereço ${endereco} marcado para zeramento.`, "success");
  } catch (e) {
    toast("❌ Falha ao marcar zeramento.", "error");
  } finally {
    esconderLoaderInline(loaderId);
    calcularTempoIdeal(); // depende do seu fluxo
  }
}

export function moverProdutoParaFimPorEndereco(endereco) {
  const idx = state.produtos.findIndex((p) => {
    const enderecoPrimario = p.endereco?.split("•")[0]?.trim();
    return enderecoPrimario === endereco;
  });

  if (idx !== -1) {
    const [produto] = state.produtos.splice(idx, 1);
    state.produtos.push(produto);
    console.log(`🔄 SKU ${produto.sku} movido para o fim.`);
    atualizarInterface();
    salvarProgressoLocal();
    calcularTempoIdeal();
  } else {
    console.warn("⚠️ Produto com endereço não encontrado:", endereco);
  }
}
