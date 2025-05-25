import { carregarGrupos, carregarTodosRefs } from './services/supabase.js';
import { restaurarCacheLocal } from './utils/storage.js';
import { checarModoStandalone, atualizarQtdCards } from './core/interface.js';
import { carregarOperadores, biparProduto } from './core/picking.js';
import { finalizarPicking } from './core/finalizar.js'; // certifique-se de que esteja criado
import { carregarProdutos } from './services/supabase.js'; // se estiver separado, senão importe de onde estiver

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 🔐 Carrega variáveis seguras de ambiente (usadas no frontend)
    window.env = {
      SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      GAS_ZERAR_URL: import.meta.env.VITE_GAS_ZERAR_URL
    };

    // 🔄 Inicialização dos dados básicos
    carregarOperadores();
    await carregarGrupos();
    await carregarTodosRefs();
    restaurarCacheLocal();
    checarModoStandalone();

    // ✅ Conectando a interface com as funções do app
    document.getElementById('btnIniciar')?.addEventListener('click', carregarProdutos);
    document.getElementById('btnFinalizar')?.addEventListener('click', finalizarPicking);
    document.getElementById('btnConfirmarSKU')?.addEventListener('click', biparProduto);

    document.getElementById('skuInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') biparProduto();
    });

    document.getElementById('qtdCards')?.addEventListener('input', atualizarQtdCards);

  } catch (e) {
    console.error("❌ Erro ao carregar aplicação:", e);
  }
});
