/**
 * Cria um elemento DOM de card de produto, incluindo imagem, endereço, distribuição por caixas e ações.
 * @param {object} produto - Objeto com dados do produto
 * @param {boolean} destaque - Se verdadeiro, aplica estilo especial (classe 'primary')
 * @returns {HTMLElement} - Elemento <div> com estrutura do card
 */
export function criarCardProduto(produto, destaque = false) {
  const qtdTotal = Object.values(produto.distribuicaoAtual).reduce(
    (a, b) => a + b,
    0
  );
  const [end1 = "SEM LOCAL", end2 = "—"] = (produto.endereco || "").split("•");

  const miniCards = ["A", "B", "C", "D"]
    .map(
      (caixa) => `
      <div class="col minicard">
        <div class="card text-center border">
          <div class="card-header fw-bold text-secondary">${caixa}</div>
          <div class="card-body p-2">
            <h4 class="card-title text-danger m-0">${produto.distribuicaoAtual[caixa]}</h4>
          </div>
        </div>
      </div>
    `
    )
    .join("");

  const wrapper = document.createElement("div");
  wrapper.className =
    "col-12 card-wrapper card-" +
    (localStorage.getItem("qtdCardsPreferido") || 2);
  wrapper.innerHTML = `
    <div class="card-produto shadow-sm p-3 rounded border-start border-4 border-primary bg-light-subtle d-flex flex-column flex-md-row gap-4 ${
      destaque ? "primary" : ""
    }">
      
      <!-- COLUNA 1 - Informações -->
      <div class="flex-grow-1 pe-md-4">
        <div class="fw-bold fs-6 mb-2 text-dark">
          ${produto.descricao || "Sem descrição"}
        </div>

        <div class="text-primary fw-bold mb-2">SKU: ${produto.sku}</div>

        <div class="mb-1 fw-bold fs-6" style="word-break: break-word;">
          ENDEREÇO:
          <span class="badge-endereco">${end1}</span>
        </div>

        <div class="text-muted mb-1"><strong>Endereço secundário:</strong> ${end2}</div>
        <div class="text-muted mb-3"><strong>Coleção:</strong> ${
          produto.colecao || "—"
        }</div>

        <div class="text-center mt-3">
          <div class="text-muted small fw-semibold">QTDE TOTAL</div>
          <div class="fs-1 fw-bold mb-3">${qtdTotal}</div>
          <div class="row mt-2 g-2 justify-content-center">${miniCards}</div>
        </div>
      </div>

      <!-- COLUNA 2 - Botão e Imagem -->
      <div class="d-flex flex-column align-items-center gap-2" style="min-width: 140px;">
        <button
          class="btn btn-sm btn-outline-secondary"
          title="Simular Bipagem"
          onclick="simularBipagem('${
            produto.sku
          }'); this.classList.add('active'); setTimeout(() => this.classList.remove('active'), 300);"
        >
          <i class="bi bi-upc-scan"></i> Bipar
        </button>

        <img
          src="${
            produto.imagem || "https://via.placeholder.com/120?text=Sem+Img"
          }"
          alt="Imagem do Produto"
          class="img-fluid rounded border border-primary"
          style="max-width: 120px; height: auto;"
          onerror="this.onerror=null;this.src='https://via.placeholder.com/120?text=Sem+Img';"
        >

        <button
          class="btn btn-sm btn-outline-primary mt-2"
          title="Pular este produto e ir para o próximo"
          onclick="pularProduto('${produto.sku}')"
        >
          <i class="bi bi-arrow-right-circle-fill fs-5"></i>
        </button>
      </div>
    </div>
  `;

  return wrapper;
}
