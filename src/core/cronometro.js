import { state } from '../config.js';

export function iniciarCronometro() {
  const cronometro = () => {
    const diff = new Date(new Date() - state.tempoInicio);
    const hh = String(diff.getUTCHours()).padStart(2, "0");
    const mm = String(diff.getUTCMinutes()).padStart(2, "0");
    const ss = String(diff.getUTCSeconds()).padStart(2, "0");
    document.getElementById("cronometro").textContent = `${hh}:${mm}:${ss}`;
    state.cronometroInterval = setTimeout(cronometro, 1000);
  };
  cronometro();
}

export function calcularDuracao() {
  if (!state.tempoInicio) return "00:00:00";
  const diff = new Date(new Date() - state.tempoInicio);
  return [diff.getUTCHours(), diff.getUTCMinutes(), diff.getUTCSeconds()]
    .map(n => String(n).padStart(2, "0")).join(":");
}
