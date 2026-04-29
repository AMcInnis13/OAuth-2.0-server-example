// src/db/database.js
// Uses SQLite via better-sqlite3 for zero-config local storage.
// Swap this out for postgres/mysql in production — the query shapes stay the same.

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../oauth.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initializeSchema() {
  db.exec(`
    -- Registered OAuth clients (your apps)
    CREATE TABLE IF NOT EXISTS clients (
      client_id     TEXT PRIMARY KEY,
      client_secret TEXT NOT NULL,          -- bcrypt hash
      name          TEXT NOT NULL,
      redirect_uris TEXT NOT NULL,          -- JSON array of allowed URIs
      allowed_scopes TEXT NOT NULL          -- space-separated e.g. "read:profile write:posts"
    );

    -- Your application's users
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name          TEXT NOT NULL
    );

    -- Short-lived authorization codes (step 5 in the flow)
    -- Expire after 10 minutes and can only be used once
    CREATE TABLE IF NOT EXISTS auth_codes (
      code          TEXT PRIMARY KEY,
      client_id     TEXT NOT NULL REFERENCES clients(client_id),
      user_id       INTEGER NOT NULL REFERENCES users(id),
      redirect_uri  TEXT NOT NULL,
      scope         TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,       -- Unix timestamp
      used          INTEGER DEFAULT 0       -- boolean: 0=unused, 1=used
    );

    -- Refresh tokens (long-lived, stored so we can revoke them)
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token         TEXT PRIMARY KEY,
      client_id     TEXT NOT NULL REFERENCES clients(client_id),
      user_id       INTEGER NOT NULL REFERENCES users(id),
      scope         TEXT NOT NULL,
      expires_at    INTEGER NOT NULL,
      revoked       INTEGER DEFAULT 0
    );
  `);
}

function seedDemoData() {
  const bcrypt = require('bcrypt');

  // Only seed if clients table is empty
  const existing = db.prepare('SELECT COUNT(*) as n FROM clients').get();
  if (existing.n > 0) return;

  // Demo client — in production, provide a registration endpoint instead
  const hashedSecret = bcrypt.hashSync('demo-client-secret', 10);
  db.prepare(`
    INSERT INTO clients (client_id, client_secret, name, redirect_uris, allowed_scopes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'demo-client',
    hashedSecret,
    'Demo Application',
    JSON.stringify(['http://localhost:4000/callback']),
    'read:profile write:posts'
  );

  // Demo user
  const hashedPassword = bcrypt.hashSync('password123', 10);
  db.prepare(`
    INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)
  `).run('alice@example.com', hashedPassword, 'Alice');

  console.log('[db] Seeded demo client and user');
}

initializeSchema();
seedDemoData();

module.exports = db;
