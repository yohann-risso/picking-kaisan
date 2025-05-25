import { carregarGrupos, carregarTodosRefs } from './services/supabase.js';
import { restaurarCacheLocal } from './utils/storage.js';
import { checarModoStandalone } from './utils/interface.js';
import { carregarOperadores } from './services/operadores.js';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    window.env = {
      SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      GAS_ZERAR_URL: import.meta.env.VITE_GAS_ZERAR_URL
    };

    carregarOperadores();
    await carregarGrupos();
    await carregarTodosRefs();
    restaurarCacheLocal();
    checarModoStandalone();
  } catch (e) {
    console.error("❌ Erro ao carregar aplicação:", e);
  }
});
