import { state, getHeaders } from '../config.js';
import { atualizarInterface } from '../core/interface.js';
import { salvarProgressoLocal } from '../utils/storage.js';
import { toast } from '../components/Toast.js';
import { iniciarCronometro } from '../core/cronometro.js';

export async function carregarGrupos() {
  const res = await fetch('/api/proxy?endpoint=/rest/v1/produtos?select=grupo');
  const dados = await res.json();
  const grupos = [...new Set(dados.map(d => parseInt(d.grupo)))].sort((a, b) => a - b);
  document.getElementById("grupo").innerHTML = grupos.map(g => `<option value="${g}">${g}</option>`).join("");
}

export async function carregarTodosRefs() {
  const headers = getHeaders();
  const refs = [];
  const limit = 1000;
  let from = 0;

  while (true) {
    const res = await fetch(
      '/api/proxy?endpoint=/rest/v1/produtos_ref?select=sku,imagem,colecao',
      { headers: { ...headers, Range: `${from}-${from + limit - 1}` } }
    );
    const chunk = await res.json();
    refs.push(...chunk);
    if (chunk.length < limit) break;
    from += limit;
  }

  window.mapaRefGlobal = new Map(refs.map(p => [p.sku.trim().toUpperCase(), p]));
}

export async function registrarRetirada(prod, operador, grupo, caixa) {
  const payload = {
    timestamp: new Date().toISOString(),
    operador,
    sku: prod.sku,
    romaneio: prod.romaneio,
    caixa,
    grupo: parseInt(grupo),
    status: "RETIRADO"
  };
  await fetch('/api/proxy?endpoint=/rest/v1/retiradas', {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });
}

export async function desfazerRetirada(sku, romaneio, caixa, grupo) {
  try {
    const query = `/rest/v1/retiradas?sku=eq.${sku}&romaneio=eq.${romaneio}&caixa=eq.${caixa}&grupo=eq.${grupo}`;
    const res = await fetch(`/api/proxy?endpoint=${encodeURIComponent(query)}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error(await res.text());

    const idx = state.retirados.findIndex(
      (p) => p.sku === sku && p.romaneio === romaneio && p.caixa === caixa && p.grupo === grupo
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
  const grupo = document.getElementById("grupo").value;
  const operador = document.getElementById("operador").value;
  if (!grupo || !operador)
    return toast("Preencha grupo e operador", "warning");

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
      if (caixa === "A") p.distribuicaoAtual.A += qtd, p.distribuicaoOriginal.A += qtd;
      if (caixa === "B") p.distribuicaoAtual.B += qtd, p.distribuicaoOriginal.B += qtd;
      if (caixa === "C") p.distribuicaoAtual.C += qtd, p.distribuicaoOriginal.C += qtd;
      if (caixa === "D") p.distribuicaoAtual.D += qtd, p.distribuicaoOriginal.D += qtd;
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
  } catch (err) {
    console.error("❌ Erro ao carregar produtos:", err);
    toast("Erro ao carregar dados do Supabase", "error");
  }
}