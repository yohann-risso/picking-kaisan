// Supabase config
const SUPABASE_URL = "https://kinpwzuobsmfkjefnrdc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpbnB3enVvYnNtZmtqZWZucmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5OTgwMjcsImV4cCI6MjA2MzU3NDAyN30.btmwaLMSnXCmvKHQvYnw7ZngONqoejqnhbvazLhD1Io";

let produtos = [], retirados = [], tempoInicio = null;

async function carregarProdutos() {
  const grupo = document.getElementById("grupo").value;
  const operador = document.getElementById("operador").value;

  if (!grupo || !operador) {
    alert("⚠️ Selecione grupo e operador.");
    return;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/produtos?grupo=eq.${grupo}&status=neq.RETIRADO&select=*`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`);
    const data = await res.json();

    produtos = ordenarPorEndereco(data);
    retirados = [];
    tempoInicio = new Date();

    console.log("✅ Produtos carregados:", produtos);
    atualizarInterface();

  } catch (err) {
    console.error("❌ Erro ao carregar produtos:", err.message);
    alert("Erro ao buscar produtos no Supabase.");
  }
}

function ordenarPorEndereco(lista) {
  return lista.sort((a, b) => {
    const parse = (e) => {
      const m = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(e?.endereco || "");
      return m ? m.slice(1).map(Number) : [999, 999, 999, 999, 999];
    };
    const aOrd = parse(a);
    const bOrd = parse(b);
    for (let i = 0; i < aOrd.length; i++) {
      if (aOrd[i] !== bOrd[i]) return aOrd[i] - bOrd[i];
    }
    return 0;
  });
}

function biparProduto() {
  const input = document.getElementById("skuInput").value.trim().toUpperCase();
  const operador = document.getElementById("operador").value;
  const grupo = document.getElementById("grupo").value;

  let produto = produtos.find(p => p.sku?.toUpperCase() === input || p.ean?.toUpperCase() === input);
  if (!produto) return alert("SKU ou EAN não encontrado.");

  registrarRetirada(produto, operador, grupo);
  retirados.push(produto);
  produtos = produtos.filter(p => p.sku !== produto.sku);

  document.getElementById("skuInput").value = "";
  atualizarInterface();
}

async function registrarRetirada(produto, operador, grupo) {
  const payload = {
    timestamp: new Date().toISOString(),
    operador,
    sku: produto.sku,
    romaneio: produto.romaneio,
    caixa: produto.caixa,
    grupo: parseInt(grupo),
    status: "RETIRADO"
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/retiradas`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(await res.text());
    console.log("✅ Retirada registrada:", produto.sku);

  } catch (err) {
    console.error("❌ Erro ao registrar retirada:", err.message);
    alert("Erro ao registrar retirada no Supabase.");
  }
}

function atualizarInterface() {
  const cardsDiv = document.getElementById("cards");
  cardsDiv.innerHTML = "";

  produtos.forEach(p => {
    const card = document.createElement("div");
    card.className = "card card-produto mb-4 p-3";
    card.innerHTML = `
      <div class="row">
        <div class="col-md-4">
          <img src="${p.imagem || 'https://via.placeholder.com/120'}" class="img-fluid card-img-produto">
        </div>
        <div class="col-md-8">
          <p class="texto-endereco">${p.endereco || "Sem endereço"}</p>
          <p><strong>SKU:</strong> ${p.sku}</p>
          <p><strong>Produto:</strong> ${p.descricao || "—"}</p>
          <p><strong>Coleção:</strong> ${p.colecao || "—"}</p>
        </div>
      </div>`;
    cardsDiv.appendChild(card);
  });

  const total = produtos.length + retirados.length;
  const perc = total ? Math.round((retirados.length / total) * 100) : 0;
  const barra = document.getElementById("progressoPicking");
  barra.style.width = `${perc}%`;
  barra.textContent = `${retirados.length}/${total} • ${perc}%`;
}

function gerarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFont("helvetica", "bold");
  doc.text("Resumo de Picking", 20, 20);
  doc.setFont("helvetica", "normal");

  retirados.forEach((p, i) => {
    doc.text(`${i + 1}. SKU: ${p.sku} • Produto: ${p.descricao || "—"} • Caixa: ${p.caixa}`, 20, 30 + i * 8);
  });

  doc.save("resumo_picking.pdf");
}

async function desfazerRetirada(sku, romaneio, grupo) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/retiradas?sku=eq.${sku}&romaneio=eq.${romaneio}&grupo=eq.${grupo}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });

  if (res.ok) {
    alert("🗑️ Retirada desfeita.");
  } else {
    alert("❌ Erro ao desfazer retirada.");
  }
}

function zerarEndereco(endereco, operador) {
  const match = endereco.match(/A(\d+)-B(\d+)-R(\d+)/);
  if (!match) return alert("Endereço inválido");

  const ws = `${match[1]}-${match[2]}-${match[3]}`;
  const url = `https://script.google.com/macros/s/AKfycbzTnmicSr-pLNzLN5BmZmU31Bd3Fem2QZqbHAlMC78yDfNeWdJXfPtF9w/exec?ID=1CuMvGDxbquqG9oKR45tHwuHtpxZLAgDayvbPCdPpTCQ&WS=${ws}&func=Update&ENDERECO=${encodeURIComponent(endereco)}&SKU=VAZIO&OPERADOR=${encodeURIComponent(operador)}&TIME=${encodeURIComponent(new Date().toISOString())}`;

  fetch(url)
    .then(r => r.text())
    .then(res => alert("✅ Endereço marcado para zeramento"))
    .catch(() => alert("Erro ao zerar endereço"));
}
