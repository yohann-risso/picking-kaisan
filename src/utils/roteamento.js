// 🔁 Compara dois vetores de endereço (ex: [A,B,R,C,N])
export function compararOrdem(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// 📥 Insere 1 produto no local correto da rota
export function inserirProdutoNaRota(produto, state) {
  const referencia = state.retirados?.at(-1)?.ordemEndereco ?? [0, 0, 0, 0, 0];

  const comp = compararOrdem(
    produto.ordemEndereco || [999, 999, 999, 999, 999],
    referencia
  );

  if (comp < 0) {
    state.produtos.push(produto); // atrás da rota
  } else {
    let inserido = false;
    for (let i = 0; i < state.produtos.length; i++) {
      if (
        compararOrdem(produto.ordemEndereco, state.produtos[i].ordemEndereco) <
        0
      ) {
        state.produtos.splice(i, 0, produto);
        inserido = true;
        break;
      }
    }
    if (!inserido) state.produtos.push(produto); // fim da rota
  }
}

// 📦 Ordena uma lista inteira de produtos (usado no carregarProdutos)
export function ordenarProdutosPorRota(produtos, retirados) {
  const referencia = retirados?.at(-1)?.ordemEndereco ?? [0, 0, 0, 0, 0];
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
