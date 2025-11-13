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

    for (const linha of linhas) {
      const sku = (linha.sku || "").trim().toUpperCase();
      const romaneio = linha.romaneio;
      const caixa = (linha.caixa || "").toUpperCase();
      const qtd = parseInt(linha.qtd || 0, 10);
      const enderecoCompleto = linha.endereco || "";
      const [endPrimario = "SEM ENDEREÇO"] = enderecoCompleto
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
          endereco: enderecoCompleto,
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

    for (const prod of Object.values(mapaSKUs)) {
      const key = `${prod.sku}__${prod.romaneio}`;
      const caixasRetiradas = mapaRetiradas.get(key) || [];

      const retiradas = { A: 0, B: 0, C: 0, D: 0 };
      caixasRetiradas.forEach((caixa) => {
        const c = caixa.toUpperCase();
        if (["A", "B", "C", "D"].includes(c)) retiradas[c]++;
      });

      // Atualiza quantidade restante
      prod.distribuicaoAtual = {
        A: prod.distribuicaoOriginal.A - retiradas.A,
        B: prod.distribuicaoOriginal.B - retiradas.B,
        C: prod.distribuicaoOriginal.C - retiradas.C,
        D: prod.distribuicaoOriginal.D - retiradas.D,
      };

      const totalRestante =
        prod.distribuicaoAtual.A +
        prod.distribuicaoAtual.B +
        prod.distribuicaoAtual.C +
        prod.distribuicaoAtual.D;

      const totalRetirado =
        retiradas.A + retiradas.B + retiradas.C + retiradas.D;

      if (totalRetirado > 0) {
        const retirado = {
          ...structuredClone(prod),
          grupo,
          retiradas,
        };

        state.retirados.push(retirado);
      }

      if (totalRestante > 0) {
        state.produtos.push(prod);
      }
    }

    // 4. Ordenar os produtos com base na posição atual do operador
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

    // 👉 Atualiza lista ordenada
    state.produtos = [...aindaNaRota, ...foraDaRota];

    // 5. Calcular e armazenar total de peças (Fixo)
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
