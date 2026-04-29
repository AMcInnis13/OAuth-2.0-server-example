// src/utils/clients.js
// Helpers for looking up and validating OAuth clients.

const bcrypt = require('bcrypt');
const db = require('../db/database');

/**
 * Look up a client by ID and verify its secret.
 * Returns the client row on success, null on failure.
 * Constant-time comparison via bcrypt prevents timing attacks.
 */
async function authenticateClient(clientId, clientSecret) {
  const client = db.prepare('SELECT * FROM clients WHERE client_id = ?').get(clientId);
  if (!client) return null;

  const valid = await bcrypt.compare(clientSecret, client.client_secret);
  if (!valid) return null;

  return client;
}

/**
 * Fetch a client by ID without verifying its secret.
 * Used at the /authorize step where the secret isn't presented.
 */
function getClient(clientId) {
  return db.prepare('SELECT * FROM clients WHERE client_id = ?').get(clientId);
}

/**
 * Check that the requested redirect_uri is in the client's allowlist.
 * Exact string match only — no prefix matching (that's a security risk).
 */
function isRedirectUriAllowed(client, redirectUri) {
  const allowed = JSON.parse(client.redirect_uris);
  return allowed.includes(redirectUri);
}

/**
 * Check that every requested scope is covered by the client's allowed_scopes.
 */
function areScopesAllowed(client, requestedScope) {
  const allowed = new Set(client.allowed_scopes.split(' '));
  const requested = requestedScope.split(' ');
  return requested.every(s => allowed.has(s));
}

module.exports = { authenticateClient, getClient, isRedirectUriAllowed, areScopesAllowed };
