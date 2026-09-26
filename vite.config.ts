import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the same build runs from a subpath or an
  // artifact host as well as from a domain root.
  base: './',
  server: {
    port: 5173,
  },
});
