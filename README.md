# 📦 Picking Kaisan

Sistema de picking web para operações de logística.

## Tecnologias
- HTML/CSS/JS (Vanilla)
- Supabase (PostgreSQL + Auth)
- Bootstrap 5
- [Vite](https://vitejs.dev/) (para desenvolvimento e build)

## Ambiente de desenvolvimento

1. Crie um arquivo `.env` na raiz com as variáveis abaixo. O Vite disponibiliza
   qualquer chave prefixada com `VITE_` via `import.meta.env` no código.

```bash
VITE_SUPABASE_URL=<sua-url-supabase>
VITE_SUPABASE_KEY=<sua-chave-api>
```

2. Instale as dependências e inicie o servidor de desenvolvimento:

```bash
npm install
npm run dev
```

Durante o `npm run dev` o Vite recarrega a página a cada alteração.

## Produção

Após executar `npm run build` os arquivos gerados em `dist/` podem ser
hospedados de forma estática. Ao implantar no Vercel, defina as mesmas
variáveis de ambiente e a função serverless `api/env.js` irá expor as chaves em
`window.env` para o HTML.