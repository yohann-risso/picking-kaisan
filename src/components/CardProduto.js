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
    </div>`
    )
    .join("");

  const wrapper = document.createElement("div");
  wrapper.className = "col-12 col-md-6 col-lg-4 card-wrapper";
  wrapper.innerHTML = `
    <div class="card card-produto ${destaque ? "primary" : ""} h-100 p-3">
      <div class="row g-3">
        <div class="col-md-4 text-center">
          <img src="${produto.imagem || ""}" alt="${
    produto.descricao || "Produto"
  }"
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

.card-wrapper {
  flex: 1 0 auto;
  max-width: 100%;
  min-width: 300px;
}

.card-wrapper.card-1 {
  flex: 1 0 100%;
}

.card-wrapper.card-2 {
  flex: 1 0 48%;
}

.card-wrapper.card-3 {
  flex: 1 0 31%;
}

/* Layout base do card */
.card-produto {
  background-color: #ffecec;
  border-left: 5px solid #e74c3c;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  border-radius: 8px;
}

.card-produto.primary {
  border-left-color: #0d6efd;
  background-color: #eaf2ff;
}

/* Área superior do card com info + imagem */
.card-info {
  display: flex;
  justify-content: space-between;
  gap: 1.2rem;
  align-items: flex-start;
}

/* Informações à esquerda */
.card-info .details {
  flex: 1;
}

.card-info .title {
  font-weight: bold;
  font-size: 1.2rem;
  margin-bottom: 0.5rem;
}

.card-info .sku,
.card-info .pedido-undo {
  font-size: 0.95rem;
  color: #444;
}

.card-info .pedido-undo {
  margin-top: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Imagem do produto */
.image-container {
  flex-shrink: 0;
  text-align: center;
}

.image-container img {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: 6px;
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.1);
}

/* Badge de número da caixa */
.card-number {
  margin-top: 1rem;
  font-size: 1.8rem;
  font-weight: bold;
  text-align: center;
  color: #0d6efd;
}

/* Botão de desfazer */
.btn-undo-simple {
  font-size: 0.9rem;
  border: none;
  background: transparent;
  color: #dc3545;
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s ease;
}

.btn-undo-simple:hover {
  color: #a50000;
}

/* Estilo para erro */
.card-erro {
  background-color: #f8d7da;
  border-left: 5px solid #dc3545;
  padding: 1rem;
  font-weight: bold;
  color: #842029;
  border-radius: 6px;
  font-size: 1.2rem;
}

