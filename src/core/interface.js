import { state } from '../config.js';
import { criarCardProduto } from '../components/CardProduto.js';
import { porcentagem } from '../utils/format.js';
import { salvarProgressoLocal } from '../utils/storage.js';
import { atualizarInterface } from './interface.js';

export function mostrarToast(msg, tipo = "info") {
  const cor = tipo === "success"
    ? "bg-success"
    : tipo === "error"
    ? "bg-danger"
    : tipo === "warning"
    ? "bg-warning text-dark"
    : "bg-primary";

  const toast = document.createElement("div");
  toast.className = `toast fade show align-items-center text-white ${cor} border-0`;
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  document.getElementById("toast-container").appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function checarModoStandalone() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone;
  if (!standalone) {
    setTimeout(() => {
      mostrarToast("📱 Para instalar como app: use o menu ⋮ e 'Instalar app'", "warning");
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
  const visiveis = state.produtos.slice(0, maxCards);

  visiveis.forEach((produto, i) => {
    const card = criarCardProduto(produto, i === 0);
    cards.appendChild(card);
  });

  document.getElementById("pendentesList").innerHTML = state.produtos.map((p) => `
    <div class="pendente-item">
      <div class="sku">SKU: ${p.sku}</div>
      <div class="descricao">${p.descricao} | Ref: ${p.sku.split("-")[0]}</div>
      <div class="endereco">${p.endereco?.split("•")[0]}</div>
    </div>
  `).join("");

  document.getElementById("retiradosList").innerHTML = state.retirados.map((p) => `
    <div class="mb-2">
      ✅ <strong>${p.sku}</strong>
      <span class="badge bg-primary">Grupo ${p.grupo}</span>
      <span class="badge bg-secondary">Caixa ${p.caixa}</span>
      <button
        class="btn btn-sm btn-outline-light ms-3"
        title="Desfazer"
        onclick="desfazerRetirada('${p.sku}', ${p.romaneio}, '${p.caixa}', ${p.grupo})"
      >
        🔄
      </button>
    </div>
  `).join("");

  const total = state.produtos.concat(state.retirados).reduce((acc, p) => {
    const dist = p.distribuicaoAtual || p.distribuicaoOriginal;
    return acc + (dist?.A || 0) + (dist?.B || 0) + (dist?.C || 0) + (dist?.D || 0);
  }, 0);

  const retiradasPecas = state.retirados.reduce((acc, p) => {
    const d = p.distribuicaoOriginal;
    return acc + d.A + d.B + d.C + d.D;
  }, 0);

  const percentual = porcentagem(retiradasPecas, total);
  const barra = document.getElementById("progressoPicking");
  barra.style.width = `${percentual}%`;
  barra.textContent = `${retiradasPecas}/${total} • ${percentual}%`;

  if (percentual < 30) barra.className = "progress-bar bg-danger";
  else if (percentual < 70) barra.className = "progress-bar bg-warning text-dark";
  else barra.className = "progress-bar bg-success";

  if (percentual === 100) soltarConfete();
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