export const state = {
  produtos: [],
  retirados: [],
  tempoInicio: null,
  cronometroInterval: null,
};

export function getHeaders() {
  return {
    apikey: import.meta.env.VITE_SUPABASE_KEY,
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}
