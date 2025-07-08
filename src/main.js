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

async function gerarPdfPlaquinhas(grupo) {
  const { jsPDF } = window.jspdf;

  const { data, error } = await supabase
    .from("romaneios")
    .select("romaneio, qtd_pedidos, qtd_pecas")
    .eq("conjunto", grupo)
    .order("romaneio", { ascending: true });

  if (error) {
    console.error("❌ Erro ao buscar romaneios:", error);
    toast("Erro ao gerar plaquinhas", "danger");
    return;
  }

  const romaneios = data.map((item) => ({
    numero: item.romaneio,
    pedidos: item.qtd_pedidos,
    pecas: item.qtd_pecas,
  }));

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const largura = 95;
  const altura = 70;
  const marginLeft = 10;
  const marginTop = 20;
  const espacoX = 10;
  const espacoY = 15;

  const posicoes = [
    { x: marginLeft, y: marginTop },
    { x: marginLeft + largura + espacoX, y: marginTop },
    { x: marginLeft, y: marginTop + altura + espacoY },
    { x: marginLeft + largura + espacoX, y: marginTop + altura + espacoY },
  ];

  const dataHoje = new Date().toLocaleDateString("pt-BR");

  romaneios.forEach((rom, index) => {
    const { x, y } = posicoes[index % 4];
    const box = String.fromCharCode(65 + index);

    // Caixa
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(x, y, largura, altura);

    // Cabeçalho
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text("kaisan", x + 4, y + 7);
    doc.setFontSize(7);
    doc.text("Fluxo de Armazenagem", x + 4, y + 11);

    // Título e número
    doc.setFontSize(10);
    doc.text("ROMANEIO", x + 4, y + 19);

    doc.setFillColor(0, 0, 0);
    doc.setTextColor(255);
    doc.rect(x + 4, y + 21, largura - 16, 14, "F");

    doc.setFontSize(22);
    doc.text(`${rom.numero}`, x + 4 + (largura - 16) / 2, y + 31, {
      align: "center",
    });

    // Detalhes
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(`DATA: ${dataHoje}`, x + 4, y + 42);
    doc.text(`QTDE. PEDIDOS: ${rom.pedidos}`, x + 4, y + 49);
    doc.text(`QTDE. PEÇAS: ${rom.pecas}`, x + 4, y + 56);

    // Lateral
    const faixaX = x + largura - 10;
    doc.setFillColor(0, 0, 0);
    doc.setTextColor(255);
    doc.rect(faixaX, y, 10, altura, "F");

    doc.setFontSize(10);
    doc.saveGraphicsState();
    doc.rotate(-90, { origin: [faixaX + 5, y + altura / 2] });
    doc.text(`${grupo}`, faixaX + 5, y + altura / 2 - 15, { align: "center" });
    doc.text("CAIXA", faixaX + 5, y + altura / 2, { align: "center" });
    doc.setFontSize(16);
    doc.text(box, faixaX + 5, y + altura / 2 + 15, { align: "center" });
    doc.restoreGraphicsState();
  });

  doc.output("dataurlnewwindow");
}
