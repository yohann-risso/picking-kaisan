export function carregarOperadores() {
  const operadores = [
    "Deygles Matos",
    "Filipe Lopes",
    "Gabriel Lagoa",
    "Kaique Teixeira",
    "Lucas Paiva",
    "Marrony Portugal",
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
