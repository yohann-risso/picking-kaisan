// Supabase config
const SUPABASE_URL = window.env.SUPABASE_URL || "";
const SUPABASE_KEY = window.env.SUPABASE_KEY || "";

let produtos = [],
  retirados = [],
  tempoInicio = null,
  cronometroInterval = null;

// 🚀 Ao carregar página
document.addEventListener("DOMContentLoaded", () => {
  carregarOperadores();
  carregarGrupos();
  restaurarCacheLocal();
  checarModoStandalone();
});

function carregarOperadores() {
  const operadores = [
    "Alan Ramos",
    "Anderson Dutra",
    "Arthur Oliveira",
    "Felipe Moraes",
    "Filipe Silva",
    "Gabriel Lagoa",
    "João Alves",
    "Kaique Teixeira",
    "Marrony Portugal",
    "Nalbert Pereira",
    "Rodrigo Novaes",
    "Rony Côrrea",
    "Ykaro Oliveira",
    "Yohann Risso",
  ];
  const select = document.getElementById("operador");
  select.innerHTML = operadores
    .map((op) => `<option value="${op}">${op}</option>`)
    .join("");
}

async function carregarGrupos() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=grupo`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  const dados = await res.json();
  const grupos = [...new Set(dados.map((d) => parseInt(d.grupo)))].sort(
    (a, b) => a - b
  );
  const select = document.getElementById("grupo");
  select.innerHTML = grupos
    .map((g) => `<option value="${g}">${g}</option>`)
    .join("");
}

// Iniciar picking
async function carregarProdutos() {
  const grupo = document.getElementById("grupo").value;
  const operador = document.getElementById("operador").value;
  if (!grupo || !operador)
    return mostrarToast("Preencha grupo e operador", "warning");

  document.getElementById("grupo").disabled = true;
  document.getElementById("operador").disabled = true;
  document.getElementById("btnIniciar").classList.add("d-none");
  document.getElementById("btnFinalizar").classList.remove("d-none");
  document.getElementById("card-tempo").classList.remove("d-none");
  mostrarLoader();

  try {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    };

    // 1. Produtos do grupo
    const resProdutos = await fetch(
      `${SUPABASE_URL}/rest/v1/produtos?grupo=eq.${grupo}&select=*`,
      { headers }
    );
    const linhas = await resProdutos.json();

    // 2. Extrai apenas os SKUs únicos que precisamos
    const skus = [
      ...new Set(
        linhas
          .map(l => (l.sku || "").trim().toUpperCase())
          .filter(Boolean)
      )
    ];

    // monta o filtro in.('SKU1','SKU2',...)
    const skusFilter = skus.map(s => `'${s}'`).join(",");

    // 3. Buscar só essas referências
    const urlRef = `${SUPABASE_URL}/rest/v1/produtos_ref`
      + `?select=sku,imagem,colecao`
      + `&sku=in.(${skusFilter})`;

    const resRef = await fetch(urlRef, { headers });
    const refs   = await resRef.json();
    console.log("🔍 produtos_ref raw:", refs);

    const mapaRef = new Map(
      refs.map(p => [p.sku.trim().toUpperCase(), p])
    );
    console.log("🔑 chave do mapaRef:", Array.from(mapaRef.keys()));

    // 4. Retiradas do grupo
    const resRet = await fetch(
      `${SUPABASE_URL}/rest/v1/retiradas?grupo=eq.${grupo}&select=sku,caixa`,
      { headers }
    );
    const retiradas = await resRet.json();
    const mapaRetiradas = new Map(
      retiradas.map(r => [r.sku.trim().toUpperCase(), r.caixa])
    );

    produtos = [];
    retirados = [];

    // 5. Agrupar por SKU
    const mapaSKUs = {};

    for (const linha of linhas) {
      const rawSku  = linha.sku || "";
      const sku     = rawSku.trim().toUpperCase();
      const caixa   = (linha.caixa || "").toUpperCase();
      const qtd     = parseInt(linha.qtd || 0, 10);
      const endereco =
        (linha.endereco || "").split("•")[0]?.trim() || "SEM ENDEREÇO";

      const ref = mapaRef.get(sku);
      console.log("📦 SKU:", sku, "| Imagem:", ref?.imagem || "❌ Não encontrada");

      if (!mapaSKUs[sku]) {
        const match = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(endereco);
        mapaSKUs[sku] = {
          ...linha,
          sku,
          endereco,
          imagem: ref?.imagem || "",
          colecao: ref?.colecao || "—",
          distribuicaoAtual: { A: 0, B: 0, C: 0, D: 0 },
          distribuicaoOriginal: { A: 0, B: 0, C: 0, D: 0 },
          ordemEndereco: match
            ? match.slice(1).map(Number)
            : [999, 999, 999, 999, 999],
        };
      }

      const p = mapaSKUs[sku];
      if (caixa === "A") (p.distribuicaoAtual.A += qtd), (p.distribuicaoOriginal.A += qtd);
      if (caixa === "B") (p.distribuicaoAtual.B += qtd), (p.distribuicaoOriginal.B += qtd);
      if (caixa === "C") (p.distribuicaoAtual.C += qtd), (p.distribuicaoOriginal.C += qtd);
      if (caixa === "D") (p.distribuicaoAtual.D += qtd), (p.distribuicaoOriginal.D += qtd);
    }

    // 6. Separar entre pendentes e retirados
    for (const produto of Object.values(mapaSKUs)) {
      if (mapaRetiradas.has(produto.sku)) {
        produto.caixa = mapaRetiradas.get(produto.sku);
        retirados.push(produto);
      } else {
        produtos.push(produto);
      }
    }

    // 7. Ordenar por endereço
    produtos.sort((a, b) => {
      for (let i = 0; i < a.ordemEndereco.length; i++) {
        if (a.ordemEndereco[i] !== b.ordemEndereco[i]) {
          return a.ordemEndereco[i] - b.ordemEndereco[i];
        }
      }
      return 0;
    });

    // 8. Inicia cronômetro e atualiza UI
    tempoInicio = new Date();
    iniciarCronometro();
    atualizarInterface();
    salvarProgressoLocal();
  } catch (err) {
    console.error("❌ Erro ao carregar produtos:", err);
    mostrarToast("Erro ao carregar dados do Supabase", "error");
  }

  esconderLoader();
}

function biparProduto() {
  const input = document.getElementById("skuInput");
  const valor = input.value.trim().toUpperCase();
  const grupo = document.getElementById("grupo").value;
  const operador = document.getElementById("operador").value;

  input.disabled = true;
  document.querySelector(".input-group .btn").disabled = true;
  mostrarLoaderInline("loaderBipagem");

  const liberarInput = () => {
    esconderLoaderInline("loaderBipagem");
    input.disabled = false;
    document.querySelector(".input-group .btn").disabled = false;
    input.value = "";
    input.focus();
  };

  let idx = produtos.findIndex(
    (p) =>
      p.sku.toUpperCase() === valor || (p.ean || "").toUpperCase() === valor
  );
  if (idx === -1)
    return mostrarToast("Produto não encontrado", "error"), liberarInput();

  const produto = produtos[idx];
  const dist = produto.distribuicaoAtual;
  let caixa = "";

  if (dist.A > 0) {
    dist.A--;
    caixa = "A";
    mostrarAnimacaoCaixa("A");
  } else if (dist.B > 0) {
    dist.B--;
    caixa = "B";
    mostrarAnimacaoCaixa("B");
  } else if (dist.C > 0) {
    dist.C--;
    caixa = "C";
    mostrarAnimacaoCaixa("C");
  } else if (dist.D > 0) {
    dist.D--;
    caixa = "D";
    mostrarAnimacaoCaixa("D");
  }

  if (!caixa)
    return (
      mostrarToast("Produto sem caixa para retirar", "error"), liberarInput()
    );

  // ✅ passa a caixa aqui:
  registrarRetirada(produto, operador, grupo, caixa);

  const totalRestante = dist.A + dist.B + dist.C + dist.D;
  if (totalRestante === 0) {
    retirados.unshift({
      ...produto,
      caixa,
      grupo,
      distribuicaoOriginal: { ...produto.distribuicaoOriginal },
    });
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
    status: "RETIRADO",
  };
  await fetch(`${SUPABASE_URL}/rest/v1/retiradas`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
}

function atualizarInterface() {
  const cards = document.getElementById("cards");
  cards.innerHTML = "";

  const maxCards = parseInt(document.getElementById("qtdCards").value, 10) || 2;
  const visiveis = produtos.slice(0, maxCards);

  visiveis.forEach((p, i) => {
    const qtdTotal = Object.values(p.distribuicaoAtual).reduce(
      (a, b) => a + b,
      0
    );
    const end1 = p.endereco?.split("•")[0] || "SEM LOCAL";
    const end2 = p.endereco?.split("•")[1] || "—";

    const miniCards = ["A", "B", "C", "D"]
      .map(
        (caixa) => `
      <div class="col minicard">
        <div class="card text-center">
          <div class="card-header fw-bold text-secondary">${caixa}</div>
          <div class="card-body p-2">
            <h4 class="card-title text-danger m-0">${p.distribuicaoAtual[caixa]}</h4>
          </div>
        </div>
      </div>`
      )
      .join("");

    const col = document.createElement("div");
    col.className = maxCards === 1 ? "col-12" : "col-6";
    col.innerHTML = `
      <div class="card card-produto ${i === 0 ? "primary" : ""} h-100 p-3">
        <div class="row g-3">
          <div class="col-md-4 text-center">
            <img src="${p.imagem || ""}" alt="${
      p.descricao || "Imagem do produto"
    }" class="img-fluid rounded shadow-sm card-img-produto" style="max-height: 250px;">
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

  document.getElementById("pendentesList").innerHTML = produtos
    .map(
      (p) => `
    <div class="pendente-item">
      <div class="sku">SKU: ${p.sku}</div>
      <div class="descricao">${p.descricao} | Ref: ${p.sku.split("-")[0]}</div>
      <div class="endereco">${p.endereco?.split("•")[0]}</div>
    </div>`
    )
    .join("");

  document.getElementById("retiradosList").innerHTML = retirados
    .map(
      (p) => `
    <div class="mb-2">
      ✅ <strong>${p.sku}</strong>
      <span class="badge bg-primary">Grupo ${p.grupo}</span>
      <span class="badge bg-secondary">Caixa ${p.caixa}</span>
    </div>`
    )
    .join("");

  const total = produtos.concat(retirados).reduce((acc, p) => {
    const dist = p.distribuicaoAtual || p.distribuicaoOriginal;
    return (
      acc + (dist?.A || 0) + (dist?.B || 0) + (dist?.C || 0) + (dist?.D || 0)
    );
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
  else if (percentual < 70)
    barra.className = "progress-bar bg-warning text-dark";
  else barra.className = "progress-bar bg-success";

  if (percentual === 100) soltarConfete();
}

// Confete 🎉
function soltarConfete() {
  confetti({ particleCount: 250, spread: 90, origin: { y: 0.6 } });
}

// Cronômetro
function iniciarCronometro() {
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

function calcularDuracao() {
  if (!tempoInicio) return "00:00:00";
  const diff = new Date(new Date() - tempoInicio);
  const hh = String(diff.getUTCHours()).padStart(2, "0");
  const mm = String(diff.getUTCMinutes()).padStart(2, "0");
  const ss = String(diff.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Restaurar cache
function restaurarCacheLocal() {
  const salvo = localStorage.getItem("pickingProgresso");
  if (!salvo) return;

  const dados = JSON.parse(salvo);
  document.getElementById("grupoSalvo").textContent = dados.grupo;

  const modal = new bootstrap.Modal(
    document.getElementById("modalRestaurarPicking")
  );
  modal.show();

  document.getElementById("btnConfirmarRestaurar").onclick = () => {
    document.getElementById("grupo").value = dados.grupo;
    document.getElementById("operador").value = dados.operador;
    produtos = dados.produtos || [];
    retirados = dados.retirados || [];
    tempoInicio = dados.tempoInicio ? new Date(dados.tempoInicio) : new Date();
    iniciarCronometro();

    document.getElementById("grupo").disabled = true;
    document.getElementById("operador").disabled = true;
    document.getElementById("btnIniciar").classList.add("d-none");
    document.getElementById("btnFinalizar").classList.remove("d-none");
    document.getElementById("card-tempo").classList.remove("d-none");

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
    tempoInicio: tempoInicio ? tempoInicio.toISOString() : null,
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
  const cor =
    tipo === "success"
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
function checarModoStandalone() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone;
  if (!standalone) {
    setTimeout(() => {
      mostrarToast(
        "📱 Para instalar este sistema como app: toque no menu (⋮) e escolha 'Instalar app'.",
        "warning"
      );
    }, 3000);
  }
}
function feedbackVisual(sku, tipo) {
  document.querySelectorAll(".card-produto").forEach((card) => {
    if (!sku || card.innerHTML.includes(sku)) {
      card.classList.add(`feedback-${tipo}`);
      setTimeout(() => card.classList.remove(`feedback-${tipo}`), 800);
    }
  });
}

window.atualizarQtdCards = function atualizarQtdCards() {
  const qtd = parseInt(document.getElementById("qtdCards").value, 10);
  document.getElementById("qtdCardsLabel").textContent = qtd;
  localStorage.setItem("qtdCardsPreferido", qtd);
  atualizarInterface();
};

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
    setTimeout(() => (overlay.style.display = "none"), 500);
  }, 2000);
}

function finalizarPicking() {
  mostrarLoader();

  // 1. Para o cronômetro
  clearTimeout(cronometroInterval);

  const operador = document.getElementById("operador").value;
  const grupo = document.getElementById("grupo").value;

  const resumo = {
    operador,
    grupo,
    tempoExecucao: calcularDuracao(),
    retirados,
    pendentes: produtos,
  };

  // 2. Gera o PDF no navegador
  gerarPDF(resumo); // usa jsPDF local (já está incluído via CDN)

  // 3. Limpa os dados e reseta interface
  localStorage.removeItem("pickingProgresso");
  produtos = [];
  retirados = [];
  tempoInicio = null;

  document.getElementById("grupo").disabled = false;
  document.getElementById("operador").disabled = false;
  document.getElementById("btnIniciar").classList.remove("d-none");
  document.getElementById("btnFinalizar").classList.add("d-none");
  document.getElementById("cards").innerHTML = "";
  document.getElementById("pendentesList").innerHTML = "";
  document.getElementById("retiradosList").innerHTML = "";
  document.getElementById("cronometro").textContent = "00:00:00";
  document.getElementById("ideal").textContent = "";
  document.getElementById("progressoPicking").style.width = "0%";
  document.getElementById("progressoPicking").textContent = "0%";

  mostrarToast("Pronto para iniciar novo picking! 🚀", "success");

  esconderLoader();
}

function gerarPDF(resumo) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("📦 Resumo de Picking", 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  doc.text(`Operador: ${resumo.operador}`, 20, 35);
  doc.text(`Grupo: ${resumo.grupo}`, 20, 42);
  doc.text(`Tempo: ${resumo.tempoExecucao}`, 20, 49);
  doc.text(`Data: ${new Date().toLocaleString()}`, 20, 56);

  doc.text("✅ Retirados:", 20, 70);
  resumo.retirados.forEach((p, i) => {
    doc.text(
      `${i + 1}. SKU: ${p.sku} | Produto: ${p.descricao || "-"} | Caixa: ${
        p.caixa
      }`,
      20,
      80 + i * 7
    );
  });

  doc.save(`Picking_Grupo${resumo.grupo}_${resumo.operador}.pdf`);
}
