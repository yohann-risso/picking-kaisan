import { state, getHeaders } from "../config.js";
import { atualizarInterface } from "../core/interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { toast } from "../components/Toast.js";
import { iniciarCronometro } from "../core/cronometro.js";
import { calcularTempoIdeal } from "../utils/format.js";
import { inserirProdutoNaRota } from "../utils/roteamento.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  window.env?.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  window.env?.SUPABASE_KEY || import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function carregarGrupos() {
  const pageSize = 1000;
  let offset = 0;
  const todosGrupos = [];
  const maxPaginas = 100;

  for (let i = 0; i < maxPaginas; i++) {
    const query = `/rest/v1/produtos?select=grupo&limit=${pageSize}&offset=${offset}`;
    const url = `/api/proxy?endpoint=${encodeURIComponent(query)}`;
    const res = await fetch(url);

    if (!res.ok) {
      const erro = await res.text();
      throw new Error(`Erro ao carregar grupos: ${erro}`);
    }

    const dados = await res.json();

    if (!Array.isArray(dados) || dados.length === 0) {
      console.log(`✅ Fim da paginação no offset ${offset}`);
      break;
    }

    console.log(
      `🔁 Página ${i + 1} (offset ${offset}) → ${dados.length} registros`
    );
    todosGrupos.push(...dados.map((d) => d.grupo));
    offset += pageSize;
  }

  const grupos = [
    ...new Set(
      todosGrupos
        .map((g) => Number(String(g).trim()))
        .filter((g) => Number.isInteger(g) && g > 0)
    ),
  ].sort((a, b) => a - b);

  console.log("✅ Grupos finais únicos:", grupos);
  return grupos;
}

let refsCarregadas = false;

export async function carregarRefsPorGrupo(grupo) {
  // 1. Buscar SKUs únicos do grupo atual
  const { data: produtos, error: erroProdutos } = await supabase
    .from("produtos")
    .select("sku")
    .eq("grupo", grupo);

  if (erroProdutos) {
    console.error("❌ Erro ao buscar SKUs:", erroProdutos);
    return;
  }

  const skuList = [
    ...new Set(produtos.map((p) => p.sku?.trim().toUpperCase())),
  ].filter(Boolean);

  if (!skuList.length) {
    console.warn("⚠️ Nenhum SKU encontrado para o grupo:", grupo);
    return;
  }

  // 2. Buscar referências apenas dos SKUs do grupo
  const { data: refs, error: erroRefs } = await supabase
    .from("produtos_ref")
    .select("sku, imagem, colecao")
    .in("sku", skuList);

  if (erroRefs) {
    console.error("❌ Erro ao buscar produtos_ref:", erroRefs);
    return;
  }

  // 3. Montar o mapa
  window.mapaRefGlobal = new Map();

  refs.forEach((r) => {
    const key = r.sku.trim().toUpperCase();
    window.mapaRefGlobal.set(key, r);
    window.mapaRefGlobal.set(key.toLowerCase(), r); // tolerância se for necessário
  });

  console.log("✅ mapaRefGlobal carregado:", window.mapaRefGlobal.size);
}

export async function registrarRetirada(prod, operador, grupo, caixa) {
  const timestamp = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .replace(" ", "T");

  const payload = {
    timestamp,
    operador,
    sku: prod.sku,
    romaneio: prod.romaneio,
    caixa,
    grupo: parseInt(grupo),
    status: "RETIRADO",
  };

  console.log("📤 Enviando retirada:", payload);

  try {
    const res = await fetch("/api/proxy?endpoint=/rest/v1/retiradas", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText);
    }

    console.log("✅ Retirada registrada com sucesso!");
  } catch (err) {
    console.error("❌ Falha ao registrar retirada:", err);
    toast("Erro ao registrar retirada", "error");
  }
}

export async function desfazerRetirada(sku, romaneio, caixa, grupo) {
  try {
    const query = `/rest/v1/retiradas?sku=eq.${sku}&romaneio=eq.${romaneio}&caixa=eq.${caixa}&grupo=eq.${grupo}`;
    const res = await fetch(
      `/api/proxy?endpoint=${encodeURIComponent(query)}`,
      {
        method: "DELETE",
        headers: getHeaders(),
      }
    );
    if (!res.ok) throw new Error(await res.text());

    // Encontrar o item exato em state.retirados
    const idx = state.retirados.findIndex(
      (p) =>
        p.sku === sku &&
        p.romaneio == romaneio &&
        p.caixa === caixa &&
        p.grupo == grupo
    );

    if (idx !== -1) {
      const item = state.retirados.splice(idx, 1)[0];
      item.distribuicaoAtual = { ...item.distribuicaoOriginal };
      inserirProdutoNaRota(item);
      salvarProgressoLocal();
      atualizarInterface();
      toast(
        `✔️ Retirada de ${sku} (Romaneio ${romaneio}) desfeita.`,
        "success"
      );
    } else {
      console.warn(
        `❌ Item não encontrado para desfazer: ${sku} | ${romaneio} | ${caixa}`
      );
      toast("Item não encontrado para desfazer.", "warning");
    }
  } catch (e) {
    console.error("Erro ao desfazer retirada:", e);
    toast("❌ Não foi possível desfazer retirada.", "error");
  }
}

export async function carregarProdutos() {
  console.log("⚙️ carregarProdutos chamado");

  document.getElementById("loaderGlobal").style.display = "flex";

  const grupo = window.grupoSelecionado;
  const operador = window.operadorSelecionado;

  if (!grupo || !operador) {
    console.warn("🚫 Grupo ou operador não definidos.");
    document.getElementById("loaderGlobal").style.display = "none";
    return toast("Grupo ou operador não selecionado", "warning");
  }

  document.getElementById("btnFinalizar").classList.remove("d-none");
  document.getElementById("card-tempo").classList.remove("d-none");

  const headers = getHeaders();

  try {
    // 1. Buscar todos os produtos do grupo
    const resProdutos = await fetch(
      `/api/proxy?endpoint=/rest/v1/produtos?grupo=eq.${grupo}&select=*`,
      { headers }
    );
    const linhas = await resProdutos.json();

    // 2. Buscar retiradas já feitas
    const resRet = await fetch(
      `/api/proxy?endpoint=/rest/v1/retiradas?grupo=eq.${grupo}&select=sku,caixa,romaneio`,
      { headers }
    );
    const retiradas = await resRet.json();

    // 3. Mapear retiradas por sku + romaneio
    const mapaRetiradas = new Map();
    retiradas.forEach((r) => {
      const key = `${r.sku.trim().toUpperCase()}__${r.romaneio}`;
      if (!mapaRetiradas.has(key)) mapaRetiradas.set(key, []);
      mapaRetiradas.get(key).push(r.caixa.toUpperCase());
    });

    const mapaRef = window.mapaRefGlobal || new Map();
    state.produtos = [];
    state.retirados = [];
    const mapaSKUs = {};

    // --- 3A. Montar mapaSKUs com distribuição original ---
    for (const linha of linhas) {
      const sku = (linha.sku || "").trim().toUpperCase();
      const romaneio = linha.romaneio;
      const caixa = (linha.caixa || "").toUpperCase();
      const qtd = parseInt(linha.qtd || 0, 10);
      const enderecoOriginal = linha.endereco || "SEM LOCAL";
      const [endPrimario = "SEM ENDEREÇO"] = enderecoOriginal
        .split("•")
        .map((e) => e.trim());

      const ref = mapaRef.get(sku);
      const key = `${sku}__${romaneio}`;

      if (!mapaSKUs[key]) {
        const match = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(endPrimario);
        mapaSKUs[key] = {
          ...linha,
          sku,
          romaneio,
          endereco: enderecoOriginal, // será atualizado depois
          imagem: ref?.imagem || "https://placehold.co/120x120?text=Sem+Img",
          colecao: ref?.colecao || "—",
          distribuicaoAtual: { A: 0, B: 0, C: 0, D: 0 },
          distribuicaoOriginal: { A: 0, B: 0, C: 0, D: 0 },
          ordemEndereco: match
            ? match.slice(1).map(Number)
            : [999, 999, 999, 999, 999],
        };
      }

      const p = mapaSKUs[key];
      if (caixa === "A") p.distribuicaoOriginal.A += qtd;
      if (caixa === "B") p.distribuicaoOriginal.B += qtd;
      if (caixa === "C") p.distribuicaoOriginal.C += qtd;
      if (caixa === "D") p.distribuicaoOriginal.D += qtd;

      // Sempre mantenha atual sincronizado com original no início
      p.distribuicaoAtual = { ...p.distribuicaoOriginal };
    }

    // --- 3B. Aplicar retiradas + preencher state.produtos / state.retirados ---
    const skusPendentesSet = new Set();

    for (const prod of Object.values(mapaSKUs)) {
      const key = `${prod.sku}__${prod.romaneio}`;
      const caixasRetiradas = mapaRetiradas.get(key) || [];

      const retiradasPorCaixa = { A: 0, B: 0, C: 0, D: 0 };
      caixasRetiradas.forEach((caixa) => {
        const c = caixa.toUpperCase();
        if (["A", "B", "C", "D"].includes(c)) retiradasPorCaixa[c]++;
      });

      // Atualiza quantidade restante
      prod.distribuicaoAtual = {
        A: prod.distribuicaoOriginal.A - retiradasPorCaixa.A,
        B: prod.distribuicaoOriginal.B - retiradasPorCaixa.B,
        C: prod.distribuicaoOriginal.C - retiradasPorCaixa.C,
        D: prod.distribuicaoOriginal.D - retiradasPorCaixa.D,
      };

      const totalRestante =
        prod.distribuicaoAtual.A +
        prod.distribuicaoAtual.B +
        prod.distribuicaoAtual.C +
        prod.distribuicaoAtual.D;

      const totalRetirado =
        retiradasPorCaixa.A +
        retiradasPorCaixa.B +
        retiradasPorCaixa.C +
        retiradasPorCaixa.D;

      if (totalRetirado > 0) {
        const retirado = {
          ...structuredClone(prod),
          grupo,
          retiradas: retiradasPorCaixa,
        };
        state.retirados.push(retirado);
      }

      if (totalRestante > 0) {
        state.produtos.push(prod);
        skusPendentesSet.add(prod.sku); // 👈 só pendentes entram aqui
      }
    }

    // --- 4. Buscar endereços SOMENTE dos pendentes ---
    const listaSkusPendentes = [...skusPendentesSet].map((s) =>
      s.trim().toUpperCase()
    );
    const mapaEnderecosAtualizados = await obterEnderecosInteligente(
      listaSkusPendentes
    );

    // --- 5. Aplicar endereços atualizados nos produtos pendentes ---
    for (const prod of state.produtos) {
      const sku = prod.sku?.trim().toUpperCase();
      const enderecoGAS = mapaEnderecosAtualizados.get(sku);
      if (enderecoGAS && enderecoGAS !== prod.endereco) {
        prod.endereco = enderecoGAS;

        const [endPrimario = "SEM ENDEREÇO"] = enderecoGAS
          .split("•")
          .map((e) => e.trim());
        const match = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(endPrimario);
        prod.ordemEndereco = match
          ? match.slice(1).map(Number)
          : [999, 999, 999, 999, 999];
      }
    }

    // --- 6. Ordenar os produtos com base na posição atual do operador ---
    function compararOrdem(a, b) {
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
      }
      return 0;
    }

    // 🔄 Ponto de referência = último endereço retirado (ou início)
    const ultimaRetirada = state.retirados.at(-1);
    const posicaoAtual = ultimaRetirada?.ordemEndereco || [0, 0, 0, 0, 0];

    state.ordemAtual = posicaoAtual; // (para debug ou usos futuros)

    const aindaNaRota = [];
    const foraDaRota = [];

    for (const p of state.produtos) {
      const comp = compararOrdem(
        p.ordemEndereco || [999, 999, 999, 999, 999],
        posicaoAtual
      );
      if (comp >= 0) {
        aindaNaRota.push(p);
      } else {
        foraDaRota.push(p);
      }
    }

    aindaNaRota.sort((a, b) => compararOrdem(a.ordemEndereco, b.ordemEndereco));
    foraDaRota.sort((a, b) => compararOrdem(a.ordemEndereco, b.ordemEndereco));

    // 👉 Atualiza lista ordenada final
    state.produtos = [...aindaNaRota, ...foraDaRota];

    // 7. Calcular e armazenar total de peças (Fixo)
    const totalPecas = Object.values(mapaSKUs).reduce((acc, p) => {
      const dist = p.distribuicaoOriginal || { A: 0, B: 0, C: 0, D: 0 };
      return acc + dist.A + dist.B + dist.C + dist.D;
    }, 0);

    state.totalPecas = totalPecas;

    document.getElementById("ideal").textContent =
      calcularTempoIdeal(totalPecas);
    document.getElementById("qtdTotal").textContent = totalPecas;

    state.tempoInicio = new Date();
    iniciarCronometro();
    if (typeof window.atualizarFiltroBlocos === "function") {
      window.atualizarFiltroBlocos();
    }
    atualizarInterface();
    salvarProgressoLocal();
  } catch (err) {
    console.error("❌ Erro ao carregar produtos:", err);
    toast("Erro ao carregar dados do Supabase", "error");
  } finally {
    document.getElementById("loaderGlobal").style.display = "none";
  }
}

async function buscarEnderecoCacheSupabase(skus) {
  const { data, error } = await supabase
    .from("produtos_endereco_cache")
    .select("sku, endereco, valido_ate")
    .in("sku", skus);

  if (error) {
    console.warn("⚠️ Erro ao buscar cache Supabase:", error);
    return new Map();
  }

  const agora = Date.now();
  const mapa = new Map();

  data.forEach((r) => {
    const expira = r.valido_ate ? new Date(r.valido_ate).getTime() : 0;

    if (expira > agora) {
      // válido
      mapa.set(r.sku.trim().toUpperCase(), r.endereco);
    } else {
      // expirado → precisa revalidar com GAS
      console.log(`⏳ Cache expirado para SKU ${r.sku}`);
    }
  });

  return mapa;
}


async function salvarEnderecoCacheSupabase(sku, endereco) {
  const agora = Date.now();
  const validoAte = new Date(agora + 1 * 60 * 60 * 1000); // 1h

  await supabase.from("produtos_endereco_cache").upsert({
    sku,
    endereco,
    atualizado_em: new Date().toISOString(),
    valido_ate: validoAte.toISOString(),
  });
}

function cacheLocal_getEndereco(sku) {
  const data = JSON.parse(localStorage.getItem("cacheEnderecos") || "{}");
  const item = data[sku];

  if (!item) return null;

  const expirou = Date.now() - item.timestamp > 1 * 60 * 60 * 1000; // 1h
  return expirou ? null : item.endereco;
}

function cacheLocal_setEndereco(sku, endereco) {
  const data = JSON.parse(localStorage.getItem("cacheEnderecos") || "{}");
  data[sku] = {
    endereco,
    timestamp: Date.now(),
  };
  localStorage.setItem("cacheEnderecos", JSON.stringify(data));
}

async function promisePool(items, handler, concurrency = 10, onItemDone) {
  const queue = [...items];
  let active = 0;
  let completed = 0;

  return new Promise((resolve) => {
    const results = [];

    function next() {
      while (active < concurrency && queue.length > 0) {
        const item = queue.shift();
        active++;

        handler(item)
          .then((res) => {
            results.push({ item, res });

            completed++;
            if (onItemDone) onItemDone(completed, items.length);
          })
          .finally(() => {
            active--;
            if (queue.length === 0 && active === 0) resolve(results);
            else next();
          });
      }
    }

    next();
  });
}

async function obterEnderecosInteligente(listaSkus) {
  const skus = [
    ...new Set(listaSkus.map((s) => s?.trim().toUpperCase())),
  ].filter(Boolean);

  const resultados = new Map();

  // 📊 CONTADORES DE ORIGEM
  let usadosLocal = 0;
  let usadosSupabase = 0;
  let usadosGas = 0;

  // 1️⃣ Primeiro tenta LOCAL
  const faltandoLocal = [];
  for (const sku of skus) {
    const local = cacheLocal_getEndereco(sku);
    if (local) {
      resultados.set(sku, local);
      usadosLocal++;
    } else {
      faltandoLocal.push(sku);
    }
  }

  // 2️⃣ Depois tenta SUPABASE
  const mapaSupabase = await buscarEnderecoCacheSupabase(faltandoLocal);
  const faltandoSupabase = [];

  for (const sku of faltandoLocal) {
    if (mapaSupabase.has(sku)) {
      resultados.set(sku, mapaSupabase.get(sku));
      cacheLocal_setEndereco(sku, mapaSupabase.get(sku));
      usadosSupabase++;
    } else {
      faltandoSupabase.push(sku);
    }
  }

  // 3️⃣ BUSCA EM BATCH (ZUADA 1 → 80 requisições) AGORA 1 ÚNICA REQUISIÇÃO
  if (faltandoSupabase.length > 0) {
    const baseURL =
      "https://script.google.com/macros/s/AKfycbzEYYSWfRKYGxAkNFBBV9C6qlMDXlDkEQIBNwKOtcvGEdbl4nfaHD5usa89ZoV2gMcEgA/exec";

    // Atualiza loader inicial
    const loaderBar = document.getElementById("loaderBar");
    const loaderProgress = document.getElementById("loaderProgress");

    if (loaderProgress)
      loaderProgress.textContent = `Atualizando endereços (0/${faltandoSupabase.length})`;
    if (loaderBar) loaderBar.style.width = `0%`;

    // 🔥 1 única chamada GAS com TODOS os SKUs faltantes
    const url = `${baseURL}?skus=${faltandoSupabase.join(",")}`;

    let json = {};
    try {
      const resp = await fetch(url, { method: "GET" });
      if (resp.ok) json = await resp.json();
      else {
        console.warn("⚠️ Erro HTTP do GAS:", resp.status);
      }
    } catch (err) {
      console.error("❌ Erro no GAS:", err);
    }

    // Progress real por item
    let completed = 0;
    const total = faltandoSupabase.length;

    for (const sku of faltandoSupabase) {
      const endereco = json?.[sku] || "SEM LOCAL";

      resultados.set(sku, endereco);
      cacheLocal_setEndereco(sku, endereco);
      salvarEnderecoCacheSupabase(sku, endereco);
      usadosGas++;

      // Atualizar loader
      completed++;
      const percent = Math.round((completed / total) * 100);

      if (loaderBar) loaderBar.style.width = `${percent}%`;
      if (loaderProgress)
        loaderProgress.textContent = `Atualizando endereços (${completed}/${total})`;
    }
  }

  // 📊 LOG FINAL
  console.log(
    `%c📦 ENDEREÇOS RESOLVIDOS`,
    "font-weight: bold; font-size: 16px; color: #1976d2"
  );
  console.log(`🟩 Cache Local:     ${usadosLocal}`);
  console.log(`🟦 Supabase Cache: ${usadosSupabase}`);
  console.log(`🟨 GAS:            ${usadosGas}`);
  console.log(`📊 Total SKUs:     ${skus.length}`);

  return resultados;
}

function getMapaSkusPendentes() {
  const mapa = new Map();

  for (const prod of state.produtos) {
    const sku = prod.sku?.trim().toUpperCase();
    if (!sku) continue;

    // Evita sobrescrever produtos com mesmo SKU mas romaneio diferente
    if (!mapa.has(sku)) {
      mapa.set(sku, []);
    }

    mapa.get(sku).push(prod);
  }

  return mapa;
}

function getListaSkusPendentes() {
  return [...new Set(state.produtos.map((p) => p.sku.trim().toUpperCase()))];
}
