// src/routes/token.js
//
// POST /token
//
// Handles two grant types:
//   1. authorization_code  — exchange a code for access + refresh tokens
//   2. refresh_token       — exchange a refresh token for a new access token

const express = require('express');
const db = require('../db/database');
const { authenticateClient } = require('../utils/clients');
const {
  signAccessToken,
  generateOpaqueToken,
  expiresAt,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} = require('../utils/tokens');

const router = express.Router();

// All token requests are application/x-www-form-urlencoded (per spec)
router.use(express.urlencoded({ extended: false }));

// ---------------------------------------------------------------------------
// Shared error helper — RFC 6749 §5.2 error format
// ---------------------------------------------------------------------------
function tokenError(res, error, description, status = 400) {
  return res.status(status).json({ error, error_description: description });
}

// ---------------------------------------------------------------------------
// Build the successful token response body
// ---------------------------------------------------------------------------
function buildTokenResponse(userId, clientId, scope) {
  const accessToken = signAccessToken({ userId, clientId, scope });
  const refreshToken = generateOpaqueToken();

  // Persist the refresh token so we can validate/revoke it later
  db.prepare(`
    INSERT INTO refresh_tokens (token, client_id, user_id, scope, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(refreshToken, clientId, userId, scope, expiresAt(REFRESH_TOKEN_EXPIRES_IN));

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRES_IN,
    refresh_token: refreshToken,
    scope,
  };
}

// ---------------------------------------------------------------------------
// POST /token
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  const { grant_type, client_id, client_secret } = req.body;

  // 1. Authenticate the client (client_id + client_secret)
  if (!client_id || !client_secret) {
    return tokenError(res, 'invalid_client', 'client_id and client_secret are required', 401);
  }

  const client = await authenticateClient(client_id, client_secret);
  if (!client) {
    return tokenError(res, 'invalid_client', 'Invalid client credentials', 401);
  }

  // 2. Route to the correct grant handler
  if (grant_type === 'authorization_code') {
    return handleAuthorizationCode(req, res, client);
  }

  if (grant_type === 'refresh_token') {
    return handleRefreshToken(req, res, client);
  }

  return tokenError(res, 'unsupported_grant_type', `Grant type "${grant_type}" is not supported`);
});

// ---------------------------------------------------------------------------
// Grant: authorization_code
// ---------------------------------------------------------------------------
async function handleAuthorizationCode(req, res, client) {
  const { code, redirect_uri } = req.body;

  if (!code)         return tokenError(res, 'invalid_request', 'missing code');
  if (!redirect_uri) return tokenError(res, 'invalid_request', 'missing redirect_uri');

  // Fetch the stored auth code
  const authCode = db.prepare('SELECT * FROM auth_codes WHERE code = ?').get(code);

  // Validate the code thoroughly — each check is a distinct security property
  if (!authCode) {
    return tokenError(res, 'invalid_grant', 'Authorization code not found');
  }
  if (authCode.used) {
    // Code replay: revoke all tokens issued for this client as a precaution
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE client_id = ?').run(client.client_id);
    return tokenError(res, 'invalid_grant', 'Authorization code has already been used');
  }
  if (authCode.expires_at < Math.floor(Date.now() / 1000)) {
    return tokenError(res, 'invalid_grant', 'Authorization code has expired');
  }
  if (authCode.client_id !== client.client_id) {
    return tokenError(res, 'invalid_grant', 'Code was not issued to this client');
  }
  if (authCode.redirect_uri !== redirect_uri) {
    // redirect_uri must match exactly what was used at /authorize
    return tokenError(res, 'invalid_grant', 'redirect_uri does not match');
  }

  // Mark the code as used (single-use enforcement)
  db.prepare('UPDATE auth_codes SET used = 1 WHERE code = ?').run(code);

  const tokenResponse = buildTokenResponse(authCode.user_id, client.client_id, authCode.scope);
  return res.json(tokenResponse);
}

// ---------------------------------------------------------------------------
// Grant: refresh_token
// ---------------------------------------------------------------------------
async function handleRefreshToken(req, res, client) {
  const { refresh_token } = req.body;

  if (!refresh_token) return tokenError(res, 'invalid_request', 'missing refresh_token');

  const stored = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(refresh_token);

  if (!stored) {
    return tokenError(res, 'invalid_grant', 'Refresh token not found');
  }
  if (stored.revoked) {
    return tokenError(res, 'invalid_grant', 'Refresh token has been revoked');
  }
  if (stored.expires_at < Math.floor(Date.now() / 1000)) {
    return tokenError(res, 'invalid_grant', 'Refresh token has expired');
  }
  if (stored.client_id !== client.client_id) {
    return tokenError(res, 'invalid_grant', 'Refresh token was not issued to this client');
  }

  // Rotate: revoke the old refresh token and issue a fresh one
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?').run(refresh_token);

  const tokenResponse = buildTokenResponse(stored.user_id, client.client_id, stored.scope);
  return res.json(tokenResponse);
}

module.exports = router;
