// Supabase config
const SUPABASE_URL = "https://kinpwzuobsmfkjefnrdc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpbnB3enVvYnNtZmtqZWZucmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5OTgwMjcsImV4cCI6MjA2MzU3NDAyN30.btmwaLMSnXCmvKHQvYnw7ZngONqoejqnhbvazLhD1Io";

let produtos = [], retirados = [], tempoInicio = null, cronometroInterval = null;

// 🚀 Ao carregar página
document.addEventListener("DOMContentLoaded", () => {
  carregarOperadores();
  carregarGrupos();
  restaurarCacheLocal();
  checarModoStandalone();
});

function carregarOperadores() {
  const operadores = [
    "Alan Ramos", "Anderson Dutra", "Arthur Oliveira", "Felipe Moraes",
    "Filipe Silva", "Gabriel Lagoa", "João Alves", "Kaique Teixeira",
    "Marrony Portugal", "Nalbert Pereira", "Rodrigo Novaes", "Rony Côrrea",
    "Ykaro Oliveira", "Yohann Risso"
  ];
  const select = document.getElementById("operador");
  select.innerHTML = operadores.map(op => `<option value="${op}">${op}</option>`).join("");
}

async function carregarGrupos() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=grupo`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const dados = await res.json();
  const grupos = [...new Set(dados.map(d => parseInt(d.grupo)))].sort((a, b) => a - b);
  const select = document.getElementById("grupo");
  select.innerHTML = grupos.map(g => `<option value="${g}">${g}</option>`).join("");
}

// Iniciar picking
async function carregarProdutos() {
  const grupo = document.getElementById("grupo").value;
  const operador = document.getElementById("operador").value;
  if (!grupo || !operador) return mostrarToast("Preencha grupo e operador", "warning");

  document.getElementById("grupo").disabled = true;
  document.getElementById("operador").disabled = true;
  document.getElementById("btnIniciar").classList.add("d-none");
  document.getElementById("btnFinalizar").classList.remove("d-none");
  document.getElementById("card-tempo").classList.remove("d-none");
  mostrarLoader();

  try {
    // 1. Carrega todos os produtos do grupo
    const resProdutos = await fetch(`${SUPABASE_URL}/rest/v1/produtos?grupo=eq.${grupo}&select=*`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const todosProdutos = await resProdutos.json();

    // 2. Carrega os retirados
    const resRetirados = await fetch(`${SUPABASE_URL}/rest/v1/retiradas?grupo=eq.${grupo}&select=sku,caixa`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    const retiradas = await resRetirados.json();
    const mapaRetiradas = new Map();
    retiradas.forEach(r => mapaRetiradas.set(r.sku, r.caixa));

    // 3. Separa produtos retirados e pendentes
    produtos = [];
    retirados = [];

    todosProdutos.forEach(p => {
      const dist = {
        A: +p.distribuicao_a || 0,
        B: +p.distribuicao_b || 0,
        C: +p.distribuicao_c || 0,
        D: +p.distribuicao_d || 0
      };

      const produto = {
        ...p,
        distribuicaoAtual: { ...dist },
        distribuicaoOriginal: { ...dist }
      };

      if (mapaRetiradas.has(p.sku)) {
        produto.caixa = mapaRetiradas.get(p.sku);
        retirados.push(produto);
      } else {
        produtos.push(produto);
      }
    });
        // 4. Tempo e interface
    tempoInicio = new Date();
    iniciarCronometro();
    atualizarInterface();
    salvarProgressoLocal();

  } catch (err) {
    console.error("❌ Erro ao carregar dados:", err);
    mostrarToast("Erro ao carregar dados", "error");
  }

  esconderLoader();
}

function biparProduto() {
  const input = document.getElementById("skuInput");
  const valor = input.value.trim().toUpperCase();
  const grupo = document.getElementById("grupo").value;
  const operador = document.getElementById("operador").value;

  input.disabled = true;
  document.querySelector('.input-group .btn').disabled = true;
  mostrarLoaderInline("loaderBipagem");

  const liberarInput = () => {
    esconderLoaderInline("loaderBipagem");
    input.disabled = false;
    document.querySelector('.input-group .btn').disabled = false;
    input.value = "";
    input.focus();
  };

  let idx = produtos.findIndex(p => p.sku.toUpperCase() === valor || (p.ean || "").toUpperCase() === valor);
  if (idx === -1) return mostrarToast("Produto não encontrado", "error"), liberarInput();

  const produto = produtos[idx];
  const dist = produto.distribuicaoAtual;
  let caixa = "";

  if (dist.A > 0) { dist.A--; caixa = "A"; mostrarAnimacaoCaixa("A"); }
  else if (dist.B > 0) { dist.B--; caixa = "B"; mostrarAnimacaoCaixa("B"); }
  else if (dist.C > 0) { dist.C--; caixa = "C"; mostrarAnimacaoCaixa("C"); }
  else if (dist.D > 0) { dist.D--; caixa = "D"; mostrarAnimacaoCaixa("D"); }

  if (!caixa) return mostrarToast("Produto sem caixa para retirar", "error"), liberarInput();

  // ✅ passa a caixa aqui:
  registrarRetirada(produto, operador, grupo, caixa);

  const totalRestante = dist.A + dist.B + dist.C + dist.D;
  if (totalRestante === 0) {
    retirados.unshift({ ...produto, caixa, grupo, distribuicaoOriginal: { ...produto.distribuicaoOriginal } });
    produtos.splice(idx, 1);
  }

  feedbackVisual(produto.sku, "success");
  atualizarInterface();
  salvarProgressoLocal();
  liberarInput();
}

async function registrarRetirada(prod, operador, grupo, caixa) {
  const payload = {
    timestamp: new Date().toISOString(),
    operador,
    sku: prod.sku,
    romaneio: prod.romaneio,
    caixa,
    grupo: parseInt(grupo),
    status: "RETIRADO"
  };
  await fetch(`${SUPABASE_URL}/rest/v1/retiradas`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify(payload)
  });
}

function atualizarInterface() {
  const cards = document.getElementById("cards");
  cards.innerHTML = "";

  const maxCards = parseInt(document.getElementById("qtdCards").value, 10) || 2;
  const visiveis = produtos.slice(0, maxCards);

  visiveis.forEach((p, i) => {
    const qtdTotal = Object.values(p.distribuicaoAtual).reduce((a, b) => a + b, 0);
    const end1 = p.endereco?.split("•")[0] || "SEM LOCAL";
    const end2 = p.endereco?.split("•")[1] || "—";

    const miniCards = ['A', 'B', 'C', 'D'].map(caixa => `
      <div class="col minicard">
        <div class="card text-center">
          <div class="card-header fw-bold text-secondary">${caixa}</div>
          <div class="card-body p-2">
            <h4 class="card-title text-danger m-0">${p.distribuicaoAtual[caixa]}</h4>
          </div>
        </div>
      </div>`).join("");

    const col = document.createElement("div");
    col.className = maxCards === 1 ? 'col-12' : 'col-6';
    col.innerHTML = `
      <div class="card card-produto ${i === 0 ? 'primary' : ''} h-100 p-3">
        <div class="row g-3">
          <div class="col-md-4 text-center">
            <img src="${p.imagem || ''}" class="img-fluid rounded shadow-sm card-img-produto" style="max-height: 250px;">
          </div>
          <div class="col-md-8">
            <p class="fw-bold fs-3 mb-1 endereco-label">
              ENDEREÇO: <span class="texto-endereco d-block">${end1}</span>
            </p>
            <p><strong>ENDEREÇO SECUNDÁRIO:</strong><br>${end2}</p>
            <p class="text-danger fw-bold fs-2 mb-1">SKU: ${p.sku}</p>
            <p><strong>PRODUTO:</strong> ${p.descricao}</p>
            <p><strong>COLEÇÃO:</strong> ${p.colecao || "—"}</p>
          </div>
        </div>
        <div class="text-center mt-3">
          <div class="fw-bold text-muted small">QTDE TOTAL</div>
          <div class="fw-bold fs-1">${qtdTotal}</div>
          <div class="row mt-2 g-2">${miniCards}</div>
        </div>
      </div>`;
    cards.appendChild(col);
  });

  document.getElementById("pendentesList").innerHTML = produtos.map(p => `
    <div class="pendente-item">
      <div class="sku">SKU: ${p.sku}</div>
      <div class="descricao">${p.descricao} | Ref: ${p.sku.split("-")[0]}</div>
      <div class="endereco">${p.endereco?.split("•")[0]}</div>
    </div>`).join("");

  document.getElementById("retiradosList").innerHTML = retirados.map(p => `
    <div class="mb-2">
      ✅ <strong>${p.sku}</strong>
      <span class="badge bg-primary">Grupo ${p.grupo}</span>
      <span class="badge bg-secondary">Caixa ${p.caixa}</span>
    </div>`).join("");

  const total = produtos.concat(retirados).reduce((acc, p) => {
    const dist = p.distribuicaoAtual || p.distribuicaoOriginal;
    return acc + (dist?.A || 0) + (dist?.B || 0) + (dist?.C || 0) + (dist?.D || 0);
  }, 0);

  const retiradasPecas = retirados.reduce((acc, p) => {
    const d = p.distribuicaoOriginal;
    return acc + d.A + d.B + d.C + d.D;
  }, 0);

  const percentual = total > 0 ? Math.round((retiradasPecas / total) * 100) : 0;

  const barra = document.getElementById("progressoPicking");
  barra.style.width = `${percentual}%`;
  barra.textContent = `${retiradasPecas}/${total} • ${percentual}%`;

  if (percentual < 30) barra.className = "progress-bar bg-danger";
  else if (percentual < 70) barra.className = "progress-bar bg-warning text-dark";
  else barra.className = "progress-bar bg-success";

  if (percentual === 100) soltarConfete();
}

// Confete 🎉
function soltarConfete() {
  confetti({ particleCount: 250, spread: 90, origin: { y: 0.6 } });
}

// Cronômetro
function iniciarCronometro() {
  tempoInicio = new Date();
  const cronometro = () => {
    const diff = new Date(new Date() - tempoInicio);
    const hh = String(diff.getUTCHours()).padStart(2, "0");
    const mm = String(diff.getUTCMinutes()).padStart(2, "0");
    const ss = String(diff.getUTCSeconds()).padStart(2, "0");
    document.getElementById("cronometro").textContent = `${hh}:${mm}:${ss}`;
    cronometroInterval = setTimeout(cronometro, 1000);
  };
  cronometro();
}

// Restaurar cache
function restaurarCacheLocal() {
  const salvo = localStorage.getItem("pickingProgresso");
  if (!salvo) return;

  const dados = JSON.parse(salvo);
  document.getElementById("grupoSalvo").textContent = dados.grupo;

  const modal = new bootstrap.Modal(document.getElementById("modalRestaurarPicking"));
  modal.show();

  document.getElementById("btnConfirmarRestaurar").onclick = () => {
    document.getElementById("grupo").value = dados.grupo;
    document.getElementById("operador").value = dados.operador;
    produtos = dados.produtos || [];
    retirados = dados.retirados || [];
    tempoInicio = dados.tempoInicio ? new Date(dados.tempoInicio) : new Date();

    document.getElementById("grupo").disabled = true;
    document.getElementById("operador").disabled = true;
    document.getElementById("btnIniciar").classList.add("d-none");
    document.getElementById("btnFinalizar").classList.remove("d-none");
    document.getElementById("card-tempo").classList.remove("d-none");

    iniciarCronometro();
    atualizarInterface();
    modal.hide();
  };

  document.getElementById("btnCancelarRestaurar").onclick = () => {
    localStorage.removeItem("pickingProgresso");
  };
}

// Save
function salvarProgressoLocal() {
  const dados = {
    grupo: document.getElementById("grupo").value,
    operador: document.getElementById("operador").value,
    produtos,
    retirados,
    tempoInicio: tempoInicio ? tempoInicio.toISOString() : null
  };
  localStorage.setItem("pickingProgresso", JSON.stringify(dados));
}

// Helpers
function mostrarLoader() {
  document.getElementById("loaderGlobal").style.display = "flex";
}
function esconderLoader() {
  document.getElementById("loaderGlobal").style.display = "none";
}
function mostrarLoaderInline(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("d-none");
}
function esconderLoaderInline(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("d-none");
}
function mostrarToast(msg, tipo = "info") {
  const cor = tipo === "success" ? "bg-success" : tipo === "error" ? "bg-danger" : tipo === "warning" ? "bg-warning text-dark" : "bg-primary";
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
function checarModoStandalone() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (!standalone) {
    setTimeout(() => {
      mostrarToast("📱 Para instalar este sistema como app: toque no menu (⋮) e escolha 'Instalar app'.", "warning");
    }, 3000);
  }
}
function feedbackVisual(sku, tipo) {
  document.querySelectorAll(".card-produto").forEach(card => {
    if (!sku || card.innerHTML.includes(sku)) {
      card.classList.add(`feedback-${tipo}`);
      setTimeout(() => card.classList.remove(`feedback-${tipo}`), 800);
    }
  });
}

function atualizarQtdCards() {
  const qtd = parseInt(document.getElementById("qtdCards").value, 10);
  document.getElementById("qtdCardsLabel").textContent = qtd;
  localStorage.setItem("qtdCardsPreferido", qtd);
  atualizarInterface();
}

function mostrarAnimacaoCaixa(letra) {
  const overlay = document.getElementById("overlayCaixa");
  const letraBox = document.getElementById("letraCaixa");

  letraBox.textContent = letra;

  overlay.classList.remove("hide");
  overlay.classList.add("show");
  overlay.style.display = "flex";

  setTimeout(() => {
    overlay.classList.remove("show");
    overlay.classList.add("hide");
    setTimeout(() => overlay.style.display = "none", 500);
  }, 2000);
}
