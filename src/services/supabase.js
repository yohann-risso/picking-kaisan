import { state, getHeaders } from "../config.js";
import { atualizarInterface } from "../core/interface.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { toast } from "../components/Toast.js";
import { iniciarCronometro } from "../core/cronometro.js";
import { calcularTempoIdeal } from "../utils/format.js";

export async function carregarGrupos() {
  const res = await fetch("/api/proxy?endpoint=/rest/v1/produtos?select=grupo");

  if (!res.ok) {
    const textoErro = await res.text();
    throw new Error(`Erro ao carregar grupos: ${textoErro}`);
  }
  console.log("✅ Grupos carregados com sucesso");

  const dados = await res.json();
  const grupos = [...new Set(dados.map((d) => parseInt(d.grupo)))].sort(
    (a, b) => a - b
  );
  document.getElementById("grupo").innerHTML = grupos
    .map((g) => `<option value="${g}">${g}</option>`)
    .join("");
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

    const idx = state.retirados.findIndex(
      (p) =>
        p.sku === sku &&
        p.romaneio === romaneio &&
        p.caixa === caixa &&
        p.grupo === grupo
    );

    if (idx !== -1) {
      const item = state.retirados.splice(idx, 1)[0];
      item.distribuicaoAtual = { ...item.distribuicaoOriginal };
      state.produtos.unshift(item);
      salvarProgressoLocal();
      atualizarInterface();
      toast(`✔️ Retirada de ${sku} desfeita.`, "success");
    }
  } catch (e) {
    console.error("Erro ao desfazer retirada:", e);
    toast("❌ Não foi possível desfazer.", "error");
  }
}

export async function carregarProdutos() {
  console.log("⚙️ carregarProdutos chamado");

  const grupo = document.getElementById("grupo")?.value;
  const operador = document.getElementById("operador")?.value;

  if (!grupo || !operador) {
    console.warn("🚫 Grupo ou operador não preenchido.");
    return mostrarToast("Preencha grupo e operador", "warning");
  }

  document.getElementById("grupo").disabled = true;
  document.getElementById("operador").disabled = true;
  document.getElementById("btnIniciar").classList.add("d-none");
  document.getElementById("btnFinalizar").classList.remove("d-none");
  document.getElementById("card-tempo").classList.remove("d-none");

  const headers = getHeaders();

  try {
    const resProdutos = await fetch(
      `/api/proxy?endpoint=/rest/v1/produtos?grupo=eq.${grupo}&select=*`,
      { headers }
    );
    const linhas = await resProdutos.json();

    const mapaRef = window.mapaRefGlobal || new Map();

    const resRet = await fetch(
      `/api/proxy?endpoint=/rest/v1/retiradas?grupo=eq.${grupo}&select=sku,caixa`,
      { headers }
    );
    const retiradas = await resRet.json();
    const mapaRetiradas = new Map(
      retiradas.map((r) => [r.sku.trim().toUpperCase(), r.caixa])
    );

    state.produtos = [];
    state.retirados = [];
    const mapaSKUs = {};

    for (const linha of linhas) {
      const sku = (linha.sku || "").trim().toUpperCase();
      const caixa = (linha.caixa || "").toUpperCase();
      const qtd = parseInt(linha.qtd || 0, 10);
      const endereco =
        (linha.endereco || "").split("•")[0]?.trim() || "SEM ENDEREÇO";
      const ref = mapaRef.get(sku);

      // Log opcional por SKU
      console.log(
        `🔗 SKU: ${sku} → Imagem: ${ref?.imagem || "❌"}, Coleção: ${
          ref?.colecao || "—"
        }`
      );

      if (!mapaSKUs[sku]) {
        const match = /A(\d+)-B(\d+)-R(\d+)-C(\d+)-N(\d+)/.exec(endereco);
        mapaSKUs[sku] = {
          ...linha,
          sku,
          endereco,
          imagem: ref?.imagem || "https://placehold.co/120x120?text=Sem+Img",
          colecao: ref?.colecao || "—",
          distribuicaoAtual: { A: 0, B: 0, C: 0, D: 0 },
          distribuicaoOriginal: { A: 0, B: 0, C: 0, D: 0 },
          ordemEndereco: match
            ? match.slice(1).map(Number)
            : [999, 999, 999, 999, 999],
        };
      }

      const p = mapaSKUs[sku];
      if (caixa === "A")
        (p.distribuicaoAtual.A += qtd), (p.distribuicaoOriginal.A += qtd);
      if (caixa === "B")
        (p.distribuicaoAtual.B += qtd), (p.distribuicaoOriginal.B += qtd);
      if (caixa === "C")
        (p.distribuicaoAtual.C += qtd), (p.distribuicaoOriginal.C += qtd);
      if (caixa === "D")
        (p.distribuicaoAtual.D += qtd), (p.distribuicaoOriginal.D += qtd);
    }

    for (const prod of Object.values(mapaSKUs)) {
      if (mapaRetiradas.has(prod.sku)) {
        prod.caixa = mapaRetiradas.get(prod.sku);
        state.retirados.push(prod);
      } else {
        state.produtos.push(prod);
      }
    }

    state.produtos.sort((a, b) => {
      for (let i = 0; i < a.ordemEndereco.length; i++) {
        if (a.ordemEndereco[i] !== b.ordemEndereco[i]) {
          return a.ordemEndereco[i] - b.ordemEndereco[i];
        }
      }
      return 0;
    });

    state.tempoInicio = new Date();
    iniciarCronometro();
    atualizarInterface();
    salvarProgressoLocal();

    const totalPecas = state.produtos
      .concat(state.retirados)
      .reduce((acc, p) => {
        const dist = p.distribuicaoAtual || p.distribuicaoOriginal;
        return acc + dist.A + dist.B + dist.C + dist.D;
      }, 0);

    document.getElementById("ideal").textContent =
      calcularTempoIdeal(totalPecas);
  } catch (err) {
    console.error("❌ Erro ao carregar produtos:", err);
    mostrarToast("Erro ao carregar dados do Supabase", "error");
  }
}
