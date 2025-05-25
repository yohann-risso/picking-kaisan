import { state } from '../config.js';
import { iniciarCronometro } from './cronometro.js';
import { atualizarInterface } from './interface.js';

export function restaurarCacheLocal() {
  const salvo = localStorage.getItem("pickingProgresso");
  if (!salvo) return;

  const dados = JSON.parse(salvo);
  document.getElementById("grupoSalvo").textContent = dados.grupo;

  const modal = new bootstrap.Modal(document.getElementById("modalRestaurarPicking"));
  modal.show();

  document.getElementById("btnConfirmarRestaurar").onclick = () => {
    document.getElementById("grupo").value = dados.grupo;
    document.getElementById("operador").value = dados.operador;
    state.produtos = dados.produtos || [];
    state.retirados = dados.retirados || [];
    state.tempoInicio = dados.tempoInicio ? new Date(dados.tempoInicio) : new Date();

    document.getElementById("grupo").disabled = true;
    document.getElementById("operador").disabled = true;
    document.getElementById("btnIniciar").classList.add("d-none");
    document.getElementById("btnFinalizar").classList.remove("d-none");
    document.getElementById("card-tempo").classList.remove("d-none");

    iniciarCronometro();
    atualizarInterface();
    modal.hide();
  };

  document.getElementById("btnCancelarRestaurar").onclick = () => {
    localStorage.removeItem("pickingProgresso");
  };
}

export function salvarProgressoLocal() {
  const dados = {
    grupo: document.getElementById("grupo").value,
    operador: document.getElementById("operador").value,
    produtos: state.produtos,
    retirados: state.retirados,
    tempoInicio: state.tempoInicio?.toISOString() || null
  };
  localStorage.setItem("pickingProgresso", JSON.stringify(dados));
}
