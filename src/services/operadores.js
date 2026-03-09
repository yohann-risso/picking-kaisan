export function carregarOperadores() {
  const operadores = [
    "Arthur Gonçalves",
    "Bryan Gomes",
    "Deygles Matos",
    "Filipe Lopes",
    "Gabriel Brunhal",
    "Gabriel Lagoa",
    "Hebert Teixeira",
    "Heitor Zavoli",
    "Ivan Vieira",
    "Kaique Teixeira",
    "Lucas Paiva",
    "Luiz Otávio",
    "Pedro Frossard",
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
