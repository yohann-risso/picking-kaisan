export function carregarOperadores() {
  const operadores = [
    "Alan Ramos",
    "Anderson Dutra",
    "Arthur Oliveira",
    "Felipe Moraes",
    "Filipe Silva",
    "Gabriel Lagoa",
    "João Alves",
    "Kaique Teixeira",
    "Marrony Portugal",
    "Nalbert Pereira",
    "Rodrigo Novaes",
    "Rony Côrrea",
    "Ykaro Oliveira",
    "Yohann Risso",
  ];

  const seletor = document.getElementById("operadorModal");
  if (!seletor) {
    console.warn("⚠️ Elemento #operadorModal não encontrado");
    return;
  }

  seletor.innerHTML = operadores
    .map((op) => `<option value="${op}">${op}</option>`)
    .join("");
}
