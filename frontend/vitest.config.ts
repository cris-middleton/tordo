import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // `e2e/` es de Playwright, que trae su propio runner. Sin excluirlo, vitest
    // recoge esos ficheros, falla al cargarlos y el conteo de tests sigue en
    // verde: "27 passed" junto a "3 files failed".
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    // Registra los matchers de jest-dom (`toBeInTheDocument`, etc.) para los
    // tests que renderizan un componente en vez de sólo inspeccionar ficheros.
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
});
