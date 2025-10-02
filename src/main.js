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
import {
  iniciarPollingProdutos,
  verificarMudancaProdutos,
} from "./utils/polling.js";
import { atualizarInterface } from "./core/interface.js";
import { state } from "./config.js";

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
aguardarElemento("btnBipar", (btn) => {
  btn.addEventListener("click", biparProduto);
});

aguardarElemento("filtroBloco", (select) => {
  select.addEventListener("change", () => atualizarInterface());
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

function atualizarFiltroBlocos() {
  const select = document.getElementById("filtroBloco");
  if (!select) return;

  const blocos = new Set();
  state.produtos.forEach((p) => {
    const endPrimario = (p.endereco || "").split("•")[0];
    const match = /B(\d+)/i.exec(endPrimario);
    if (match) {
      blocos.add(parseInt(match[1], 10));
    } else {
      blocos.add("SEM LOCAL");
    }
  });

  const options = [`<option value="">Todos</option>`];
  if (blocos.has("SEM LOCAL")) {
    options.push(`<option value="SEM LOCAL">Sem Local</option>`);
  }
  [...blocos]
    .filter((b) => b !== "SEM LOCAL")
    .sort((a, b) => a - b)
    .forEach((b) => {
      options.push(`<option value="${b}">Bloco ${b}</option>`);
    });

  select.innerHTML = options.join("");
}

Object.assign(window, {
  atualizarFiltroBlocos,
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
    const grupos = await carregarGrupos();

    aguardarElemento("grupoModal", (el) => {
      el.innerHTML = grupos
        .map((g) => `<option value="${g}">${g}</option>`)
        .join("");
    });

    carregarOperadores();
  } catch (e) {
    console.error("❌ Erro ao carregar aplicação:", e);
  }

  setTimeout(() => {
    document.getElementById("loaderGlobal").style.display = "none";
    document.getElementById("overlayCaixa").style.display = "none";
  }, 3000);

  new bootstrap.Modal(document.getElementById("modalInicio")).show();
}

function simularBipagem(sku) {
  const input = document.getElementById("skuInput");
  const btn = document.getElementById("btnBipar");

  if (input && btn) {
    input.value = sku;

    // 🔔 Feedback visual: borda verde rápida
    input.classList.add("border", "border-success", "fw-bold");
    setTimeout(() => {
      input.classList.remove("border-success", "fw-bold");
    }, 800);

    // Foco para reforçar a ação
    input.focus();

    // Dispara bipagem
    btn.click();
  } else {
    console.warn("❌ Elemento de bipagem não encontrado.");
  }
}

window.simularBipagem = simularBipagem;
// Torna acessível globalmente

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

    gerarPlaquinhas(grupo);
  });
});

// 🔁 Loader on load
window.addEventListener("load", () => {
  console.log("💡 Entrou no window.load");
  inicializarApp();

  // 🛰️ Verifica imediatamente se há mudanças
  verificarMudancaProdutos();

  // ⏱️ Inicia monitoramento automático (a cada 60s)
  iniciarPollingProdutos(60);
});

aguardarElemento("btnLimparCache", (btn) => {
  let pressTimer = null;

  const tempoPressionar = 1200; // 1.2 segundos

  const iniciarPress = () => {
    btn.classList.add("long-pressing"); // feedback visual
    pressTimer = setTimeout(async () => {
      btn.classList.remove("long-pressing");

      const confirmar = confirm(
        "🧹 Deseja realmente limpar o cache da aplicação?"
      );
      if (!confirmar) return;

      localStorage.clear();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }

      mostrarToast("🧹 Cache limpo. Recarregando...", "success");
      setTimeout(() => window.location.reload(), 1000);
    }, tempoPressionar);
  };

  const cancelarPress = () => {
    btn.classList.remove("long-pressing");
    clearTimeout(pressTimer);
  };

  // Compatível com mouse e toque
  btn.addEventListener("mousedown", iniciarPress);
  btn.addEventListener("touchstart", iniciarPress);

  btn.addEventListener("mouseup", cancelarPress);
  btn.addEventListener("mouseleave", cancelarPress);
  btn.addEventListener("touchend", cancelarPress);
});

// 🛠️ Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => {
        console.log("🛠️ SW registrado:", reg.scope);
        // força atualização quando houver nova versão
        reg.onupdatefound = () => {
          const newWorker = reg.installing;
          newWorker.onstatechange = () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              console.log("🔁 Nova versão detectada. Atualizando...");
              window.location.reload();
            }
          };
        };
      })
      .catch((err) => console.error("❌ SW erro:", err));
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    console.log("♻️ controllerchange → reload");
    window.location.reload();
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
  atualizarFiltroBlocos,
  lockInterface: () => {
    document.getElementById("loaderGlobal").style.display = "flex";
    document.getElementById("overlayCaixa").style.display = "block";
  },
  destravarInterface: () => {
    document.getElementById("loaderGlobal").style.display = "none";
    document.getElementById("overlayCaixa").style.display = "none";
  },
});

window.addEventListener("load", () => {
  iniciarPollingProdutos(60); // a cada 60 segundos
});

function gerarPlaquinhas(grupo) {
  const url = `/plaquinhas.html?grupo=${grupo}`;
  window.open(url, "_blank");
}
