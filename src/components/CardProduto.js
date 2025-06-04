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
  const end1 = produto.endereco?.split("•")[0] || "SEM LOCAL";
  const end2 = produto.endereco?.split("•")[1] || "—";

  const miniCards = ["A", "B", "C", "D"]
    .map(
      (caixa) => `
      <div class="col minicard">
        <div class="card text-center">
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
    <div class="card-produto shadow-sm p-3 rounded d-flex flex-column flex-md-row justify-content-between align-items-start gap-3 ${
      destaque ? "primary" : ""
    }">
      <!-- Informações -->
      <div class="flex-grow-1 pe-md-4">
        <div class="fw-bold fs-6 mb-2">${
          produto.descricao || "Sem descrição"
        } | <strong>Ref: ${produto.sku.split("-")[0]}</strong></div>
        <div class="text-primary fw-bold mb-2">SKU: ${produto.sku}</div>

        <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
          <span>Pedido: <strong>${produto.pedido_id}</strong></span>
          <button class="btn btn-outline-danger btn-sm" title="Desfazer bipagem"
            onclick="desfazerRetirada('${produto.sku}', ${produto.romaneio}, '${
    produto.caixa
  }', ${produto.grupo})">
            <i class="bi bi-arrow-counterclockwise"></i> DESFAZER
          </button>
        </div>

        <p class="fw-bold fs-6 mb-1 endereco-label">
          ENDEREÇO:
          <span class="texto-endereco">${end1}</span>
          <i class="bi bi-x-circle-fill text-danger ms-2 fs-5"
             title="Zerar Endereço"
             onclick="zerarEnderecoExterno('${end1}')"></i>
          <span class="spinner-border spinner-border-sm text-primary ms-2 d-none"
                role="status" id="loader-zerar-${end1}"></span>
        </p>
        <p class="mb-2"><strong>Endereço secundário:</strong> ${end2}</p>
        <p class="mb-2"><strong>Coleção:</strong> ${produto.colecao || "—"}</p>

        <div class="fw-bold text-muted small">QTDE TOTAL</div>
        <div class="fw-bold fs-1">${qtdTotal}</div>

        <div class="row mt-2 g-2">${miniCards}</div>
      </div>

      <!-- Imagem -->
      <div class="image-container text-center">
        <img src="${
          produto.imagem || "https://via.placeholder.com/120?text=Sem+Img"
        }"
             alt="Imagem do Produto"
             class="img-fluid rounded border border-primary"
             style="max-width: 120px; height: auto;"
             onerror="this.onerror=null;this.src='https://via.placeholder.com/120?text=Sem+Img';">
      </div>
    </div>
  `;
  return wrapper;
}
