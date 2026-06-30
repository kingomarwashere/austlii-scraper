/**
 * Simple HTTP API for querying the local AustLII database.
 * Run: node src/api.js
 * Default port: 4242
 *
 * Endpoints:
 *   GET /search?q=<query>[&type=case_law|legislation][&jurisdiction=nsw][&limit=50]
 *   GET /stats
 *   GET /document/:id
 */
import { createServer } from 'http';
import { getDb, search, stats } from './db.js';

const PORT = process.env.PORT || 4242;

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function notFound(res, msg = 'Not found') {
  json(res, { error: msg }, 404);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // GET /stats
  if (path === '/stats' && req.method === 'GET') {
    return json(res, stats());
  }

  // GET /search?q=...
  if (path === '/search' && req.method === 'GET') {
    const q    = url.searchParams.get('q');
    const type = url.searchParams.get('type');
    const jurisdiction = url.searchParams.get('jurisdiction');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);

    if (!q) return json(res, { error: 'q param required' }, 400);

    try {
      const results = search(q, { type, jurisdiction, limit });
      return json(res, { query: q, count: results.length, results });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  // GET /document/:id
  const docMatch = path.match(/^\/document\/(\d+)$/);
  if (docMatch && req.method === 'GET') {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(parseInt(docMatch[1], 10));
    if (!doc) return notFound(res);
    return json(res, doc);
  }

  // GET /feeds
  if (path === '/feeds' && req.method === 'GET') {
    const db = getDb();
    const runs = db.prepare(`
      SELECT feed_code, MAX(ran_at) AS last_run, SUM(items_found) AS total_found,
             SUM(items_new) AS total_new, COUNT(*) AS run_count
      FROM feed_runs
      GROUP BY feed_code ORDER BY last_run DESC
    `).all();
    return json(res, runs);
  }

  notFound(res);
});

getDb(); // initialise
server.listen(PORT, () => {
  console.log(`AustLII API listening on http://localhost:${PORT}`);
  console.log('  GET /stats');
  console.log('  GET /search?q=negligence&type=case_law&jurisdiction=nsw');
  console.log('  GET /document/:id');
  console.log('  GET /feeds');
});
