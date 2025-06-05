import { state } from "../config.js";
import { salvarProgressoLocal } from "../utils/storage.js";
import { toast } from "../components/Toast.js";
import { calcularDuracao } from "./cronometro.js";

export async function finalizarPicking() {
  const confirmacao = confirm("Tem certeza que deseja finalizar o picking?");
  if (!confirmacao) return;

  const tempoFinal = new Date();
  const tempoExecucao = calcularDuracao(state.tempoInicio, tempoFinal);

  const resumo = {
    operador: window.operadorSelecionado,
    grupo: window.grupoSelecionado,
    tempoExecucao,
    retirados: state.retirados,
    total: state.totalPecas || 0,
    data: tempoFinal.toLocaleString(),
  };

  gerarPDF(resumo); // local (jsPDF)

  try {
    const GAS_URL = window.env?.GAS_FINALIZAR_URL;
    if (!GAS_URL) throw new Error("URL do GAS_FINALIZAR_URL não definida.");

    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resumo),
    });

    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg);
    }

    console.log("📩 Relatório enviado ao Google Apps Script com sucesso.");
  } catch (e) {
    console.warn("⚠️ Falha ao enviar resumo ao Google Apps Script:", e.message);
    toast("⚠️ Relatório não foi enviado ao Drive", "warning");
  }

  // Reset local
  localStorage.removeItem("pickingProgresso");
  state.produtos = [];
  state.retirados = [];
  state.totalPecas = 0;

  document.getElementById("cards").innerHTML = "";
  document.getElementById("pendentesList").innerHTML = "";
  document.getElementById("retiradosList").innerHTML = "";
  document.getElementById("btnFinalizar").classList.add("d-none");
  document.getElementById("card-tempo").classList.add("d-none");

  document.getElementById("progressoPicking").style.width = "0%";
  document.getElementById("progressoPicking").textContent = "0%";
  document.getElementById("qtdRetiradas").textContent = "0";
  document.getElementById("qtdTotal").textContent = "0";

  toast("✅ Picking finalizado com sucesso!", "success");

  setTimeout(() => {
    const modal = new bootstrap.Modal(document.getElementById("modalInicio"));
    modal.show();
  }, 800);
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
