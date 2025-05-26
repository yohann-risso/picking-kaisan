import { carregarGrupos, carregarTodosRefs } from './services/supabase.js';
import { restaurarCacheLocal } from './utils/storage.js';
import { checarModoStandalone, atualizarQtdCards } from './core/interface.js';
import { carregarOperadores, biparProduto } from './core/picking.js';
import { finalizarPicking } from './core/finalizar.js';
import { carregarProdutos } from './services/supabase.js';

// ✅ GARANTE que DOM e assets estejam carregados mesmo se script estiver no <head>
window.addEventListener('load', async () => {
  console.log('✅ window.onload: DOM e assets carregados');


  const btnIniciar = document.getElementById('btnIniciar');
  console.log('🔍 btnIniciar:', btnIniciar);

  if (btnIniciar) {
    btnIniciar.addEventListener('click', () => {
      console.log("🖱️ Clique no botão 'Iniciar'");
      carregarProdutos();
    });
  } else {
    console.warn('⚠️ Botão #btnIniciar não encontrado no DOM.');
  }

  try {
    // 🔐 Variáveis de ambiente seguras
    window.env = {
      SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      GAS_ZERAR_URL: import.meta.env.VITE_GAS_ZERAR_URL
    };

    // 🔄 Inicialização de dados
    carregarOperadores();
    await carregarGrupos();
    await carregarTodosRefs();
    restaurarCacheLocal();
    checarModoStandalone();

    // ✅ Conecta os eventos da interface
    document.getElementById('btnIniciar')?.addEventListener('click', () => {
      console.log("🖱️ Clique no botão 'Iniciar'");
      carregarProdutos();
    });

    document.getElementById('btnFinalizar')?.addEventListener('click', finalizarPicking);
    document.getElementById('btnConfirmarSKU')?.addEventListener('click', biparProduto);

    document.getElementById('skuInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') biparProduto();
    });

    document.getElementById('qtdCards')?.addEventListener('input', atualizarQtdCards);

  } catch (e) {
    console.error('❌ Erro ao carregar aplicação:', e);
  }

  console.log('Main carregado ✅');
});

// 🌍 Exporta para o console global (debug/teste)
window.carregarProdutos = carregarProdutos;
window.biparProduto = biparProduto;
window.finalizarPicking = finalizarPicking;
window.atualizarQtdCards = atualizarQtdCards;
window.carregarGrupos = carregarGrupos;
window.carregarTodosRefs = carregarTodosRefs;
window.restaurarCacheLocal = restaurarCacheLocal;
window.checarModoStandalone = checarModoStandalone;
console.log('Exportando funções para o console global ✅');
// 🌟 Exibe mensagem de boas-vindas
console.log('🌟 Bem-vindo ao sistema de Picking! Carregando...');

