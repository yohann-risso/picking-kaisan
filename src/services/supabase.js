import { state, getHeaders } from '../config.js';
import { iniciarCronometro } from '../utils/cronometro.js';
import { atualizarInterface } from '../utils/interface.js';
import { salvarProgressoLocal } from '../utils/storage.js';
import { toast } from '../components/Toast.js';
import { desfazerRetirada } from '../services/supabase.js';

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