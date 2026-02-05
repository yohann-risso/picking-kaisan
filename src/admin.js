// src/admin.js
import { supabase } from "./services/supabase.js";

// =======================
// Utils
// =======================
function isoHoje() {
  // yyyy-mm-dd (sem timezone surpresa)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoNDiasAtras(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function semanaIniISO() {
  // Semana começando na segunda
  const d = new Date();
  const day = d.getDay(); // 0 dom, 1 seg...
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function hFromSeconds(v) {
  const n = Number(v || 0);
  return n / 3600;
}

function fmtNum(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toFixed(digits);
}

function fmtDateTimeBR(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function badgeFator(f) {
  const x = Number(f);
  if (!Number.isFinite(x)) return { cls: "text-bg-secondary", txt: "—" };
  if (x <= 1.3) return { cls: "text-bg-success", txt: "🟢 OK" };
  if (x <= 1.6) return { cls: "text-bg-warning", txt: "🟡 Atenção" };
  if (x > 2.0) return { cls: "text-bg-danger", txt: "🔥 Crítico" };
  return { cls: "text-bg-danger", txt: "🔴 Ruim" };
}

function grupoStatusPorRecencia(tsUltimo) {
  const t = new Date(tsUltimo).getTime();
  if (!Number.isFinite(t)) return { cls: "text-bg-secondary", txt: "—" };

  const diffMin = (Date.now() - t) / 60000;
  if (diffMin <= 7) return { cls: "text-bg-success", txt: "Ativo" };
  if (diffMin <= 20) return { cls: "text-bg-warning", txt: "Oscilando" };
  return { cls: "text-bg-secondary", txt: "Parado" };
}

async function listarRomaneiosRecentes(limit = 20) {
  const { data, error } = await supabase
    .from("produtos")
    .select("romaneio, updated_at")
    .not("romaneio", "is", null)
    .neq("romaneio", "")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const uniq = [];
  const seen = new Set();
  for (const r of data || []) {
    if (!seen.has(r.romaneio)) {
      seen.add(r.romaneio);
      uniq.push(r.romaneio);
    }
  }
  return uniq;
}

// =======================
// Chart mgmt (evita leak)
// =======================
let chartRankingFator = null;
let chartRitmo = null;

function destroyCharts() {
  if (chartRankingFator) chartRankingFator.destroy();
  if (chartRitmo) chartRitmo.destroy();
  chartRankingFator = null;
  chartRitmo = null;
}

function renderCharts(rows) {
  destroyCharts();

  // Ranking por fator (top 10)
  const top = [...rows]
    .sort((a, b) => Number(b.fator_vs_ideal_p50) - Number(a.fator_vs_ideal_p50))
    .slice(0, 10);

  chartRankingFator = new Chart(document.getElementById("chartRankingFator"), {
    type: "bar",
    data: {
      labels: top.map((r) => `${r.operador} | G${r.grupo}`),
      datasets: [
        {
          label: "Fator vs Ideal p50",
          data: top.map((r) => Number(r.fator_vs_ideal_p50)),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });

  // Ritmo p50 vs p90 (top 10 por gap)
  const topGap = [...rows]
    .sort(
      (a, b) => Number(b.gap_vs_ideal_p50_seg) - Number(a.gap_vs_ideal_p50_seg),
    )
    .slice(0, 10);

  chartRitmo = new Chart(document.getElementById("chartRitmo"), {
    type: "bar",
    data: {
      labels: topGap.map((r) => `${r.operador} | G${r.grupo}`),
      datasets: [
        {
          label: "p50 (s)",
          data: topGap.map((r) => Number(r.tps_p50_seg)),
        },
        {
          label: "p90 (s)",
          data: topGap.map((r) => Number(r.tps_p90_seg)),
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

// =======================
// Data loaders
// =======================
async function carregarIdealRealRPC({ dtIni, dtFim, minItens, cutoff }) {
  const { data, error } = await supabase.rpc(
    "fn_tempo_ideal_exec_por_periodo",
    {
      p_data_ini: dtIni,
      p_data_fim: dtFim,
      p_min_itens: Number(minItens),
      p_cutoff_delta_seg: Number(cutoff),
    },
  );

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function carregarGruposHoje() {
  // Hoje (America/Sao_Paulo) como recorte simples no front:
  // no banco a coluna é "timestamp without time zone", então o mais seguro é filtrar por faixa ISO local.
  const hoje = isoHoje();
  const dtIni = `${hoje}T00:00:00`;
  const dtFim = `${hoje}T23:59:59`;

  // Puxa eventos do dia e agrega no front (leve e suficiente).
  // Importante: filtra status=RETIRADO e grupo not null.
  const { data, error } = await supabase
    .from("retiradas")
    .select("grupo, operador, timestamp")
    .eq("status", "RETIRADO")
    .not("grupo", "is", null)
    .gte("timestamp", dtIni)
    .lte("timestamp", dtFim)
    .order("timestamp", { ascending: false })
    .limit(20000);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];

  const map = new Map(); // grupo -> agg
  for (const r of rows) {
    const g = Number(r.grupo);
    if (!Number.isFinite(g)) continue;

    if (!map.has(g)) {
      map.set(g, {
        grupo: g,
        retiradas: 0,
        operadoresSet: new Set(),
        tsUltimo: r.timestamp,
      });
    }

    const agg = map.get(g);
    agg.retiradas += 1;
    if (r.operador) agg.operadoresSet.add(r.operador);
    // como veio order desc, o primeiro já é o último, mas garante:
    if (!agg.tsUltimo || new Date(r.timestamp) > new Date(agg.tsUltimo)) {
      agg.tsUltimo = r.timestamp;
    }
  }

  const out = [...map.values()].map((x) => ({
    grupo: x.grupo,
    retiradas: x.retiradas,
    operadores: x.operadoresSet.size,
    tsUltimo: x.tsUltimo,
  }));

  out.sort((a, b) => {
    // prioriza ativo (último ts) e volume
    const ta = new Date(a.tsUltimo).getTime();
    const tb = new Date(b.tsUltimo).getTime();
    if (tb !== ta) return tb - ta;
    return b.retiradas - a.retiradas;
  });

  return out;
}

// =======================
// Renderers
// =======================
function renderKPIs({ totalRetiradasPeriodo, operadoresAtivos, gruposAtivos }) {
  document.getElementById("kpiRetiradas").textContent = totalRetiradasPeriodo;
  document.getElementById("kpiOperadores").textContent = operadoresAtivos;
  document.getElementById("kpiGrupos").textContent = gruposAtivos;
}

function renderTabelaIdealReal(rows) {
  const tbody = document.getElementById("tblIdealReal");

  tbody.innerHTML = rows
    .sort((a, b) => Number(b.fator_vs_ideal_p50) - Number(a.fator_vs_ideal_p50))
    .map((r) => {
      const realH = hFromSeconds(r.tempo_real_exec_seg);
      const idealH = hFromSeconds(r.tempo_ideal_p50_seg);
      const gapH = hFromSeconds(r.gap_vs_ideal_p50_seg);
      const fator = Number(r.fator_vs_ideal_p50);

      const b = badgeFator(fator);

      return `
        <tr>
          <td>${r.operador || "-"}</td>
          <td><span class="badge text-bg-primary">G${r.grupo}</span></td>
          <td class="text-end">${r.itens ?? "-"}</td>
          <td class="text-end">${fmtNum(realH, 2)}</td>
          <td class="text-end">${fmtNum(idealH, 2)}</td>
          <td class="text-end">${fmtNum(gapH, 2)}</td>
          <td class="text-end fw-bold">${fmtNum(fator, 2)}</td>
          <td class="text-end">${fmtNum(r.tps_p50_seg, 1)}</td>
          <td class="text-end">${fmtNum(r.tps_p90_seg, 1)}</td>
          <td><span class="badge ${b.cls}">${b.txt}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderTabelaGruposHoje(rows, locksAtivos) {
  const tbody = document.getElementById("tblGruposHoje");

  tbody.innerHTML = rows
    .map((r) => {
      const st = grupoStatusFinal(r.grupo, r.tsUltimo, locksAtivos);
      return `
        <tr>
          <td><span class="badge text-bg-primary">G${r.grupo}</span></td>
          <td class="fw-semibold">${r.retiradas}</td>
          <td>${r.operadores}</td>
          <td class="text-muted">${fmtDateTimeBR(r.tsUltimo)}</td>
          <td><span class="badge ${st.cls}">${st.txt}</span></td>
        </tr>
      `;
    })
    .join("");
}

// =======================
// Orquestração
// =======================
let timer = null;

function setStatus(txt, cls = "text-bg-secondary") {
  const el = document.getElementById("adminStatus");
  el.className = `badge ${cls}`;
  el.textContent = txt;
}

function getFiltros() {
  const dtIni = document.getElementById("dtIni").value;
  const dtFim = document.getElementById("dtFim").value;
  const minItens = document.getElementById("minItens").value || 50;
  const cutoff = document.getElementById("cutoff").value || 300;

  return { dtIni, dtFim, minItens, cutoff };
}

function grupoStatusFinal(grupo, tsUltimo, locksAtivos) {
  if (locksAtivos?.has(grupo)) {
    return { cls: "text-bg-success", txt: "Em execução" };
  }

  const t = new Date(tsUltimo).getTime();
  if (!Number.isFinite(t)) return { cls: "text-bg-secondary", txt: "Inativo" };

  const diffMin = (Date.now() - t) / 60000;

  // ajuste fino:
  if (diffMin <= 15) return { cls: "text-bg-warning", txt: "Sem atividade" };
  return { cls: "text-bg-primary", txt: "Finalizado" };
}

async function atualizarTudo() {
  try {
    setStatus("🔁", "text-bg-secondary");

    const { dtIni, dtFim, minItens, cutoff } = getFiltros();

    const idealReal = await carregarIdealRealRPC({
      dtIni,
      dtFim,
      minItens,
      cutoff,
    });
    const gruposHoje = await carregarGruposHoje();
    const locksAtivos = await carregarLocksAtivos();

    // NOVO: erros no período
    const erros = await carregarErrosPorPeriodo(dtIni, dtFim);
    renderTabelaErros(erros);

    // soma erros (quantidade total)
    const totalErrosQtd = erros.reduce(
      (acc, e) => acc + Number(e.quantidade || 0),
      0,
    );

    // seus KPIs atuais
    const totalRetiradasPeriodo = idealReal.reduce(
      (acc, r) => acc + Number(r.itens || 0),
      0,
    );
    const operadoresAtivos = new Set(
      idealReal.map((r) => r.operador).filter(Boolean),
    ).size;
    const gruposAtivos = new Set(
      idealReal.map((r) => r.grupo).filter((g) => g != null),
    ).size;

    // exemplo: “erros por mil itens”
    const errosPorMil = calcErrosPorMil({
      totalErrosQtd,
      totalRetiradasPeriodo,
    });

    // se você quiser exibir, crie um card no HTML e atualize aqui:
    const el = document.getElementById("kpiErrosPorMil");
    if (el) el.textContent = errosPorMil == null ? "-" : errosPorMil.toFixed(1);

    renderKPIs({ totalRetiradasPeriodo, operadoresAtivos, gruposAtivos });

    renderTabelaGruposHoje(gruposHoje);
    renderTabelaIdealReal(idealReal);

    renderCharts(idealReal);

    setStatus("✅", "text-bg-success");
  } catch (e) {
    console.error("❌ Admin atualizarTudo erro:", e);
    setStatus("❌", "text-bg-danger");
  }
}

function configurarBotoesRapidos() {
  const dtIni = document.getElementById("dtIni");
  const dtFim = document.getElementById("dtFim");

  document.getElementById("btnSemana").addEventListener("click", () => {
    dtIni.value = semanaIniISO();
    dtFim.value = isoHoje();
    atualizarTudo();
  });

  document.getElementById("btn3dias").addEventListener("click", () => {
    dtIni.value = isoNDiasAtras(3);
    dtFim.value = isoHoje();
    atualizarTudo();
  });

  document.getElementById("btnHoje").addEventListener("click", () => {
    dtIni.value = isoHoje();
    dtFim.value = isoHoje();
    atualizarTudo();
  });

  document
    .getElementById("btnRefresh")
    .addEventListener("click", atualizarTudo);
}

function configurarAutoRefresh() {
  const chk = document.getElementById("autoRefresh");

  const ligar = () => {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      atualizarTudo();
    }, 60000);
  };

  const desligar = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  chk.addEventListener("change", () => {
    if (chk.checked) ligar();
    else desligar();
  });

  if (chk.checked) ligar();
}

function initDefaultDatas() {
  document.getElementById("dtIni").value = semanaIniISO();
  document.getElementById("dtFim").value = isoHoje();
}

window.addEventListener("load", async () => {
  initDefaultDatas();
  initErroFormDefaults();
  await carregarAutocompleteRomaneios();

  const form = document.getElementById("formErro");
  const btnCarregar = document.getElementById("btnCarregarErros");

  form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      setErroMsg("Salvando...");

      const payload = {
        romaneio: document.getElementById("erroRomaneio").value.trim(),
        data: document.getElementById("erroData").value,
        tipo_erro: document.getElementById("erroTipo").value,
        quantidade: Number(document.getElementById("erroQtd").value || 1),
        conferente: document.getElementById("erroConferente").value.trim(),
        observacao: document.getElementById("erroObs").value.trim() || null,
      };

      if (!payload.romaneio) throw new Error("Romaneio obrigatório");
      if (!payload.data) throw new Error("Data obrigatória");
      if (!payload.tipo_erro) throw new Error("Tipo obrigatório");
      if (!payload.conferente) throw new Error("Conferente obrigatório");

      // ✅ valida romaneio e vincula ao grupo usando vw_romaneio_grupo
      const grupo = await resolverGrupoPorRomaneio(payload.romaneio);
      if (!grupo)
        throw new Error("Romaneio não encontrado (sem vínculo em produtos).");
      payload.grupo = grupo;

      await salvarErroRomaneio(payload);

      document.getElementById("erroTipo").value = "";
      document.getElementById("erroQtd").value = 1;
      document.getElementById("erroObs").value = "";
      document.getElementById("erroRomaneio").focus();

      setErroMsg("✅ Salvo!");
      await atualizarTudo();
      setTimeout(() => setErroMsg(""), 2500);
    } catch (e) {
      console.error(e);
      setErroMsg(`❌ ${e.message || "Erro ao salvar"}`);
    }
  });

  btnCarregar?.addEventListener("click", async () => {
    await atualizarTudo();
  });

  configurarBotoesRapidos();
  configurarAutoRefresh();
  await atualizarTudo();
});

function setErroMsg(txt) {
  const el = document.getElementById("erroMsg");
  if (el) el.textContent = txt || "";
}

function initErroFormDefaults() {
  const dt = document.getElementById("erroData");
  if (dt) dt.value = isoHoje();
}

async function salvarErroRomaneio(payload) {
  const { error } = await supabase.from("erros_romaneio").insert(payload);
  if (error) throw error;
}

async function carregarErrosPorPeriodo(dtIni, dtFim) {
  // dtIni / dtFim = yyyy-mm-dd
  const { data, error } = await supabase
    .from("erros_romaneio")
    .select(
      "id, romaneio, data, tipo_erro, quantidade, conferente, observacao, created_at, grupo, operador",
    )
    .gte("data", dtIni)
    .lte("data", dtFim)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return data || [];
}

async function carregarAutocompleteRomaneios() {
  const dl = document.getElementById("dlRomaneios");
  if (!dl) return;

  const roms = await listarRomaneiosRecentes(30);
  dl.innerHTML = roms.map((r) => `<option value="${r}"></option>`).join("");
}

function renderTabelaErros(rows) {
  const tbody = document.getElementById("tblErros");
  if (!tbody) return;

  tbody.innerHTML = (rows || [])
    .map((r) => {
      const badgeGrupo = r.grupo
        ? `<span class="badge text-bg-primary">G${r.grupo}</span>`
        : "-";

      const badgeTipo = r.tipo_erro
        ? `<span class="badge text-bg-secondary">${r.tipo_erro}</span>`
        : "-";

      return `
        <tr>
          <td class="text-muted">${r.data || "-"}</td>
          <td class="fw-semibold">${r.romaneio || "-"}</td>
          <td>${badgeTipo}</td>
          <td>${badgeGrupo}</td>
          <td>${r.operador || "-"}</td>
          <td class="text-end">${r.quantidade ?? 0}</td>
          <td>${r.conferente || "-"}</td>
          <td class="text-muted">${r.observacao || ""}</td>
        </tr>
      `;
    })
    .join("");
}

// Métrica de qualidade básica: erros por 1.000 retiradas (ou por 1.000 itens)
function calcErrosPorMil({ totalErrosQtd, totalRetiradasPeriodo }) {
  const denom = Number(totalRetiradasPeriodo || 0);
  if (denom <= 0) return null;
  return (Number(totalErrosQtd || 0) / denom) * 1000;
}

async function resolverGrupoPorRomaneio(romaneio) {
  const { data, error } = await supabase
    .from("vw_romaneio_grupo")
    .select("grupo")
    .eq("romaneio", romaneio)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.grupo ?? null;
}

async function carregarLocksAtivos() {
  const { data, error } = await supabase.rpc("fn_grupos_com_lock_ativo");

  if (error) throw error;

  const set = new Set((data || []).map((r) => Number(r.grupo)));
  return set;
}
