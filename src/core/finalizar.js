import { state } from "../config.js";
import { toast } from "../components/Toast.js";
import { calcularDuracao } from "./cronometro.js";
import { flushQueue, getQueueStats } from "../utils/queue.js";

export async function finalizarPicking() {
  const confirmacao = confirm("Tem certeza que deseja finalizar o picking?");
  if (!confirmacao) return;

  // 1) tenta sincronizar fila ANTES de consolidar o resumo
  const { stats } = await getQueueStats();
  const pend = stats.pending + stats.sending + stats.error;

  if (pend > 0) {
    toast(`⏳ Sincronizando ${pend} ações pendentes...`, "info");
    const flushed = await flushQueue({ timeoutMs: 8000 });
    if (!flushed) {
      toast(
        "📴 Não foi possível sincronizar tudo. Finalizando localmente mesmo assim.",
        "warning",
      );
    }
  }

  // 2) monta resumo (agora mais consistente)
  const tempoFinal = new Date();
  const tempoExecucao = calcularDuracao(state.tempoInicio, tempoFinal);

  const resumo = {
    operador: window.operadorSelecionado,
    grupo: window.grupoSelecionado,
    tempoExecucao,
    retirados: state.retirados,
    total: state.totalPecas || 0,
    data: tempoFinal.toLocaleString(),
    escopo: window.pickingContexto?.blocosSelecionados || [], // opcional: bom pra auditoria
  };

  // 3) PDF local
  gerarPDF(resumo);

  // 4) tenta enviar pro GAS
  try {
    const GAS_URL = window.env?.GAS_FINALIZAR_URL;
    if (!GAS_URL) throw new Error("URL do GAS_FINALIZAR_URL não definida.");

    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resumo),
    });

    if (!res.ok) throw new Error(await res.text());
    console.log("📩 Relatório enviado ao Google Apps Script com sucesso.");
  } catch (e) {
    console.warn("⚠️ Falha ao enviar resumo ao GAS:", e.message);
    toast("⚠️ Relatório não foi enviado ao Drive", "warning");
  }

  // 5) Reset local
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

  if (resumo.escopo?.length) {
    doc.text(`Escopo: ${resumo.escopo.join(", ")}`, 20, 63);
  }

  doc.text("✅ Retirados:", 20, 75);
  resumo.retirados.forEach((p, i) => {
    doc.text(
      `${i + 1}. SKU: ${p.sku} | Produto: ${p.descricao || "-"} | Caixa: ${
        p.caixa || "-"
      }`,
      20,
      85 + i * 7,
    );
  });

  doc.save(`Picking_Grupo${resumo.grupo}_${resumo.operador}.pdf`);
}
