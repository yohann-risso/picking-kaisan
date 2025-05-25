import { toast } from '../components/Toast.js';
import { mostrarLoaderInline, esconderLoaderInline } from '../utils/interface.js';
import { calcularTempoIdeal } from '../utils/format.js';

export async function zerarEnderecoExterno(endereco) {
  const match = endereco.match(/A(\d+)-B(\d+)-R(\d+)/);
  if (!match) return toast("❌ Endereço inválido", "error");

  const operador = encodeURIComponent(document.getElementById("operador").value);
  const time = encodeURIComponent(new Date().toLocaleString());
  const ws = `${match[1]}-${match[2]}-${match[3]}`;
  const loaderId = `loader-zerar-${endereco}`;

  const url = `${window.env.GAS_ZERAR_URL}&WS=${encodeURIComponent(ws)}&func=Update&ENDERECO=${encodeURIComponent(endereco)}&SKU=VAZIO&OPERADOR=${operador}&TIME=${time}`;

  mostrarLoaderInline(loaderId);
  try {
    const res = await fetch(url);
    const txt = await res.text();
    if (!res.ok) throw new Error(txt);
    toast(`✅ Endereço ${endereco} marcado para zeramento.`, "success");
  } catch (e) {
    toast("❌ Falha ao marcar zeramento.", "error");
  } finally {
    esconderLoaderInline(loaderId);
    calcularTempoIdeal(); // depende do seu fluxo
  }
}
