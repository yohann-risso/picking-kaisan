import { state } from "../config.js";
import { criarCardProduto } from "../components/CardProduto.js";
import { porcentagem } from "../utils/format.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { desfazerRetirada } from "../services/supabase.js";

export function mostrarToast(msg, tipo = "info") {
  const cor =
    tipo === "success"
      ? "bg-success"
      : tipo === "error"
      ? "bg-danger"
      : tipo === "warning"
      ? "bg-warning text-dark"
      : "bg-primary";

  const container = document.getElementById("toast-container");
  if (!container) {
    console.warn("Toast container não encontrado.");
    return;
  }

  // Cria o elemento primeiro
  const toast = document.createElement("div");
  toast.className = `toast fade show align-items-center text-white ${cor} border-0`;
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;

  // Só então o adiciona
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function checarModoStandalone() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone;
  if (!standalone) {
    setTimeout(() => {
      mostrarToast(
        "📱 Para instalar como app: use o menu ⋮ e 'Instalar app'",
        "warning"
      );
    }, 3000);
  }
}

export function soltarConfete() {
  if (window.confetti) {
    window.confetti({ particleCount: 250, spread: 90, origin: { y: 0.6 } });
  }
}

export function atualizarInterface() {
  const cards = document.getElementById("cards");
  cards.innerHTML = "";

  const maxCards = parseInt(document.getElementById("qtdCards").value, 10) || 2;
  const filtroBloco = document.getElementById("filtroBloco")?.value || "";

  // === CARDS VISÍVEIS ===
  const visiveis = state.produtos
    .filter((p) => {
      const dist = p.distribuicaoAtual || {};
      const total = dist.A + dist.B + dist.C + dist.D;
      if (total <= 0) return false;

      if (filtroBloco) {
        const endPrimario = p.endereco?.split("•")[0] || "";
        const match = /B(\d+)/.exec(endPrimario);
        const bloco = match ? match[1] : "";
        return bloco === filtroBloco.padStart(2, "0"); // garante "02"
      }
      return true;
    })
    .slice(0, maxCards);

  visiveis.forEach((produto, i) => {
    const card = criarCardProduto(produto, i === 0);
    cards.appendChild(card);
  });

  // === PENDENTES (sem filtro de Bloco, mostra todos que restam) ===
  const pendentesVisiveis = state.produtos.filter((p) => {
    const dist = p.distribuicaoAtual || {};
    const total = dist.A + dist.B + dist.C + dist.D;
    return total > 0;
  });

  document.getElementById("pendentesList").innerHTML = pendentesVisiveis
    .map(
      (p) => `
      <div class="pendente-item">
        <div class="sku">SKU: ${p.sku}</div>
        <div class="descricao">${p.descricao} | Ref: ${
        p.sku.split("-")[0]
      }</div>
        <div class="endereco">${p.endereco?.split("•")[0]}</div>
      </div>`
    )
    .join("");

  // === RETIRADOS ===
  document.getElementById("retiradosList").innerHTML = state.retirados
    .map(
      (p) => `
      <div class="mb-2">
        ✅ <strong>${p.sku}</strong>
        <span class="badge bg-primary">Grupo ${p.grupo}</span>
        ${
          p.retiradas
            ? Object.entries(p.retiradas)
                .filter(([_, qtde]) => qtde > 0)
                .map(
                  ([cx, qtde]) =>
                    `<span class="badge bg-secondary">${qtde}x Caixa ${cx}</span>`
                )
                .join(" ")
            : `<span class="badge bg-secondary">Caixa ${p.caixa}</span>`
        }
        <button
          class="btn btn-sm btn-outline-light ms-3"
          title="Desfazer"
          onclick="desfazerRetirada('${p.sku}', ${p.romaneio}, '', ${p.grupo})"
        >
          🔄
        </button>
      </div>`
    )
    .join("");

  // === PROGRESSO ===
  const total = state.totalPecas || 0;

  const retiradasPecas = (() => {
    const totalOriginal = state.produtos
      .concat(state.retirados)
      .reduce((acc, p) => {
        const original = p.distribuicaoOriginal || { A: 0, B: 0, C: 0, D: 0 };
        return acc + original.A + original.B + original.C + original.D;
      }, 0);

    const totalAtual = state.produtos.reduce((acc, p) => {
      const atual = p.distribuicaoAtual || { A: 0, B: 0, C: 0, D: 0 };
      return acc + atual.A + atual.B + atual.C + atual.D;
    }, 0);

    return totalOriginal - totalAtual;
  })();

  const percentual = porcentagem(retiradasPecas, total);
  const barra = document.getElementById("progressoPicking");

  barra.style.width = `${percentual}%`;
  barra.textContent = `${retiradasPecas}/${total} • ${percentual}%`;

  if (percentual < 30) barra.className = "progress-bar bg-danger";
  else if (percentual < 70)
    barra.className = "progress-bar bg-warning text-dark";
  else barra.className = "progress-bar bg-success";

  if (percentual === 100) soltarConfete();

  // Texto abaixo da barra
  document.getElementById("qtdRetiradas").textContent = retiradasPecas;
  document.getElementById("qtdTotal").textContent = total;
}

export function feedbackVisual(sku, tipo) {
  document.querySelectorAll(".card-produto").forEach((card) => {
    if (!sku || card.innerHTML.includes(sku)) {
      card.classList.add(`feedback-${tipo}`);
      setTimeout(() => card.classList.remove(`feedback-${tipo}`), 800);
    }
  });
}

export function atualizarQtdCards() {
  const qtd = parseInt(document.getElementById("qtdCards").value, 10);
  document.getElementById("qtdCardsLabel").textContent = qtd;
  localStorage.setItem("qtdCardsPreferido", qtd);
  atualizarInterface();
  salvarProgressoLocal();
}

export function mostrarAnimacaoCaixa(letra) {
  const overlay = document.getElementById("overlayCaixa");
  const letraBox = document.getElementById("letraCaixa");

  letraBox.textContent = letra;

  overlay.classList.remove("hide");
  overlay.classList.add("show");
  overlay.style.display = "flex";

  setTimeout(() => {
    overlay.classList.remove("show");
    overlay.classList.add("hide");
    setTimeout(() => (overlay.style.display = "none"), 500);
  }, 1000);
}

export function mostrarLoaderInline(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove("d-none");
    el.style.visibility = "visible";
  } else {
    console.warn(`mostrarLoaderInline: elemento #${id} não encontrado`);
  }
}

export function esconderLoaderInline(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add("d-none");
    el.style.visibility = "hidden";
  } else {
    console.warn(`esconderLoaderInline: elemento #${id} não encontrado`);
  }
}
