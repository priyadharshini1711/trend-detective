import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isBookCode, mergeCases, sanitizeCases, type SavedCase } from './src/lib/caseMerge';

/**
 * Local stand-in for the Netlify Blobs function while running `npm run dev`.
 * Casebooks are saved as JSON files in frontend/.data/casebooks/ — same endpoint, same behaviour.
 * In production (Netlify) the real function in netlify/functions/cases.mts takes over.
 */
function devCasebookStore(): Plugin {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.data', 'casebooks');
  return {
    name: 'dev-casebook-store',
    configureServer(server) {
      server.middlewares.use('/.netlify/functions/cases', async (req, res) => {
        const send = (body: unknown, status = 200) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
        try {
          const book = (new URL(req.url ?? '/', 'http://x').searchParams.get('book') ?? '').toUpperCase();
          if (!isBookCode(book)) return send({ error: 'Invalid casebook code' }, 400);
          const file = path.join(dir, `${book}.json`);
          let existing: SavedCase[] = [];
          try { existing = JSON.parse(await readFile(file, 'utf8')).cases ?? []; } catch { /* new book */ }
          if (req.method === 'GET') return send({ cases: existing });
          if (req.method === 'PUT' || req.method === 'POST') {
            let text = '';
            for await (const chunk of req) text += chunk;
            if (text.length > 400_000) return send({ error: 'Casebook too large' }, 413);
            const merged = mergeCases(existing, sanitizeCases(JSON.parse(text).cases));
            await mkdir(dir, { recursive: true });
            await writeFile(file, JSON.stringify({ cases: merged, updatedAt: Date.now() }, null, 2));
            return send({ cases: merged });
          }
          send({ error: 'Method not allowed' }, 405);
        } catch (e) { send({ error: String(e) }, 500); }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devCasebookStore()],
  server: {
    proxy: {
      '/power': { target: 'https://power.larc.nasa.gov', changeOrigin: true, rewrite: p => p.replace(/^\/power/, '') },
    },
  },
  build: { chunkSizeWarningLimit: 1200 },
});
