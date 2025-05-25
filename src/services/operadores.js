export function carregarOperadores() {
  const operadores = [
    "Alan Ramos", "Anderson Dutra", "Arthur Oliveira", "Felipe Moraes",
    "Filipe Silva", "Gabriel Lagoa", "João Alves", "Kaique Teixeira",
    "Marrony Portugal", "Nalbert Pereira", "Rodrigo Novaes",
    "Rony Côrrea", "Ykaro Oliveira", "Yohann Risso"
  ];
  document.getElementById("operador").innerHTML = operadores.map(op => `<option value="${op}">${op}</option>`).join("");
}
