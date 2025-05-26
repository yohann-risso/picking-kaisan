import { carregarGrupos, carregarTodosRefs } from "./services/supabase.js";
import { restaurarCacheLocal } from "./utils/storage.js";
import { checarModoStandalone, atualizarQtdCards } from "./core/interface.js";
import { carregarOperadores, biparProduto } from "./core/picking.js";
import { finalizarPicking } from "./core/finalizar.js";
import { carregarProdutos } from "./services/supabase.js";
import { zerarEnderecoExterno } from "./services/googleSheet.js";
import { mostrarLoaderInline, esconderLoaderInline } from "./core/interface.js";

// ✅ Garante que DOM e assets estejam carregados
window.addEventListener("load", async () => {
  console.log("✅ window.onload: DOM e assets carregados");

  // Eventos de UI
  const btnIniciar = document.getElementById("btnIniciar");
  console.log("🔍 btnIniciar:", btnIniciar);

  btnIniciar?.addEventListener("click", () => {
    console.log("🖱️ Clique no botão 'Iniciar'");
    carregarProdutos();
  });

  document.getElementById("btnConfirmarSKU")?.addEventListener("click", () => {
    console.log("🖱️ Clique em Confirmar SKU");
    biparProduto();
  });

  document.getElementById("btnFinalizar")?.addEventListener("click", () => {
    console.log("🛑 Clique em Finalizar");
    finalizarPicking();
  });

  document.getElementById("skuInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      console.log("⌨️ Enter pressionado no SKU");
      biparProduto();
    }
  });

  document.getElementById("qtdCards")?.addEventListener("input", () => {
    console.log("🎚️ Alterou quantidade de cards");
    atualizarQtdCards();
  });

  // 🔐 Variáveis de ambiente com fallback local
  try {
    const res = await fetch("/api/env");
    if (!res.ok) throw new Error("API /api/env falhou");
    window.env = await res.json();
    console.log("🔐 Variáveis carregadas do /api/env:", window.env);
  } catch (err) {
    console.warn(
      "⚠️ Falha ao acessar /api/env, usando import.meta.env como fallback."
    );
    window.env = {
      SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      GAS_ZERAR_URL: import.meta.env.VITE_GAS_ZERAR_URL,
    };
  }

  // 🔄 Inicialização do app
  try {
    carregarOperadores();
    await carregarGrupos();
    await carregarTodosRefs();
    restaurarCacheLocal();
    checarModoStandalone();
  } catch (e) {
    console.error("❌ Erro ao carregar aplicação:", e);
  }

  console.log("Main carregado ✅");
});

// 🌍 Exporta para o console global (debug/teste)
window.carregarProdutos = carregarProdutos;
window.biparProduto = biparProduto;
window.finalizarPicking = finalizarPicking;
window.atualizarQtdCards = atualizarQtdCards;
window.carregarGrupos = carregarGrupos;
window.carregarTodosRefs = carregarTodosRefs;
window.restaurarCacheLocal = restaurarCacheLocal;
window.checarModoStandalone = checarModoStandalone;
window.zerarEnderecoExterno = zerarEnderecoExterno;
window.mostrarLoaderInline = mostrarLoaderInline;
window.esconderLoaderInline = esconderLoaderInline;

console.log("Exportando funções para o console global ✅");
console.log("🌟 Bem-vindo ao sistema de Picking! Carregando...");
