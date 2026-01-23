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

function extrairBlocoDoEndereco(endereco = "") {
  const [endPrimario = ""] = String(endereco)
    .split("•")
    .map((e) => e.trim());

  const m = /B\s*0*(\d+)/i.exec(endPrimario);
  if (!m) return "SL";

  return String(parseInt(m[1], 10));
}

function emEscopoPorBloco(produto, blocosSelecionados = []) {
  if (!Array.isArray(blocosSelecionados) || blocosSelecionados.length === 0) {
    return true; // sem escopo → tudo
  }

  const bloco = extrairBlocoDoEndereco(produto?.endereco || "");
  const sel = blocosSelecionados.map((x) => String(x).toUpperCase());

  if (bloco === "SL") return sel.includes("SL");
  return sel.includes(String(bloco));
}

function somarPecasOriginais(lista = []) {
  return lista.reduce((acc, p) => {
    const o = p.distribuicaoOriginal || { A: 0, B: 0, C: 0, D: 0 };
    return acc + (o.A || 0) + (o.B || 0) + (o.C || 0) + (o.D || 0);
  }, 0);
}

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
      `🔁 Página ${i + 1} (offset ${offset}) → ${dados.length} registros`,
    );
    todosGrupos.push(...dados.map((d) => d.grupo));
    offset += pageSize;
  }

  const grupos = [
    ...new Set(
      todosGrupos
        .map((g) => Number(String(g).trim()))
        .filter((g) => Number.isInteger(g) && g > 0),
    ),
  ].sort((a, b) => a - b);

  console.log("✅ Grupos finais únicos:", grupos);
  return grupos;
}

let refsCarregadas = false;

// ===============================
// CONFIG: tabelas do picking
// ===============================
const TABELA_PADRAO = "produtos";
const TABELA_NL = "produtos_nl"; // <- TROQUE se sua tabela NL tiver outro nome

function normalizarSku(s) {
  return (s || "").trim().toUpperCase();
}

// Heurística simples: se for grande, trata como pedido; senão, romaneio.
// (Se você preferir um toggle no modal, eu adapto pra ficar explícito.)
function detectarCampoChave(chave) {
  const v = String(chave || "").trim();
  if (!v) return { campo: null, valor: null };
  const digits = v.replace(/\D+/g, "");
  const valor = digits || v;
  const campo = valor.length >= 10 ? "pedido" : "romaneio";
  return { campo, valor };
}

function resolverFontePorContexto(ctx) {
  // ctx: { tipo:"GRUPO"|"AVULSO", grupo, chave, nl }
  if (!ctx || ctx.tipo === "GRUPO") {
    return {
      tabela: TABELA_PADRAO,
      filtro: { campo: "grupo", valor: ctx?.grupo ?? window.grupoSelecionado },
      label: `Grupo ${ctx?.grupo ?? window.grupoSelecionado}`,
    };
  }

  const { campo, valor } = detectarCampoChave(ctx.chave);
  return {
    tabela: ctx.nl ? TABELA_NL : TABELA_PADRAO,
    filtro: { campo, valor },
    label: `${ctx.nl ? "NL" : "Avulso"} | ${campo} ${valor}`,
  };
}

export async function carregarRefsPorContexto(ctx) {
  const { tabela, filtro } = resolverFontePorContexto(ctx);

  if (!filtro?.campo || !filtro?.valor) {
    console.warn("⚠️ carregarRefsPorContexto: filtro inválido", ctx, filtro);
    return;
  }

  // 1) Buscar SKUs únicos só da seleção atual (grupo/romaneio/pedido)
  const { data: produtos, error: erroProdutos } = await supabase
    .from(tabela)
    .select("sku")
    .eq(filtro.campo, filtro.valor);

  if (erroProdutos) {
    console.error("❌ Erro ao buscar SKUs:", erroProdutos);
    return;
  }

  const skuList = [
    ...new Set((produtos || []).map((p) => normalizarSku(p.sku))),
  ].filter(Boolean);

  if (!skuList.length) {
    console.warn("⚠️ Nenhum SKU encontrado para:", tabela, filtro);
    return;
  }

  // 2) Buscar refs
  const { data: refs, error: erroRefs } = await supabase
    .from("produtos_ref")
    .select("sku, imagem, colecao")
    .in("sku", skuList);

  if (erroRefs) {
    console.error("❌ Erro ao buscar produtos_ref:", erroRefs);
    return;
  }

  // 3) Montar mapa
  window.mapaRefGlobal = new Map();
  (refs || []).forEach((r) => {
    const key = normalizarSku(r.sku);
    window.mapaRefGlobal.set(key, r);
    window.mapaRefGlobal.set(key.toLowerCase(), r);
  });

  console.log("✅ mapaRefGlobal carregado:", window.mapaRefGlobal.size);
}

// compat (mantém sua API atual)
export async function carregarRefsPorGrupo(grupo) {
  return carregarRefsPorContexto({ tipo: "GRUPO", grupo });
}

// atalho pro main.js (caso você queira chamar window.carregarRefsPorAvulso)
window.carregarRefsPorAvulso = (ctx) => carregarRefsPorContexto(ctx);

export async function carregarProdutosPorContexto(ctx) {
  console.log(
    "CTX blocosSelecionados:",
    ctx?.blocosSelecionados,
    "window:",
    window.pickingContexto?.blocosSelecionados,
  );

  console.log("⚙️ carregarProdutosPorContexto chamado", ctx);

  const loader = document.getElementById("loaderGlobal");
  if (loader) loader.style.display = "flex";

  const operador = ctx?.operador || window.operadorSelecionado;

  if (!operador) {
    if (loader) loader.style.display = "none";
    console.warn("🚫 Operador não definido.");
    return toast("Operador não selecionado", "warning");
  }

  const fonte = resolverFontePorContexto(ctx);
  if (!fonte?.tabela || !fonte?.filtro?.campo || !fonte?.filtro?.valor) {
    if (loader) loader.style.display = "none";
    console.warn("🚫 Fonte/filtro inválido:", fonte);
    return toast("Filtro inválido (grupo/romaneio/pedido).", "warning");
  }

  // UI
  document.getElementById("btnFinalizar")?.classList.remove("d-none");
  document.getElementById("card-tempo")?.classList.remove("d-none");

  const headers = getHeaders();

  try {
    // ------------------------------------------------------------
    // 1) Buscar produtos do recorte (grupo OU romaneio/pedido)
    // ------------------------------------------------------------
    const endpointProdutos =
      `/rest/v1/${fonte.tabela}?` +
      `${fonte.filtro.campo}=eq.${encodeURIComponent(fonte.filtro.valor)}` +
      `&select=*`;

    const resProdutos = await fetch(
      `/api/proxy?endpoint=${encodeURIComponent(endpointProdutos)}`,
      { headers },
    );

    if (!resProdutos.ok) {
      throw new Error(await resProdutos.text());
    }

    const linhasRaw = await resProdutos.json();

    // ------------------------------------------------------------
    // 1A) Normalizar linhas NL -> formato padrão (caixa virtual "A")
    //     Esperado na tabela NL: romaneio, sku, qtd, pedido (endereco opcional)
    // ------------------------------------------------------------
    const linhas = Array.isArray(linhasRaw) ? linhasRaw : [];
    const isNL = fonte.tabela === TABELA_NL; // ajuste se seu nome for outro

    const linhasNormalizadas = isNL
      ? linhas.map((l) => ({
          ...l,
          caixa: "A",
          endereco: l.endereco || "SEM LOCAL",
          // mantém pedido se existir (pode ser usado em telas/relatórios)
          pedido: l.pedido ?? null,
        }))
      : linhas;

    // ------------------------------------------------------------
    // 2) Buscar retiradas já feitas (grupo OU avulso por chave)
    // ------------------------------------------------------------
    let endpointRet = null;

    if (!ctx || ctx.tipo === "GRUPO") {
      const grupo = ctx?.grupo ?? window.grupoSelecionado;
      if (!grupo) {
        throw new Error("Grupo não definido para modo GRUPO.");
      }
      endpointRet =
        `/rest/v1/retiradas?grupo=eq.${encodeURIComponent(grupo)}` +
        `&select=sku,caixa,romaneio,pedido,modo,chave,nl`;
    } else {
      const chave = String(ctx.chave || "").trim();
      if (!chave) throw new Error("Chave avulsa inválida.");

      endpointRet =
        `/rest/v1/retiradas?modo=eq.AVULSO` +
        `&chave=eq.${encodeURIComponent(chave)}` +
        `&nl=eq.${ctx.nl ? "true" : "false"}` +
        `&select=sku,caixa,romaneio,pedido,modo,chave,nl`;
    }

    const resRet = await fetch(
      `/api/proxy?endpoint=${encodeURIComponent(endpointRet)}`,
      { headers },
    );

    if (!resRet.ok) {
      throw new Error(await resRet.text());
    }

    const retiradas = await resRet.json();

    // ------------------------------------------------------------
    // 3) Mapear retiradas por sku + romaneio
    // ------------------------------------------------------------
    const mapaRetiradas = new Map();
    (Array.isArray(retiradas) ? retiradas : []).forEach((r) => {
      const key = `${normalizarSku(r.sku)}__${r.romaneio}`;
      if (!mapaRetiradas.has(key)) mapaRetiradas.set(key, []);
      mapaRetiradas.get(key).push((r.caixa || "").toUpperCase());
    });

    const mapaRef = window.mapaRefGlobal || new Map();

    state.produtos = [];
    state.retirados = [];
    const mapaSKUs = {};

    // ------------------------------------------------------------
    // 3A) Montar mapaSKUs com distribuição original
    // ------------------------------------------------------------
    for (const linha of linhasNormalizadas) {
      const sku = normalizarSku(linha.sku);
      const romaneio = linha.romaneio;
      const caixa = (linha.caixa || "").toUpperCase();
      const qtd = parseInt(linha.qtd || 0, 10);

      if (!sku || !romaneio || !qtd || qtd <= 0) continue;

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
          endereco: enderecoOriginal,
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

      // padrão (grupo): A/B/C/D conforme linha.caixa
      // NL (normalizado): sempre cai aqui como "A"
      if (caixa === "A") p.distribuicaoOriginal.A += qtd;
      if (caixa === "B") p.distribuicaoOriginal.B += qtd;
      if (caixa === "C") p.distribuicaoOriginal.C += qtd;
      if (caixa === "D") p.distribuicaoOriginal.D += qtd;

      p.distribuicaoAtual = { ...p.distribuicaoOriginal };
    }

    // ------------------------------------------------------------
    // 3B) Aplicar retiradas + preencher state.produtos/state.retirados
    // ------------------------------------------------------------
    const skusPendentesSet = new Set();

    for (const prod of Object.values(mapaSKUs)) {
      const key = `${prod.sku}__${prod.romaneio}`;
      const caixasRetiradas = mapaRetiradas.get(key) || [];

      const retiradasPorCaixa = { A: 0, B: 0, C: 0, D: 0 };
      caixasRetiradas.forEach((cx) => {
        const c = (cx || "").toUpperCase();
        if (["A", "B", "C", "D"].includes(c)) retiradasPorCaixa[c]++;
      });

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
          retiradas: retiradasPorCaixa,
        };

        if (!ctx || ctx.tipo === "GRUPO") {
          retirado.grupo = ctx?.grupo ?? window.grupoSelecionado;
        } else {
          retirado.modo = "AVULSO";
          retirado.chave = String(ctx.chave || "").trim();
          retirado.nl = !!ctx.nl;
        }

        state.retirados.push(retirado);
      }

      if (totalRestante > 0) {
        state.produtos.push(prod);
        skusPendentesSet.add(prod.sku);
      }
    }

    // ------------------------------------------------------------
    // 4) Buscar endereços SOMENTE dos pendentes (GAS/cache)
    // ------------------------------------------------------------
    const listaSkusPendentes = [...skusPendentesSet].map((s) =>
      normalizarSku(s),
    );

    const mapaEnderecosAtualizados =
      await obterEnderecosInteligente(listaSkusPendentes);

    // ------------------------------------------------------------
    // 5) Aplicar endereços atualizados nos produtos pendentes
    // ------------------------------------------------------------
    for (const prod of state.produtos) {
      const sku = normalizarSku(prod.sku);
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

    // ------------------------------------------------------------
    // 6) Ordenação por posição atual (última retirada)
    // ------------------------------------------------------------
    function compararOrdem(a, b) {
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
      }
      return 0;
    }

    const ultimaRetirada = state.retirados.at(-1);
    const posicaoAtual = ultimaRetirada?.ordemEndereco || [0, 0, 0, 0, 0];
    state.ordemAtual = posicaoAtual;

    const aindaNaRota = [];
    const foraDaRota = [];

    for (const p of state.produtos) {
      const comp = compararOrdem(
        p.ordemEndereco || [999, 999, 999, 999, 999],
        posicaoAtual,
      );
      if (comp >= 0) aindaNaRota.push(p);
      else foraDaRota.push(p);
    }

    aindaNaRota.sort((a, b) => compararOrdem(a.ordemEndereco, b.ordemEndereco));
    foraDaRota.sort((a, b) => compararOrdem(a.ordemEndereco, b.ordemEndereco));
    state.produtos = [...aindaNaRota, ...foraDaRota];

    // ------------------------------------------------------------
    // 7) Total de peças (FIXO) — agora respeita ESCOPO por blocos
    // ------------------------------------------------------------

    // aplica escopo APENAS para modo GRUPO (avulso ignora)
    const blocosSelecionados =
      !ctx || ctx.tipo === "GRUPO"
        ? (ctx?.blocosSelecionados ??
          window.pickingContexto?.blocosSelecionados ??
          [])
        : [];

    // filtra state.produtos/state.retirados pelo escopo
    if (Array.isArray(blocosSelecionados) && blocosSelecionados.length > 0) {
      state.produtos = state.produtos.filter((p) =>
        emEscopoPorBloco(p, blocosSelecionados),
      );
      state.retirados = state.retirados.filter((p) =>
        emEscopoPorBloco(p, blocosSelecionados),
      );

      // reordena rota após filtrar (mantém lógica de “posição atual”)
      const ultimaRetiradaEscopo = state.retirados.at(-1);
      const posicaoAtualEscopo = ultimaRetiradaEscopo?.ordemEndereco || [
        0, 0, 0, 0, 0,
      ];

      const ainda = [];
      const fora = [];

      for (const p of state.produtos) {
        const comp = compararOrdem(
          p.ordemEndereco || [999, 999, 999, 999, 999],
          posicaoAtualEscopo,
        );
        if (comp >= 0) ainda.push(p);
        else fora.push(p);
      }

      ainda.sort((a, b) => compararOrdem(a.ordemEndereco, b.ordemEndereco));
      fora.sort((a, b) => compararOrdem(a.ordemEndereco, b.ordemEndereco));
      state.produtos = [...ainda, ...fora];

      state.ordemAtual = posicaoAtualEscopo;
    }

    console.log(
      "ESCOPADO -> produtos:",
      state.produtos.length,
      "retirados:",
      state.retirados.length,
      "totalPecas:",
      state.totalPecas,
    );

    // total de peças agora é DO ESCOPO (originais)
    const totalPecasEscopo = somarPecasOriginais(
      state.produtos.concat(state.retirados),
    );
    state.totalPecas = totalPecasEscopo;

    document.getElementById("ideal").textContent =
      calcularTempoIdeal(totalPecasEscopo);
    document.getElementById("qtdTotal").textContent = totalPecasEscopo;

    if (state.totalPecas === 0) {
      toast("⚠️ Nenhuma peça no escopo selecionado (blocos).", "warning");
    }

    const idealEl = document.getElementById("ideal");
    const qtdTotalEl = document.getElementById("qtdTotal");
    if (idealEl) idealEl.textContent = calcularTempoIdeal(totalPecasEscopo);
    if (qtdTotalEl) qtdTotalEl.textContent = totalPecasEscopo;

    state.tempoInicio = new Date();
    iniciarCronometro();

    window.atualizarFiltroBlocos?.();
    atualizarInterface();
    salvarProgressoLocal();
  } catch (err) {
    console.error("❌ Erro ao carregar produtos (contexto):", err);
    toast("Erro ao carregar dados do Supabase", "error");
  } finally {
    if (loader) loader.style.display = "none";
  }

  window.atualizarFiltroArmazem?.();
  window.atualizarFiltroBlocos?.();
}

// atalho pro main.js
window.carregarProdutosPorContexto = (ctx) => carregarProdutosPorContexto(ctx);

// compat: mantém API antiga (grupo) usada no main.js
export async function carregarProdutos() {
  return carregarProdutosPorContexto({
    tipo: "GRUPO",
    grupo: window.grupoSelecionado,
    operador: window.operadorSelecionado,
    blocosSelecionados: window.pickingContexto?.blocosSelecionados || [], // ✅
  });
}

export async function registrarRetiradaV2(prod, operador, ctx, caixa) {
  const timestamp = new Date()
    .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
    .replace(" ", "T");

  const payload = {
    timestamp,
    operador,
    sku: prod.sku,
    romaneio: prod.romaneio,
    caixa,
    status: "RETIRADO",
  };

  if (ctx?.tipo === "GRUPO") {
    payload.grupo = parseInt(ctx.grupo ?? window.grupoSelecionado);
  } else {
    payload.modo = "AVULSO";
    payload.chave = String(ctx?.chave || "").trim();
    payload.nl = !!ctx?.nl;

    // opcional: se você quiser gravar pedido separado (quando chave for pedido)
    const det = detectarCampoChave(ctx?.chave);
    if (det.campo === "pedido") payload.pedido = det.valor;

    // grupo vira null (ou 0 se sua coluna for NOT NULL)
    payload.grupo = null;
  }

  console.log("📤 Enviando retirada:", payload);

  try {
    const res = await fetch("/api/proxy?endpoint=/rest/v1/retiradas", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(await res.text());
  } catch (err) {
    console.error("❌ Falha ao registrar retirada:", err);
    toast("Erro ao registrar retirada", "error");
  }
}

// wrapper compat (se seu picking.js ainda chama o antigo)
export async function registrarRetirada(prod, operador, grupo, caixa) {
  return registrarRetiradaV2(prod, operador, { tipo: "GRUPO", grupo }, caixa);
}

export async function desfazerRetiradaV2(sku, romaneio, caixa, ctx) {
  try {
    const skuN = normalizarSku(sku);
    const cx = (caixa || "").toUpperCase();

    let query = null;

    if (ctx?.tipo === "GRUPO") {
      const grupo = parseInt(ctx.grupo ?? window.grupoSelecionado);
      query = `/rest/v1/retiradas?sku=eq.${skuN}&romaneio=eq.${romaneio}&caixa=eq.${cx}&grupo=eq.${grupo}`;
    } else {
      query =
        `/rest/v1/retiradas?sku=eq.${skuN}` +
        `&romaneio=eq.${romaneio}` +
        `&caixa=eq.${cx}` +
        `&modo=eq.AVULSO` +
        `&chave=eq.${String(ctx.chave).trim()}` +
        `&nl=eq.${ctx.nl ? "true" : "false"}`;
    }

    const res = await fetch(
      `/api/proxy?endpoint=${encodeURIComponent(query)}`,
      {
        method: "DELETE",
        headers: getHeaders(),
      },
    );
    if (!res.ok) throw new Error(await res.text());

    // remove do state.retirados (ajusta chave de busca conforme contexto)
    const idx = state.retirados.findIndex((p) => {
      const okBase =
        normalizarSku(p.sku) === skuN &&
        p.romaneio == romaneio &&
        (p.caixa || "").toUpperCase() === cx;

      if (!okBase) return false;

      if (ctx?.tipo === "GRUPO") {
        return p.grupo == parseInt(ctx.grupo ?? window.grupoSelecionado);
      }
      return (
        p.modo === "AVULSO" &&
        String(p.chave || "").trim() === String(ctx.chave || "").trim() &&
        !!p.nl === !!ctx.nl
      );
    });

    if (idx !== -1) {
      const item = state.retirados.splice(idx, 1)[0];
      item.distribuicaoAtual = { ...item.distribuicaoOriginal };
      inserirProdutoNaRota(item);
      salvarProgressoLocal();
      atualizarInterface();
      toast(
        `✔️ Retirada de ${skuN} (Romaneio ${romaneio}) desfeita.`,
        "success",
      );
    } else {
      toast("Item não encontrado para desfazer.", "warning");
    }
  } catch (e) {
    console.error("Erro ao desfazer retirada:", e);
    toast("❌ Não foi possível desfazer retirada.", "error");
  }
}

// wrapper compat
export async function desfazerRetirada(sku, romaneio, caixa, grupo) {
  return desfazerRetiradaV2(sku, romaneio, caixa, { tipo: "GRUPO", grupo });
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

  // 1️⃣ LOCAL CACHE
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

  // 2️⃣ SUPABASE CACHE
  const mapaSupabase = await buscarEnderecoCacheSupabase(faltandoLocal);
  const faltandoSupabase = [];

  for (const sku of faltandoLocal) {
    if (mapaSupabase.has(sku)) {
      const endereco = mapaSupabase.get(sku);
      resultados.set(sku, endereco);
      cacheLocal_setEndereco(sku, endereco);
      usadosSupabase++;
    } else {
      faltandoSupabase.push(sku);
    }
  }

  // 3️⃣ GAS — AGORA VIA POST (SEM LIMITES, SEM REDIRECTS)
  if (faltandoSupabase.length > 0) {
    const url = "/api/gas-enderecos";
    if (!url) {
      console.error("❌ GAS_ENDERECOS_URL não encontrada no env");
      return resultados;
    }

    // Loader de progresso
    const loaderBar = document.getElementById("loaderBar");
    const loaderProgress = document.getElementById("loaderProgress");
    if (loaderProgress)
      loaderProgress.textContent = `Atualizando endereços (0/${faltandoSupabase.length})`;
    if (loaderBar) loaderBar.style.width = `0%`;

    let json = {};
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus: faltandoSupabase }),
      });

      if (resp.ok) {
        json = await resp.json();
      } else {
        console.warn("⚠️ Erro HTTP no GAS:", resp.status, await resp.text());
      }
    } catch (err) {
      console.error("❌ Erro no GAS:", err);
    }

    // Processar retorno um por um
    let completed = 0;
    const total = faltandoSupabase.length;

    for (const sku of faltandoSupabase) {
      const endereco = json?.[sku] || "SEM LOCAL";

      resultados.set(sku, endereco);
      cacheLocal_setEndereco(sku, endereco);
      salvarEnderecoCacheSupabase(sku, endereco);
      usadosGas++;

      completed++;
      const percent = Math.round((completed / total) * 100);

      if (loaderBar) loaderBar.style.width = `${percent}%`;
      if (loaderProgress)
        loaderProgress.textContent = `Atualizando endereços (${completed}/${total})`;
    }
  }

  console.log(
    `%c📦 ENDEREÇOS RESOLVIDOS`,
    "font-weight: bold; font-size: 16px; color: #1976d2",
  );
  console.log(`🟩 Cache Local:     ${usadosLocal}`);
  console.log(`🟦 Supabase Cache:  ${usadosSupabase}`);
  console.log(`🟨 GAS:             ${usadosGas}`);
  console.log(`📊 Total SKUs:      ${skus.length}`);

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

export async function atualizarEnderecoCacheSupabase(sku, novoEndereco) {
  try {
    const payload = {
      sku,
      endereco: novoEndereco,
      atualizado_em: new Date().toISOString(),
    };

    console.log("📤 Atualizando produtos_endereco_cache:", payload);

    const res = await fetch(
      "/api/proxy?endpoint=/rest/v1/produtos_endereco_cache",
      {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      throw new Error(await res.text());
    }

    console.log("✅ produtos_endereco_cache atualizado com sucesso!");
  } catch (err) {
    console.error("❌ Erro ao atualizar produtos_endereco_cache:", err);
  }
}
