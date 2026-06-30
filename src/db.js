import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dir, '../data/austlii.db');

let _db;

export function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma('foreign_keys = ON');

  _db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      guid         TEXT    UNIQUE NOT NULL,
      feed_code    TEXT    NOT NULL,
      type         TEXT    NOT NULL,
      jurisdiction TEXT    NOT NULL,
      title        TEXT,
      url          TEXT,
      pub_date     TEXT,
      description  TEXT,
      full_text    TEXT,
      summary      TEXT,
      area_of_law  TEXT,
      fetched_at   TEXT    DEFAULT (datetime('now')),
      updated_at   TEXT    DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_type          ON documents(type);
    CREATE INDEX IF NOT EXISTS idx_jurisdiction ON documents(jurisdiction);
    CREATE INDEX IF NOT EXISTS idx_feed_code   ON documents(feed_code);
    CREATE INDEX IF NOT EXISTS idx_pub_date    ON documents(pub_date);
    CREATE INDEX IF NOT EXISTS idx_title       ON documents(title);

    CREATE TABLE IF NOT EXISTS feed_runs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_code   TEXT    NOT NULL,
      ran_at      TEXT    DEFAULT (datetime('now')),
      items_found INTEGER DEFAULT 0,
      items_new   INTEGER DEFAULT 0,
      error       TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_feed_runs_code ON feed_runs(feed_code);

    -- Full-text search over title + description + full_text
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      title,
      description,
      full_text,
      content=documents,
      content_rowid=id
    );

    CREATE TRIGGER IF NOT EXISTS documents_fts_insert
      AFTER INSERT ON documents BEGIN
        INSERT INTO documents_fts(rowid, title, description, full_text)
        VALUES (new.id, new.title, new.description, new.full_text);
      END;

    CREATE TRIGGER IF NOT EXISTS documents_fts_update
      AFTER UPDATE ON documents BEGIN
        INSERT INTO documents_fts(documents_fts, rowid, title, description, full_text)
        VALUES ('delete', old.id, old.title, old.description, old.full_text);
        INSERT INTO documents_fts(rowid, title, description, full_text)
        VALUES (new.id, new.title, new.description, new.full_text);
      END;
  `);

  // Safe migrations for columns added after initial schema
  for (const col of ['summary TEXT', 'area_of_law TEXT']) {
    try { _db.exec(`ALTER TABLE documents ADD COLUMN ${col}`); } catch {}
  }
  // Index for area_of_law created after migration so column definitely exists
  try { _db.exec(`CREATE INDEX IF NOT EXISTS idx_area_of_law ON documents(area_of_law)`); } catch {}

  return _db;
}

export function upsertDocument(doc) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM documents WHERE guid = ?').get(doc.guid);

  if (existing) {
    db.prepare(`
      UPDATE documents SET
        title = ?, url = ?, pub_date = ?, description = ?, updated_at = datetime('now')
      WHERE guid = ?
    `).run(doc.title, doc.url, doc.pub_date, doc.description, doc.guid);
    return { inserted: false, id: existing.id };
  }

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO documents (guid, feed_code, type, jurisdiction, title, url, pub_date, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(doc.guid, doc.feed_code, doc.type, doc.jurisdiction, doc.title, doc.url, doc.pub_date, doc.description);

  return { inserted: true, id: lastInsertRowid };
}

export function updateFullText(id, text) {
  getDb().prepare(`
    UPDATE documents SET full_text = ?, updated_at = datetime('now') WHERE id = ?
  `).run(text, id);
}

export function logFeedRun(feedCode, itemsFound, itemsNew, error = null) {
  getDb().prepare(`
    INSERT INTO feed_runs (feed_code, items_found, items_new, error) VALUES (?, ?, ?, ?)
  `).run(feedCode, itemsFound, itemsNew, error);
}

export function search(query, { type, jurisdiction, limit = 50 } = {}) {
  const db = getDb();
  let sql = `
    SELECT d.id, d.title, d.url, d.pub_date, d.type, d.jurisdiction, d.feed_code,
           snippet(documents_fts, 1, '<b>', '</b>', '…', 32) AS snippet
    FROM documents_fts f
    JOIN documents d ON d.id = f.rowid
    WHERE documents_fts MATCH ?
  `;
  const params = [query];
  if (type) { sql += ' AND d.type = ?'; params.push(type); }
  if (jurisdiction) { sql += ' AND d.jurisdiction = ?'; params.push(jurisdiction); }
  sql += ' ORDER BY rank LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function stats() {
  const db = getDb();
  return {
    total:       db.prepare('SELECT COUNT(*) AS n FROM documents').get().n,
    case_law:    db.prepare("SELECT COUNT(*) AS n FROM documents WHERE type='case_law'").get().n,
    legislation: db.prepare("SELECT COUNT(*) AS n FROM documents WHERE type='legislation'").get().n,
    by_jurisdiction: db.prepare(
      'SELECT jurisdiction, COUNT(*) AS n FROM documents GROUP BY jurisdiction ORDER BY n DESC'
    ).all(),
    with_fulltext: db.prepare('SELECT COUNT(*) AS n FROM documents WHERE full_text IS NOT NULL').get().n,
  };
}
