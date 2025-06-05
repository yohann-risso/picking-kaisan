import {
  carregarGrupos,
  carregarRefsPorGrupo,
  carregarProdutos,
  desfazerRetirada,
  supabase,
} from "./services/supabase.js";
import { restaurarCacheLocal } from "./utils/storage.js";
import {
  checarModoStandalone,
  atualizarQtdCards,
  mostrarLoaderInline,
  esconderLoaderInline,
} from "./core/interface.js";
import { carregarOperadores, biparProduto } from "./core/picking.js";
import { finalizarPicking } from "./core/finalizar.js";
import { zerarEnderecoExterno } from "./services/googleSheet.js";

// 🔧 Aguarda um elemento existir no DOM
function aguardarElemento(id, callback) {
  const el = document.getElementById(id);
  if (el) return callback(el);

  const observer = new MutationObserver(() => {
    const elNow = document.getElementById(id);
    if (elNow) {
      observer.disconnect();
      callback(elNow);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ✅ Eventos
aguardarElemento("btnConfirmarSKU", (btn) => {
  btn.addEventListener("click", biparProduto);
});

aguardarElemento("btnFinalizar", (btn) => {
  btn.addEventListener("click", finalizarPicking);
});

aguardarElemento("skuInput", (input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") biparProduto();
  });
});

aguardarElemento("qtdCards", (input) => {
  input.addEventListener("input", atualizarQtdCards);
});

// 🚀 Inicializa modal e dados
async function inicializarApp() {
  console.log("🧪 main.js version: FINAL");

  let env = {};
  try {
    const res = await fetch("/api/env");
    env = res.ok ? await res.json() : {};
    console.log("🔐 Variáveis carregadas:", env);
  } catch (err) {
    console.warn("⚠️ Falha ao acessar /api/env.");
  }

  window.env = env;

  try {
    carregarOperadores();
    await carregarGrupos();

    const grupos = await supabase
      .from("produtos")
      .select("grupo", { distinct: true });

    if (grupos.error) {
      console.error("❌ Erro ao carregar grupos:", grupos.error);
    } else {
      const lista = [
        ...new Set(
          grupos.data.map((d) => parseInt(d.grupo)).filter((g) => !isNaN(g))
        ),
      ].sort((a, b) => a - b);

      aguardarElemento("grupoModal", (el) => {
        el.innerHTML = lista
          .map((g) => `<option value="${g}">${g}</option>`)
          .join("");
      });
    }

  } catch (e) {
    console.error("❌ Erro ao carregar aplicação:", e);
  }

  setTimeout(() => {
    document.getElementById("loaderGlobal").style.display = "none";
    document.getElementById("overlayCaixa").style.display = "none";
  }, 3000);

  new bootstrap.Modal(document.getElementById("modalInicio")).show();
}

// 🎯 Confirmação no modal
aguardarElemento("btnConfirmarInicio", (btn) => {
  btn.addEventListener("click", async () => {
    const grupo = document.getElementById("grupoModal").value;
    const operador = document.getElementById("operadorModal").value;

    if (!grupo || !operador) {
      toast("Selecione grupo e operador", "warning");
      return;
    }

    document.getElementById("grupoAtivo").textContent = `Grupo ${grupo}`;
    document.getElementById("nomeOperador").textContent = operador;

    window.grupoSelecionado = grupo;
    window.operadorSelecionado = operador;

    bootstrap.Modal.getInstance(document.getElementById("modalInicio")).hide();

    await carregarRefsPorGrupo(grupo);
    await carregarProdutos();
  });
});

// 🔁 Loader on load
window.addEventListener("load", () => {
  console.log("💡 Entrou no window.load");
  inicializarApp();
});

// 🛠️ Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => console.log("🛠️ SW registrado:", reg.scope))
      .catch((err) => console.error("❌ SW erro:", err));
  });
}

// 🌍 Exportações globais para debug
Object.assign(window, {
  carregarProdutos,
  biparProduto,
  finalizarPicking,
  atualizarQtdCards,
  carregarGrupos,
  carregarRefsPorGrupo,
  restaurarCacheLocal,
  checarModoStandalone,
  zerarEnderecoExterno,
  mostrarLoaderInline,
  esconderLoaderInline,
  carregarOperadores,
  aguardarElemento,
  desfazerRetirada,
  lockInterface: () => {
    document.getElementById("loaderGlobal").style.display = "flex";
    document.getElementById("overlayCaixa").style.display = "block";
  },
  destravarInterface: () => {
    document.getElementById("loaderGlobal").style.display = "none";
    document.getElementById("overlayCaixa").style.display = "none";
  },
});
