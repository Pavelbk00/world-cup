import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false, // Строго false для продакшна
    minify: 'esbuild', // Встроенный минификатор (не требует установки terser)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor'; // Выносит библиотеки в отдельный кэшируемый файл
          }
        }
      }
    }
  }
});
