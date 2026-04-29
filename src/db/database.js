// src/db/database.js
// Uses sql.js — a pure JavaScript SQLite port, no native compilation needed.
// Data is held in memory and flushed to disk after every write.
// Swap this out for postgres/mysql in production.

const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../oauth.db');

let _db = null;

async function initializeDb() {
  if (_db) return _db;

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    _db = new SQL.Database();
  }

  const originalRun = _db.run.bind(_db);
  _db.run = function (sql, params) {
    const result = originalRun(sql, params);
    fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
    return result;
  };

  createSchema();
  seedDemoData();

  return _db;
}

function prepare(sql) {
  if (!_db) throw new Error('Database not initialized — make sure initializeDb() was awaited in index.js');

  return {
    run(...args) {
      _db.run(sql, args.flat());
    },
    get(...args) {
      const stmt = _db.prepare(sql);
      stmt.bind(args.flat());
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },
    all(...args) {
      const rows = [];
      const stmt = _db.prepare(sql);
      stmt.bind(args.flat());
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
  };
}

function exec(sql) {
  if (!_db) throw new Error('Database not initialized');
  _db.run(sql);
}

function createSchema() {
  const statements = `
    CREATE TABLE IF NOT EXISTS clients (
      client_id      TEXT PRIMARY KEY,
      client_secret  TEXT NOT NULL,
      name           TEXT NOT NULL,
      redirect_uris  TEXT NOT NULL,
      allowed_scopes TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_codes (
      code         TEXT PRIMARY KEY,
      client_id    TEXT NOT NULL,
      user_id      INTEGER NOT NULL,
      redirect_uri TEXT NOT NULL,
      scope        TEXT NOT NULL,
      expires_at   INTEGER NOT NULL,
      used         INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token      TEXT PRIMARY KEY,
      client_id  TEXT NOT NULL,
      user_id    INTEGER NOT NULL,
      scope      TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked    INTEGER DEFAULT 0
    );
  `.split(';').map(s => s.trim()).filter(Boolean);

  for (const stmt of statements) _db.run(stmt);
  fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

function seedDemoData() {
  const bcrypt = require('bcrypt');
  const row = prepare('SELECT COUNT(*) as n FROM clients').get();
  if (row && row.n > 0) return;

  prepare(`INSERT INTO clients (client_id, client_secret, name, redirect_uris, allowed_scopes) VALUES (?, ?, ?, ?, ?)`)
    .run('demo-client', bcrypt.hashSync('demo-client-secret', 10), 'Demo Application', JSON.stringify(['http://localhost:4000/callback']), 'read:profile write:posts');

  prepare(`INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)`)
    .run('alice@example.com', bcrypt.hashSync('password123', 10), 'Alice');

  console.log('[db] Seeded demo client and user');
}

module.exports = { initializeDb, prepare, exec };
