import {
  carregarGrupos,
  carregarRefsPorGrupo,
  carregarProdutos,
  desfazerRetirada,
  supabase,
} from "./services/supabase.js";
import { restaurarCacheLocal } from "./utils/storage.js";
import { checarModoStandalone, atualizarQtdCards } from "./core/interface.js";
import { carregarOperadores, biparProduto } from "./core/picking.js";
import { finalizarPicking } from "./core/finalizar.js";
import { zerarEnderecoExterno } from "./services/googleSheet.js";
import { mostrarLoaderInline, esconderLoaderInline } from "./core/interface.js";

// 🛠️ Aguarda elemento com fallback para quando ele for adicionado ao DOM depois
function aguardarElemento(id, callback) {
  const el = document.getElementById(id);
  if (el) {
    console.log(`✅ Elemento #${id} encontrado imediatamente`);
    return callback(el);
  }

  const observer = new MutationObserver(() => {
    const elNow = document.getElementById(id);
    if (elNow) {
      console.log(`✅ Elemento #${id} encontrado por MutationObserver`);
      observer.disconnect();
      callback(elNow);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ✅ Conecta eventos de forma segura
aguardarElemento("btnIniciar", (btn) => {
  console.log("✅ Ligando evento: Iniciar");

  btn.addEventListener("click", async () => {
    try {
      console.log("🖱️ Clique no botão 'Iniciar'");
      const grupo = document.getElementById("grupo")?.value;
      if (!grupo) return toast("Selecione um grupo", "warning");

      await carregarRefsPorGrupo(grupo); // ✅ Carrega imagens e coleção
      await carregarProdutos(); // ✅ Usa o mapa já carregado
    } catch (err) {
      console.error("❌ Erro ao executar fluxo de iniciar:", err);
    }
  });
});

aguardarElemento("btnConfirmarSKU", (btn) => {
  btn.addEventListener("click", () => {
    console.log("🖱️ Clique em Confirmar SKU");
    biparProduto();
  });
});

aguardarElemento("btnFinalizar", (btn) => {
  btn.addEventListener("click", () => {
    console.log("🛑 Clique em Finalizar");
    finalizarPicking();
  });
});

aguardarElemento("skuInput", (input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      console.log("⌨️ Enter pressionado no SKU");
      biparProduto();
    }
  });
});

aguardarElemento("qtdCards", (input) => {
  input.addEventListener("input", () => {
    console.log("🎚️ Alterou quantidade de cards");
    atualizarQtdCards();
  });
});

// 🔄 Inicialização da aplicação
window.addEventListener("load", async () => {
  console.log("💡 Checkpoint 1: Início do main.js");
  console.log("💡 Checkpoint 2: Entrou no window.load");
  console.log("🧪 main.js version: FINAL");
  console.log("✅ DOMContentLoaded: DOM e assets carregados");

  let env = {};
  try {
    const res = await fetch("/api/env");
    if (!res.ok) throw new Error("API /api/env falhou");
    env = await res.json();
    console.log("🔐 Variáveis carregadas do /api/env:", env);
  } catch (err) {
    console.warn("⚠️ Falha ao acessar /api/env.");
    env = {
      SUPABASE_URL: "",
      SUPABASE_KEY: "",
      GAS_ZERAR_URL: "",
    };
  }

  window.env = env;

  try {
    carregarOperadores();
    await carregarGrupos();

    // Preenche selects do modal
    document.getElementById("grupoModal").innerHTML =
      document.getElementById("grupo").innerHTML;
    document.getElementById("operadorModal").innerHTML =
      document.getElementById("operador").innerHTML;
  } catch (e) {
    console.error("❌ Erro ao carregar aplicação:", e);
  }

  // 🛡️ Evitar overlays presos
  setTimeout(() => {
    document.getElementById("loaderGlobal").style.display = "none";
    document.getElementById("overlayCaixa").style.display = "none";
  }, 3000);

  // ✅ Mostrar modal inicial
  const modal = new bootstrap.Modal(document.getElementById("modalInicio"));
  modal.show();
});

// 🌍 Exporta globalmente
window.carregarProdutos = carregarProdutos;
window.biparProduto = biparProduto;
window.finalizarPicking = finalizarPicking;
window.atualizarQtdCards = atualizarQtdCards;
window.carregarGrupos = carregarGrupos;
window.carregarRefsPorGrupo = carregarRefsPorGrupo;
window.restaurarCacheLocal = restaurarCacheLocal;
window.checarModoStandalone = checarModoStandalone;
window.zerarEnderecoExterno = zerarEnderecoExterno;
window.mostrarLoaderInline = mostrarLoaderInline;
window.esconderLoaderInline = esconderLoaderInline;
window.carregarOperadores = carregarOperadores;
window.aguardarElemento = aguardarElemento;
window.desfazerRetirada = desfazerRetirada;
// 🔒 Bloqueia a interface até que tudo esteja pronto
window.lockInterface = () => {
  document.getElementById("loaderGlobal").style.display = "flex";
  document.getElementById("overlayCaixa").style.display = "block";
  console.log("🔒 Interface bloqueada");
};

// 🔓 Atalho manual
window.destravarInterface = () => {
  document.getElementById("loaderGlobal").style.display = "none";
  document.getElementById("overlayCaixa").style.display = "none";
  console.log("✅ Interface destravada manualmente");
};

console.log("Exportando funções para o console global ✅");
console.log("🌟 Bem-vindo ao sistema de Picking! Carregando...");

// 📲 Registro do Service Worker para PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log(
          "🛠️ Service Worker registrado com sucesso:",
          registration.scope
        );
      })
      .catch((error) => {
        console.error("❌ Falha ao registrar Service Worker:", error);
      });
  });
}

document
  .getElementById("btnConfirmarInicio")
  .addEventListener("click", async () => {
    const grupo = document.getElementById("grupoModal").value;
    const operador = document.getElementById("operadorModal").value;

    if (!grupo || !operador) {
      toast("Selecione grupo e operador", "warning");
      return;
    }

    // Define no DOM
    document.getElementById("grupoAtivo").textContent = `Grupo ${grupo}`;
    document.getElementById("nomeOperador").textContent = operador;

    // Guarda estado ativo
    window.grupoSelecionado = grupo;
    window.operadorSelecionado = operador;

    // Oculta o modal
    const modal = bootstrap.Modal.getInstance(
      document.getElementById("modalInicio")
    );
    modal.hide();

    // Carrega dados
    await carregarRefsPorGrupo(grupo);
    await carregarProdutos();
  });
