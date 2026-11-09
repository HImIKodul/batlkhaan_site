import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Library build for the design-system entry (see src/ds-entry.tsx). Output: ds-lib/dist/{index.es.js,style.css}
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'ds-lib/dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: resolve(__dirname, 'src/ds-entry.tsx'), formats: ['es'], fileName: () => 'index.es.js', cssFileName: 'style' },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'] },
  },
});
