import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  base: "/",
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {   // ✅ aqui corrigido
      input: {
        main: path.resolve(__dirname, "src/index.html"),
        admin: path.resolve(__dirname, "src/admin.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
  },
});
