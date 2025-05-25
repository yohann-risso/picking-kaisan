import { state } from "../config.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { toast } from "../components/Toast.js";
import { calcularDuracao } from "./cronometro.js";

export function finalizarPicking() {
  clearTimeout(state.cronometroInterval);

  const operador = document.getElementById("operador").value;
  const grupo = document.getElementById("grupo").value;

  const resumo = {
    operador,
    grupo,
    tempoExecucao: calcularDuracao(),
    retirados: state.retirados,
    pendentes: state.produtos,
  };

  gerarPDF(resumo);

  localStorage.removeItem("pickingProgresso");
  state.produtos = [];
  state.retirados = [];
  state.tempoInicio = null;

  document.getElementById("grupo").disabled = false;
  document.getElementById("operador").disabled = false;
  document.getElementById("btnIniciar").classList.remove("d-none");
  document.getElementById("btnFinalizar").classList.add("d-none");
  document.getElementById("cards").innerHTML = "";
  document.getElementById("pendentesList").innerHTML = "";
  document.getElementById("retiradosList").innerHTML = "";
  document.getElementById("cronometro").textContent = "00:00:00";
  document.getElementById("ideal").textContent = "";
  document.getElementById("progressoPicking").style.width = "0%";
  document.getElementById("progressoPicking").textContent = "0%";

  toast("Pronto para iniciar novo picking! 🚀", "success");
}

function gerarPDF(resumo) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("📦 Resumo de Picking", 20, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  doc.text(`Operador: ${resumo.operador}`, 20, 35);
  doc.text(`Grupo: ${resumo.grupo}`, 20, 42);
  doc.text(`Tempo: ${resumo.tempoExecucao}`, 20, 49);
  doc.text(`Data: ${new Date().toLocaleString()}`, 20, 56);

  doc.text("✅ Retirados:", 20, 70);
  resumo.retirados.forEach((p, i) => {
    doc.text(
      `${i + 1}. SKU: ${p.sku} | Produto: ${p.descricao || "-"} | Caixa: ${
        p.caixa
      }`,
      20,
      80 + i * 7
    );
  });

  doc.save(`Picking_Grupo${resumo.grupo}_${resumo.operador}.pdf`);
}
