export function formatarTempo(segundos) {
  const hh = String(Math.floor(segundos / 3600)).padStart(2, "0");
  const mm = String(Math.floor((segundos % 3600) / 60)).padStart(2, "0");
  const ss = String(segundos % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function calcularTempoIdeal(qtdPecas, tpsIdealBase, fator = 0.8) {
  const tempoPorPecaIdeal = tpsIdealBase * fator;
  const segundosTotais = Math.round(qtdPecas * tempoPorPecaIdeal);
  return formatarTempo(segundosTotais);
}

export function porcentagem(parcial, total) {
  return total > 0 ? Math.round((parcial / total) * 100) : 0;
}

// --- fetch config (VIEW) com fallback
export async function getPickingConfig(supabase) {
  const fallback = { tps_ideal_base: 12.042379, fator: 0.8 };

  const { data, error } = await supabase
    .from("vw_picking_tps_config")
    .select("tps_ideal_base,fator")
    .single();

  if (error || !data) return fallback;

  const tps = Number(data.tps_ideal_base);
  const fator = Number(data.fator);

  return {
    tps_ideal_base: Number.isFinite(tps) ? tps : fallback.tps_ideal_base,
    fator: Number.isFinite(fator) ? fator : fallback.fator,
  };
}
