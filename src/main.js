import { carregarGrupos, carregarTodosRefs } from './services/supabase.js';
import { restaurarCacheLocal } from './utils/storage.js';
import { checarModoStandalone, atualizarQtdCards } from './core/interface.js';
import { carregarOperadores, biparProduto } from './core/picking.js';
import { finalizarPicking } from './core/finalizar.js';
import { carregarProdutos } from './services/supabase.js';
import { zerarEnderecoExterno } from './services/googleSheet.js';
import { mostrarLoaderInline, esconderLoaderInline } from './core/interface.js';

// ✅ Garante que DOM e assets estejam carregados mesmo se script estiver no <head>
window.addEventListener('load', async () => {
  console.log('✅ window.onload: DOM e assets carregados');

  // 🔐 Tenta carregar variáveis de ambiente via API, com fallback para import.meta.env
  let env;
  try {
    const res = await fetch('/api/env');
    if (!res.ok) throw new Error("API /api/env falhou");
    env = await res.json();
    console.log("🔐 Variáveis carregadas do /api/env:", env);
  } catch (err) {
    console.warn("⚠️ Falha ao acessar /api/env, usando import.meta.env como fallback.");
    env = {
      SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
      SUPABASE_KEY: import.meta.env.VITE_SUPABASE_KEY,
      GAS_ZERAR_URL: import.meta.env.VITE_GAS_ZERAR_URL
    };
  }

  window.env = env;

  // 🔄 Inicialização do app
  try {
    carregarOperadores();
    await carregarGrupos();
    await carregarTodosRefs();
    restaurarCacheLocal();
    checarModoStandalone();
  } catch (e) {
    console.error('❌ Erro ao carregar aplicação:', e);
  }

  // ✅ Conecta eventos da interface
  const btnIniciar = document.getElementById('btnIniciar');
  console.log('🔍 btnIniciar:', btnIniciar);
  btnIniciar?.addEventListener('click', () => {
    console.log("🖱️ Clique no botão 'Iniciar'");
    carregarProdutos();
  });

  document.getElementById('btnConfirmarSKU')?.addEventListener('click', () => {
    console.log("🖱️ Clique em Confirmar SKU");
    biparProduto();
  });

  document.getElementById('btnFinalizar')?.addEventListener('click', () => {
    console.log("🛑 Clique em Finalizar");
    finalizarPicking();
  });

  document.getElementById('skuInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      console.log("⌨️ Enter pressionado no SKU");
      biparProduto();
    }
  });

  document.getElementById('qtdCards')?.addEventListener('input', () => {
    console.log("🎚️ Alterou quantidade de cards");
    atualizarQtdCards();
  });

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
window.zerarEnderecoExterno = zerarEnderecoExterno;
window.mostrarLoaderInline = mostrarLoaderInline;
window.esconderLoaderInline = esconderLoaderInline;

console.log('Exportando funções para o console global ✅');
console.log('🌟 Bem-vindo ao sistema de Picking! Carregando...');
