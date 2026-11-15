// Netlify Function: stores each casebook in Netlify Blobs (free, built into every Netlify site — no database to set up).
// Endpoint: /.netlify/functions/cases?book=ABCD-EFGH
//   GET → { cases }        PUT { cases } → merges with what's stored, returns { cases }
import { getStore } from '@netlify/blobs';
import { isBookCode, mergeCases, sanitizeCases, type SavedCase } from '../../src/lib/caseMerge';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async (req: Request) => {
  const book = (new URL(req.url).searchParams.get('book') ?? '').toUpperCase();
  if (!isBookCode(book)) return json({ error: 'Invalid casebook code' }, 400);

  const store = getStore({ name: 'casebooks', consistency: 'strong' });
  const existing = ((await store.get(book, { type: 'json' })) as { cases?: SavedCase[] } | null)?.cases ?? [];

  if (req.method === 'GET') return json({ cases: existing });

  if (req.method === 'PUT' || req.method === 'POST') {
    const text = await req.text();
    if (text.length > 400_000) return json({ error: 'Casebook too large' }, 413);
    let incoming: SavedCase[];
    try { incoming = sanitizeCases(JSON.parse(text).cases); } catch { return json({ error: 'Bad JSON' }, 400); }
    const merged = mergeCases(existing, incoming);
    await store.setJSON(book, { cases: merged, updatedAt: Date.now() });
    return json({ cases: merged });
  }

  return json({ error: 'Method not allowed' }, 405);
};
