// src/utils/tokens.js

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = parseInt(process.env.ACCESS_TOKEN_EXPIRES_IN || '3600', 10);
const REFRESH_TOKEN_EXPIRES_IN = parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN || '2592000', 10);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in environment variables');
}

/**
 * Issue a signed JWT access token.
 * The payload is readable by anyone — never put sensitive data here.
 * Validity is verified by the signature (your JWT_SECRET).
 */
function signAccessToken({ userId, clientId, scope }) {
  return jwt.sign(
    {
      sub: String(userId),   // subject: the user
      client_id: clientId,
      scope,
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      issuer: 'oauth-server',
      audience: 'resource-server',
    }
  );
}

/**
 * Verify and decode a JWT access token.
 * Throws if the token is expired, tampered, or has wrong issuer/audience.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    issuer: 'oauth-server',
    audience: 'resource-server',
  });
}

/**
 * Generate a cryptographically random opaque string.
 * Used for authorization codes and refresh tokens.
 */
function generateOpaqueToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Unix timestamp N seconds from now.
 */
function expiresAt(seconds) {
  return Math.floor(Date.now() / 1000) + seconds;
}

/**
 * Auth codes live for 10 minutes.
 */
const AUTH_CODE_TTL = 10 * 60;

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateOpaqueToken,
  expiresAt,
  AUTH_CODE_TTL,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
};
