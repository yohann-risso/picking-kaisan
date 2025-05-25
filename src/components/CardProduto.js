/**
 * Cria um elemento DOM de card de produto, incluindo imagem, endereço, distribuição por caixas e ações.
 * @param {object} produto - Objeto com dados do produto
 * @param {boolean} destaque - Se verdadeiro, aplica estilo especial (classe 'primary')
 * @returns {HTMLElement} - Elemento <div> com estrutura do card
 */
export function criarCardProduto(produto, destaque = false) {
  const qtdTotal = Object.values(produto.distribuicaoAtual).reduce((a, b) => a + b, 0);
  const end1 = produto.endereco?.split("•")[0] || "SEM LOCAL";
  const end2 = produto.endereco?.split("•")[1] || "—";

  const miniCards = ["A", "B", "C", "D"].map((caixa) => `
    <div class="col minicard">
      <div class="card text-center">
        <div class="card-header fw-bold text-secondary">${caixa}</div>
        <div class="card-body p-2">
          <h4 class="card-title text-danger m-0">${produto.distribuicaoAtual[caixa]}</h4>
        </div>
      </div>
    </div>`).join("");

  const wrapper = document.createElement("div");
  wrapper.className = "col-12 col-md-6 col-lg-4 card-wrapper";
  wrapper.innerHTML = `
    <div class="card card-produto ${destaque ? 'primary' : ''} h-100 p-3">
      <div class="row g-3">
        <div class="col-md-4 text-center">
          <img src="${produto.imagem || ''}" alt="${produto.descricao || 'Produto'}"
               class="img-fluid rounded shadow-sm card-img-produto" style="max-height: 250px;">
        </div>
        <div class="col-md-8">
          <p class="fw-bold fs-3 mb-1 endereco-label">
            ENDEREÇO: <span class="texto-endereco d-block">${end1}</span>
          </p>
          <span onclick="zerarEnderecoExterno('${end1}')" style="cursor:pointer;" title="Zerar Endereço">
            <i class="bi bi-x-circle-fill text-danger ms-2 fs-5"></i>
            <span class="spinner-border spinner-border-sm text-primary ms-2 d-none"
                  role="status" id="loader-zerar-${end1}"></span>
          </span>
          <p><strong>ENDEREÇO SECUNDÁRIO:</strong><br>${end2}</p>
          <p class="text-danger fw-bold fs-2 mb-1">SKU: ${produto.sku}</p>
          <p><strong>PRODUTO:</strong> ${produto.descricao}</p>
          <p><strong>COLEÇÃO:</strong> ${produto.colecao || "—"}</p>
        </div>
      </div>
      <div class="text-center mt-3">
        <div class="fw-bold text-muted small">QTDE TOTAL</div>
        <div class="fw-bold fs-1">${qtdTotal}</div>
        <div class="row mt-2 g-2">${miniCards}</div>
      </div>
    </div>`;
  return wrapper;
}
