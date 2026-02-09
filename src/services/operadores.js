export function carregarOperadores() {
  const operadores = [
    "Bryan Gomes",
    "Deygles Matos",
    "Filipe Lopes",
    "Gabriel Lagoa",
    "Heitor Zavoli",
    "Kaique Teixeira",
    "Lucas Paiva",
    "Pedro Frossard",
    "Vinícius Santos",
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
