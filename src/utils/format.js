export function formatarTempo(segundos) {
  const hh = String(Math.floor(segundos / 3600)).padStart(2, '0');
  const mm = String(Math.floor((segundos % 3600) / 60)).padStart(2, '0');
  const ss = String(segundos % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function calcularTempoIdeal(qtdPecas, tempoPorPeca = 8.116) {
  const segundosTotais = Math.round(qtdPecas * tempoPorPeca);
  return formatarTempo(segundosTotais);
}

export function porcentagem(parcial, total) {
  return total > 0 ? Math.round((parcial / total) * 100) : 0;
}
