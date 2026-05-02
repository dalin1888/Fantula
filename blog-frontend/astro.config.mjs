import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://blog.fantula.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
