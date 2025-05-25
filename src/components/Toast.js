/**
 * Mostra um toast de feedback visual no canto inferior direito da tela
 * @param {string} msg - Texto da mensagem
 * @param {"success"|"error"|"warning"|"info"} tipo - Tipo visual do toast
 */
export function toast(msg, tipo = "info") {
  const cor =
    tipo === "success"
      ? "bg-success"
      : tipo === "error"
      ? "bg-danger"
      : tipo === "warning"
      ? "bg-warning text-dark"
      : "bg-primary";

  const toast = document.createElement("div");
  toast.className = `toast fade show align-items-center text-white ${cor} border-0`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");

  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;

  const container = document.getElementById("toast-container");
  if (container) {
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
}
