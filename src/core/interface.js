export function mostrarToast(msg, tipo = "info") {
  const cor = tipo === "success"
    ? "bg-success"
    : tipo === "error"
    ? "bg-danger"
    : tipo === "warning"
    ? "bg-warning text-dark"
    : "bg-primary";

  const toast = document.createElement("div");
  toast.className = `toast fade show align-items-center text-white ${cor} border-0`;
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  document.getElementById("toast-container").appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

export function checarModoStandalone() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone;
  if (!standalone) {
    setTimeout(() => {
      mostrarToast("📱 Para instalar como app: use o menu ⋮ e 'Instalar app'", "warning");
    }, 3000);
  }
}
