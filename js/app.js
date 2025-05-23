// Supabase config
const SUPABASE_URL = "https://kinpwzuobsmfkjefnrdc.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpbnB3enVvYnNtZmtqZWZucmRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5OTgwMjcsImV4cCI6MjA2MzU3NDAyN30.btmwaLMSnXCmvKHQvYnw7ZngONqoejqnhbvazLhD1Io";

let produtos = [], retirados = [], tempoInicio = null;

// === 1. Carrega GRUPOS dinâmicos do Supabase ===
async function carregarGrupos() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/produtos?select=grupo`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    const dados = await res.json();
    const gruposUnicos = [...new Set(dados.map(d => parseInt(d.grupo, 10)))].sort((a, b) => a - b);
    const select = document.getElementById("grupo");

    select.innerHTML = gruposUnicos.map(g => `<option value="${g}">${g}</option>`).join("");
    console.log("✅ Grupos carregados:", gruposUnicos);
  } catch (err) {
    console.error("❌ Erro ao carregar grupos:", err);
  }
}

// === 2. Carrega OPERADORES fixos ===
const operadores = [
  "Alan Ramos", "Anderson Dutra", "Arthur Oliveira", "Felipe Moraes",
  "Filipe Silva", "Gabriel Lagoa", "João Alves", "Kaique Teixeira",
  "Marrony Portugal", "Nalbert Pereira", "Rodrigo Novaes",
  "Rony Côrrea", "Ykaro Oliveira", "Yohann Risso"
];

function carregarOperadores() {
  const select = document.getElementById("operador");
  select.innerHTML = operadores.map(op => `<option value="${op}">${op}</option>`).join("");
}

// === 3. Carrega produtos de um grupo específico ===
async function carregarProdutos() {
  const grupo = document.getElementById("grupo").value;
  const operador = document.getElementById("operador").value;

  if (!grupo || !operador) return alert("⚠️ Selecione grupo e operador");

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/produtos?grupo=eq.${grupo}&status=neq.RETIRADO&select=*`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    produtos = ordenarPorEndereco(await res.json());
    retirados = [];
    tempoInicio = new Date();
    atualizarInterface();

    console.log("✅ Produtos carregados:", produtos.length);
  } catch (err) {
    console.error("❌ Erro ao carregar produtos:", err);
    alert("Erro ao buscar dados do Supabase");
  }
}

// === 4. Ordenação por endereço lógico ===
function ordenarPorEndereco(lista) {
  return lista.sort((a, b) => {
    const e = p => {
      const m = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(p.endereco || "");
      return m ? m.slice(1).map(Number) : [999, 999, 999, 999, 999];
    };
    const ea = e(a), eb = e(b);
    for (let i = 0; i < ea.length; i++) {
      if (ea[i] !== eb[i]) return ea[i] - eb[i];
    }
    return 0;
  });
}

// === 5. Bipagem de produto (via SKU ou EAN) ===
function biparProduto() {
  const input = document.getElementById("skuInput").value.trim().toUpperCase();
  const grupo = document.getElementById("grupo").value;
  const operador = document.getElementById("operador").value;

  const produto = produtos.find(p => p.sku?.toUpperCase() === input || p.ean?.toUpperCase() === input);
  if (!produto) return alert("❌ Produto não encontrado.");

  registrarRetirada(produto, operador, grupo);
  retirados.push(produto);
  produtos = produtos.filter(p => p.sku !== produto.sku);

  document.getElementById("skuInput").value = "";
  atualizarInterface();
}

// === 6. Registrar retirada ===
async function registrarRetirada(p, operador, grupo) {
  const payload = {
    timestamp: new Date().toISOString(),
    operador,
    sku: p.sku,
    romaneio: p.romaneio,
    caixa: p.caixa,
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
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error("Falha ao registrar retirada");
    console.log("✅ Retirada registrada:", p.sku);
  } catch (err) {
    alert("❌ Erro ao registrar retirada.");
    console.error(err);
  }
}

// === 7. Atualiza cards e barra de progresso ===
function atualizarInterface() {
  const div = document.getElementById("cards");
  div.innerHTML = "";

  produtos.forEach(p => {
    const total = ['a', 'b', 'c', 'd'].reduce((s, c) => s + (+p[`distribuicao_${c}`] || 0), 0);

    const el = document.createElement("div");
    el.className = "card card-produto mb-3 p-3";
    el.innerHTML = `
      <div class="row">
        <div class="col-md-4 text-center">
          <img src="${p.imagem || 'https://via.placeholder.com/150'}" class="img-fluid card-img-produto" />
        </div>
        <div class="col-md-8">
          <p class="texto-endereco">📦 ${p.endereco || "Sem endereço"}</p>
          <p><strong>SKU:</strong> ${p.sku}</p>
          <p><strong>Produto:</strong> ${p.descricao || "—"}</p>
          <p><strong>Coleção:</strong> ${p.colecao || "—"}</p>
          <p><strong>Total:</strong> ${total}</p>
        </div>
      </div>
    `;
    div.appendChild(el);
  });

  const total = produtos.length + retirados.length;
  const perc = total ? Math.round((retirados.length / total) * 100) : 0;
  const barra = document.getElementById("progressoPicking");
  barra.style.width = `${perc}%`;
  barra.textContent = `${retirados.length}/${total} • ${perc}%`;
}

// === 8. Retirada reversa ===
async function desfazerRetirada(sku, romaneio, grupo) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/retiradas?sku=eq.${sku}&romaneio=eq.${romaneio}&grupo=eq.${grupo}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });

  if (res.ok) alert("🗑️ Retirada desfeita");
  else alert("❌ Falha ao desfazer retirada");
}

// === 9. Zerar endereço via GAS externo ===
function zerarEndereco(endereco, operador) {
  const match = endereco.match(/A(\d+)-B(\d+)-R(\d+)/);
  if (!match) return alert("Endereço inválido");

  const ws = `${match[1]}-${match[2]}-${match[3]}`;
  const url = `https://script.google.com/macros/s/AKfycbzTnmicSr-pLNzLN5BmZmU31Bd3Fem2QZqbHAlMC78yDfNeWdJXfPtF9w/exec?ID=1CuMvGDxbquqG9oKR45tHwuHtpxZLAgDayvbPCdPpTCQ&WS=${ws}&func=Update&ENDERECO=${encodeURIComponent(endereco)}&SKU=VAZIO&OPERADOR=${encodeURIComponent(operador)}&TIME=${encodeURIComponent(new Date().toISOString())}`;

  fetch(url)
    .then(r => r.text())
    .then(() => alert("✅ Endereço zerado"))
    .catch(() => alert("❌ Erro ao zerar endereço"));
}

// === 10. Executa na inicialização ===
document.addEventListener("DOMContentLoaded", () => {
  carregarGrupos();
  carregarOperadores();
});