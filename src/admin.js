// src/admin.js
import { supabase } from "./services/supabase.js";

// ========== KPIs ==========
async function carregarKPIs() {
  // Total de pedidos e peças vem da view_produtividade_operador
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: produtividade, error } = await supabase
    .from("view_produtividade_operador")
    .select("operador, dia, qtd_pedidos, pecas_processadas")
    .eq("dia", hoje);

  if (error) {
    console.error("❌ Erro ao carregar KPIs:", error);
    return;
  }

  const totalPedidos = produtividade.reduce(
    (acc, p) => acc + (p.qtd_pedidos || 0),
    0
  );
  const totalPecas = produtividade.reduce(
    (acc, p) => acc + (p.pecas_processadas || 0),
    0
  );
  const operadoresUnicos = produtividade.length;

  document.getElementById("kpiPedidos").textContent = totalPedidos;
  document.getElementById("kpiPecas").textContent = totalPecas;
  document.getElementById("kpiOperadores").textContent = operadoresUnicos;
}

// ========== Gráficos ==========
async function carregarGraficos() {
  // 📊 Pedidos por hora
  const { data: pedidosHora, error: errHora } = await supabase
    .from("view_pedidos_por_hora")
    .select("hora, qtd_pedidos");

  if (errHora) {
    console.error("❌ Erro ao carregar pedidos/hora:", errHora);
  } else {
    new Chart(document.getElementById("chartPedidosHora"), {
      type: "bar",
      data: {
        labels: pedidosHora.map((r) => new Date(r.hora).getHours() + "h"),
        datasets: [
          {
            label: "Pedidos",
            data: pedidosHora.map((r) => r.qtd_pedidos),
            backgroundColor: "#1c3f60",
          },
        ],
      },
    });
  }

  // 🏆 Ranking de operadores
  const { data: ranking, error: errRank } = await supabase
    .from("view_ranking_operadores")
    .select("operador, total_pecas");

  if (errRank) {
    console.error("❌ Erro ao carregar ranking operadores:", errRank);
  } else {
    new Chart(document.getElementById("chartRanking"), {
      type: "pie",
      data: {
        labels: ranking.map((r) => r.operador),
        datasets: [
          {
            data: ranking.map((r) => r.total_pecas),
            backgroundColor: ["#1c3f60", "#2e7d32", "#c62828", "#ffc107"],
          },
        ],
      },
    });
  }
}

// ========== Init ==========
async function inicializarAdmin() {
  await carregarKPIs();
  await carregarGraficos();

  // Atualiza automaticamente a cada 1 minuto
  setInterval(async () => {
    await carregarKPIs();
    await carregarGraficos();
  }, 60000);
}

window.addEventListener("load", inicializarAdmin);
