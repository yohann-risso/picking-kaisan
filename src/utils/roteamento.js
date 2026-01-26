// 🔁 Compara dois vetores de endereço (ex: [A,B,R,C,N])
export function compararOrdem(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// 🎯 Referência de rota sensível ao escopo (blocos selecionados)
export function getReferenciaEndereco(state) {
  if (!state?.retirados) return [0, 0, 0, 0, 0];

  const escopo = window.pickingContexto?.blocosSelecionados || [];

  // Sem escopo → comportamento antigo
  if (!escopo.length) {
    return state.retirados.at(-1)?.ordemEndereco ?? [0, 0, 0, 0, 0];
  }

  const sel = new Set(escopo.map(String));

  // ⚠️ state.retirados é tratado como stack (último = mais recente)
  for (let i = state.retirados.length - 1; i >= 0; i--) {
    const r = state.retirados[i];
    const end = (r.endereco || "").split("•")[0] || "";

    const m = /B\s*0*(\d+)/i.exec(end);
    const bloco = m ? String(parseInt(m[1], 10)) : "SL";

    if (sel.has(bloco) || (bloco === "SL" && sel.has("SL"))) {
      return r.ordemEndereco ?? [0, 0, 0, 0, 0];
    }
  }

  // Nenhum retirado ainda dentro do escopo
  return [0, 0, 0, 0, 0];
}

// 📥 Insere 1 produto no local correto da rota
export function inserirProdutoNaRota(produto, st = window.state || null) {
  const state = st;
  if (!state?.produtos || !state?.retirados) {
    console.warn("inserirProdutoNaRota: state inválido", state);
    return;
  }

  const referencia = getReferenciaEndereco(state);

  const comp = compararOrdem(
    produto.ordemEndereco || [999, 999, 999, 999, 999],
    referencia,
  );

  if (comp < 0) {
    state.produtos.push(produto); // atrás da rota
    return;
  }

  for (let i = 0; i < state.produtos.length; i++) {
    if (
      compararOrdem(produto.ordemEndereco, state.produtos[i].ordemEndereco) < 0
    ) {
      state.produtos.splice(i, 0, produto);
      return;
    }
  }

  state.produtos.push(produto); // fim da rota
}

// 📦 Ordena uma lista inteira de produtos (usado no carregarProdutos)
export function ordenarProdutosPorRota(
  produtos,
  retirados,
  st = window.state || null,
) {
  const state = st || { produtos, retirados };

  const referencia = getReferenciaEndereco(state);

  const aindaNaRota = [];
  const foraDaRota = [];

  for (const p of produtos) {
    const ordem = p.ordemEndereco || [999, 999, 999, 999, 999];
    if (compararOrdem(ordem, referencia) >= 0) {
      aindaNaRota.push(p);
    } else {
      foraDaRota.push(p);
    }
  }

  aindaNaRota.sort((a, b) => compararOrdem(a.ordemEndereco, b.ordemEndereco));
  foraDaRota.sort((a, b) => compararOrdem(a.ordemEndereco, b.ordemEndereco));

  return [...aindaNaRota, ...foraDaRota];
}
