import { getHeaders } from "../config.js";
import {
  carregarProdutos,
  carregarRefsPorGrupo,
} from "../services/supabase.js";
import { toast } from "../components/Toast.js";

// 🔐 Estado global de hash
window.hashAtualProdutos = undefined;

// 🔧 Gera hash numérico baseado nos campos relevantes
export function gerarHashProduto(produtos = []) {
  const dadosSimplificados = produtos.map((p) => ({
    sku: p.sku,
    endereco: p.endereco,
    qtd: p.qtd,
  }));

  const json = JSON.stringify(dadosSimplificados);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) - hash + json.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// 🔁 Verifica se houve mudança no Supabase
export async function verificarMudancaProdutos() {
  const grupo = window.grupoSelecionado;
  const statusEl = document.getElementById("pollingStatus");

  // 🌐 Detectar offline
  if (!navigator.onLine) {
    if (statusEl) statusEl.textContent = "📴";
    console.warn("📴 Dispositivo offline, polling pausado.");
    return;
  }

  if (!grupo) return;

  const headers = getHeaders();
  if (statusEl) statusEl.textContent = "🔁";

  try {
    const res = await fetch(
      `/api/proxy?endpoint=/rest/v1/produtos?grupo=eq.${grupo}&select=sku,endereco,qtd`,
      { headers }
    );

    if (!res.ok) {
      console.warn("❌ Falha ao verificar atualização de produtos.");
      if (statusEl) statusEl.textContent = "❌";
      return;
    }

    const dados = await res.json();
    const novoHash = gerarHashProduto(dados);

    if (window.hashAtualProdutos === undefined) {
      window.hashAtualProdutos = novoHash;
      if (statusEl) statusEl.textContent = "🛰️";
      return;
    }

    if (novoHash !== window.hashAtualProdutos) {
      console.log("🔁 Mudança detectada no Supabase. Recarregando...");
      toast("🔄 Atualização automática de dados detectada", "info");

      window.hashAtualProdutos = novoHash;
      await carregarRefsPorGrupo(grupo);
      await carregarProdutos();

      if (statusEl) statusEl.textContent = "✅";
    } else {
      console.log("✅ Dados do grupo permanecem inalterados.");
      if (statusEl) statusEl.textContent = "🛰️";
    }
  } catch (e) {
    console.error("❌ Erro ao verificar mudança de produtos:", e);
    if (statusEl) statusEl.textContent = "❌";
  }
}

// 🕒 Inicia verificação automática a cada X segundos
export function iniciarPollingProdutos(intervaloSegundos = 60) {
  setInterval(() => {
    // 👁️ Só roda se a aba estiver visível
    if (document.visibilityState !== "visible") return;

    // ✋ Evita sincronizar se o operador estiver digitando
    const input = document.getElementById("skuInput");
    if (input && (document.activeElement === input || input.disabled)) {
      console.log("⏸️ Polling pausado: operador está bipando.");
      return;
    }

    verificarMudancaProdutos();
  }, intervaloSegundos * 1000);
}
