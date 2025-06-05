import { state } from "../config.js";
import { iniciarCronometro } from "../core/cronometro.js";
import { atualizarInterface } from "../core/interface.js";

export function restaurarCacheLocal() {
  const salvo = localStorage.getItem("pickingProgresso");
  if (!salvo) return;

  const dados = JSON.parse(salvo);
  document.getElementById("grupoSalvo").textContent = dados.grupo;

  const modal = new bootstrap.Modal(
    document.getElementById("modalRestaurarPicking")
  );
  modal.show();

  document.getElementById("btnConfirmarRestaurar").onclick = () => {
    // Atribui aos elementos de contexto global
    window.grupoSelecionado = dados.grupo;
    window.operadorSelecionado = dados.operador;

    // Atualiza na interface
    document.getElementById("grupoAtivo").textContent = `Grupo ${dados.grupo}`;
    document.getElementById("nomeOperador").textContent = dados.operador;

    // Atualiza o estado da aplicação
    state.produtos = dados.produtos || [];
    state.retirados = dados.retirados || [];
    state.tempoInicio = dados.tempoInicio
      ? new Date(dados.tempoInicio)
      : new Date();

    // Ajustes visuais
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
    grupo: window.grupoSelecionado,
    operador: window.operadorSelecionado,
    produtos: state.produtos,
    retirados: state.retirados,
    tempoInicio: state.tempoInicio?.toISOString() || null,
  };
  localStorage.setItem("pickingProgresso", JSON.stringify(dados));
}
