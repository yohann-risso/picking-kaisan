import {
  carregarGrupos,
  carregarRefsPorGrupo,
  carregarProdutos,
  desfazerRetirada,
  supabase,
} from "./services/supabase.js";
import { restaurarCacheLocal, salvarProgressoLocal } from "./utils/storage.js";
import {
  checarModoStandalone,
  atualizarQtdCards,
  mostrarLoaderInline,
  esconderLoaderInline,
  mostrarToast,
  atualizarInterface,
} from "./core/interface.js";
import {
  carregarOperadores,
  biparProduto,
  pularProduto,
} from "./core/picking.js";
import { finalizarPicking } from "./core/finalizar.js";
import { zerarEnderecoExterno } from "./services/googleSheet.js";
import {
  iniciarPollingProdutos,
  verificarMudancaProdutos,
} from "./utils/polling.js";
import { state } from "./config.js";
import {
  setQueueSender,
  startQueueProcessor,
  getQueueStats,
} from "./utils/queue.js";
import { sendQueueEventToSupabase } from "./utils/queueSender.js";
import { setupQueuePanel } from "./core/queuePanel.js";

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

document.getElementById("loaderGlobal").style.display = "flex";

// ✅ Eventos
aguardarElemento("btnBipar", (btn) => {
  btn.addEventListener("click", biparProduto);
});

aguardarElemento("filtroArmazem", (select) => {
  select.addEventListener("change", (e) => {
    window.filtroArmazemSelecionado = e.target.value;

    const bloco = document.getElementById("filtroBloco");
    if (bloco) bloco.value = "";

    atualizarInterface();
    atualizarBadgeFiltros();
  });
});

aguardarElemento("filtroBloco", (select) => {
  select.addEventListener("change", () => atualizarInterface());
  atualizarBadgeFiltros();
});

aguardarElemento("btnLimparFiltros", (btn) => {
  btn.addEventListener("click", () => {
    const armazem = document.getElementById("filtroArmazem");
    const bloco = document.getElementById("filtroBloco");

    if (armazem) armazem.value = "";
    if (bloco) bloco.value = "";

    window.filtroArmazemSelecionado = "";
    atualizarInterface();
    atualizarBadgeFiltros();
  });
});

aguardarElemento("btnFinalizar", (btn) => {
  btn.addEventListener("click", finalizarPicking);
});

aguardarElemento("skuInput", (input) => {
  const filtros = document.getElementById("filtrosWrap");
  if (filtros?.classList.contains("show")) {
    bootstrap.Collapse.getOrCreateInstance(filtros).hide();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") biparProduto();
  });
});

aguardarElemento("qtdCards", (input) => {
  input.addEventListener("input", atualizarQtdCards);
});

aguardarElemento("btnAtualizarEnderecos", (btn) => {
  btn.addEventListener("click", async () => {
    // usa os produtos atuais do estado
    const pendentes =
      state.produtos?.filter((p) => {
        const dist = p.distribuicaoAtual || {};
        const total =
          (dist.A || 0) + (dist.B || 0) + (dist.C || 0) + (dist.D || 0);
        return total > 0;
      }) || [];

    if (pendentes.length === 0) {
      mostrarToast("⚠️ Nenhum produto pendente para atualizar.", "warning");
      return;
    }

    mostrarToast("🔄 Atualizando endereços dos produtos pendentes...", "info");

    try {
      // 1️⃣ Coloca loader visual em todos
      pendentes.forEach((p) => {
        const skuNorm = p.sku?.trim().toUpperCase();
        if (skuNorm) window.setLoaderOnEndereco?.(p.pedido, skuNorm);
      });

      // 2️⃣ Busca endereços via GAS
      const promises = pendentes.map(async (p) => {
        const skuNorm = p.sku?.trim().toUpperCase();
        if (!skuNorm) return;
        const novoEndereco = await buscarEnderecosPorSku(skuNorm);
        p.endereco = novoEndereco;
        window.setEnderecoFinal?.(p.pedido, skuNorm, novoEndereco);
      });

      await Promise.all(promises);

      // 3️⃣ Atualiza cache e re-renderiza interface
      const rom = window.romaneio || "romaneio-desconhecido";
      localStorage.setItem(`pendentes-${rom}`, JSON.stringify(pendentes));

      atualizarInterface();
      salvarProgressoLocal();

      mostrarToast("✅ Endereços atualizados com sucesso!", "success");
    } catch (err) {
      console.error("Erro ao atualizar endereços:", err);
      mostrarToast("❌ Erro ao atualizar endereços.", "error");
    }
  });
});

async function buscarEnderecosPorSku(sku) {
  const url = `https://script.google.com/macros/s/AKfycbzEYYSWfRKYGxAkNFBBV9C6qlMDXlDkEQIBNwKOtcvGEdbl4nfaHD5usa89ZoV2gMcEgA/exec?sku=${encodeURIComponent(
    sku
  )}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Erro HTTP ${resp.status}`);
    return await resp.text();
  } catch (err) {
    console.error("❌ Erro no GAS:", err);
    return "SEM LOCAL";
  }
}

// 🔁 Função auxiliar (mesma usada em roteamento.js)
function compararOrdem(a = [], b = []) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

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

  // ✅ Queue (offline-first)
  setQueueSender(sendQueueEventToSupabase);
  startQueueProcessor({ intervalMs: 2000 });

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

  aguardarElemento("tipoPicking", (el) => {
    el.addEventListener("change", atualizarModalInicioPorTipo);
    atualizarModalInicioPorTipo(); // estado inicial
  });
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

  setupQueuePanel();
}

window.simularBipagem = simularBipagem;
// Torna acessível globalmente

// 🎯 Confirmação no modal// 🎯 Confirmação no modal
aguardarElemento("btnConfirmarInicio", (btn) => {
  btn.addEventListener("click", async () => {
    const tipo = document.getElementById("tipoPicking")?.value || "GRUPO";
    const operador = document.getElementById("operadorModal")?.value;

    const grupo = document.getElementById("grupoModal")?.value;
    const chave = document.getElementById("chaveAvulsa")?.value?.trim();
    const nl = !!document.getElementById("chkNl")?.checked;

    if (!operador) {
      mostrarToast("Selecione o operador", "warning");
      return;
    }

    if (tipo === "GRUPO") {
      if (!grupo) {
        mostrarToast("Selecione o grupo", "warning");
        return;
      }
    } else {
      if (!chave) {
        mostrarToast("Informe Romaneio ou Pedido", "warning");
        return;
      }
    }

    document.getElementById("loaderGlobal").style.display = "flex";

    // 📌 Contexto único do picking (novo)
    window.pickingContexto = {
      tipo, // "GRUPO" | "AVULSO"
      grupo: tipo === "GRUPO" ? grupo : null,
      chave: tipo === "AVULSO" ? chave : null, // romaneio/pedido informado
      nl: tipo === "AVULSO" ? nl : false,
      operador,
    };

    // compat: mantém variáveis existentes (se ainda usadas em outros módulos)
    window.grupoSelecionado = tipo === "GRUPO" ? grupo : null;
    window.operadorSelecionado = operador;

    // label do topo (mantém o mesmo span id="grupoAtivo")
    const label =
      tipo === "GRUPO"
        ? `Grupo ${grupo}`
        : `${nl ? "NL" : "Avulso"} | ${chave}`;

    document.getElementById("grupoAtivo").textContent = label;
    document.getElementById("nomeOperador").textContent = operador;

    bootstrap.Modal.getInstance(document.getElementById("modalInicio")).hide();

    try {
      // ✅ GRUPO (fluxo atual)
      if (tipo === "GRUPO") {
        await carregarRefsPorGrupo(grupo);
        await carregarProdutos(); // mantém como está hoje
        return;
      }

      // ✅ AVULSO (novo fluxo)
      // Você vai criar essas duas funções no supabase.js:
      //  - carregarRefsPorAvulso(contexto)
      //  - carregarProdutosPorContexto(contexto)
      if (typeof window.carregarRefsPorAvulso === "function") {
        await window.carregarRefsPorAvulso(window.pickingContexto);
      } else {
        // fallback: se refs não forem obrigatórios no avulso, não trava o app
        console.warn("⚠️ carregarRefsPorAvulso não implementado ainda.");
      }

      if (typeof window.carregarProdutosPorContexto === "function") {
        await window.carregarProdutosPorContexto(window.pickingContexto);
      } else {
        console.warn("⚠️ carregarProdutosPorContexto não implementado ainda.");
        mostrarToast(
          "⚠️ Avulso ainda não implementado no Supabase.js",
          "warning"
        );
      }
    } finally {
      document.getElementById("loaderGlobal").style.display = "none";
    }
  });
});

// 🔁 Loader on load
window.addEventListener("load", () => {
  setInterval(atualizarIndicadorFila, 1200);
  atualizarIndicadorFila();

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
  atualizarFiltroArmazem,
  pularProduto,
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

window.addEventListener("load", () => {
  setTimeout(atualizarBadgeFiltros, 300);
});

function gerarPlaquinhas(grupo) {
  const url = `/plaquinhas.html?grupo=${grupo}`;
  window.open(url, "_blank");
}

function atualizarFiltroArmazem() {
  const select = document.getElementById("filtroArmazem");
  if (!select) return;

  const armazens = new Set();

  state.produtos.forEach((p) => {
    const endPrimario = (p.endereco || "").split("•")[0];

    // Ex: A1-B03-R02-C01-N05
    const match = /^A(\d+)/i.exec(endPrimario);
    if (match) {
      armazens.add(`A${match[1]}`);
    } else {
      armazens.add("SEM LOCAL");
    }
  });

  const options = [`<option value="">Todos</option>`];

  if (armazens.has("SEM LOCAL")) {
    options.push(`<option value="SEM LOCAL">Sem Local</option>`);
  }

  [...armazens]
    .filter((a) => a !== "SEM LOCAL")
    .sort((a, b) => {
      const na = parseInt(a.replace("A", ""), 10);
      const nb = parseInt(b.replace("A", ""), 10);
      return na - nb;
    })
    .forEach((a) => {
      options.push(`<option value="${a}">${a}</option>`);
    });

  select.innerHTML = options.join("");
}

window.filtroArmazemSelecionado = "";

function atualizarModalInicioPorTipo() {
  const tipoEl = document.getElementById("tipoPicking");
  const wrapGrupo = document.getElementById("wrapGrupo");
  const wrapAvulso = document.getElementById("wrapAvulso");
  const inputChave = document.getElementById("chaveAvulsa");

  if (!tipoEl || !wrapGrupo || !wrapAvulso) return;

  const tipo = tipoEl.value;

  if (tipo === "AVULSO") {
    wrapGrupo.classList.add("d-none");
    wrapAvulso.classList.remove("d-none");
    setTimeout(() => inputChave?.focus(), 50);
  } else {
    wrapAvulso.classList.add("d-none");
    wrapGrupo.classList.remove("d-none");
  }
}

async function atualizarIndicadorFila() {
  const el = document.getElementById("pollingStatus");
  if (!el) return;

  try {
    const { stats } = await getQueueStats();
    const pend = stats.pending + stats.sending + stats.error;

    if (!navigator.onLine) {
      el.textContent = pend > 0 ? `📴${pend}` : "📴";
      el.title = pend > 0 ? `Offline • ${pend} ações na fila` : "Offline";
      return;
    }

    if (stats.error > 0) {
      el.textContent = `⚠️${stats.error}`;
      el.title = `${stats.error} ações com erro (tocável p/ ver painel)`;
      return;
    }

    if (pend > 0) {
      el.textContent = `⏳${pend}`;
      el.title = `${pend} ações pendentes na fila (tocável p/ ver painel)`;
      return;
    }

    el.textContent = "🛰️";
    el.title = "Sincronização OK";
  } catch {
    el.textContent = "❌";
    el.title = "Erro ao ler fila local";
  }
}

function atualizarBadgeFiltros() {
  const badge = document.getElementById("filtrosBadge");
  if (!badge) return;

  const a = document.getElementById("filtroArmazem")?.value || "";
  const b = document.getElementById("filtroBloco")?.value || "";

  const ativos = [a, b].filter(Boolean);

  if (ativos.length === 0) {
    badge.textContent = "OFF";
    badge.className = "badge bg-secondary";
  } else {
    badge.textContent = `ON (${ativos.length})`;
    badge.className = "badge bg-warning text-dark";
  }
}

window.atualizarModalInicioPorTipo = atualizarModalInicioPorTipo;
