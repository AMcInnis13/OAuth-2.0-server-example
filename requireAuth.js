// src/middleware/requireAuth.js
// Express middleware that validates a Bearer JWT on incoming requests.
// Attach this to any route that requires an authenticated user.

const { verifyAccessToken } = require('../utils/tokens');

/**
 * requireAuth(scope?)
 * 
 * Usage:
 *   router.get('/me', requireAuth(), handler)
 *   router.post('/posts', requireAuth('write:posts'), handler)
 * 
 * On success, sets req.auth = { sub, client_id, scope, ... }
 * On failure, returns 401 or 403.
 */
function requireAuth(requiredScope) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing or malformed Authorization header',
      });
    }

    const token = authHeader.slice(7);

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      const expired = err.name === 'TokenExpiredError';
      return res.status(401).json({
        error: 'invalid_token',
        error_description: expired ? 'Access token has expired' : 'Invalid access token',
      });
    }

    // Check scope if a specific scope is required for this route
    if (requiredScope) {
      const tokenScopes = (payload.scope || '').split(' ');
      if (!tokenScopes.includes(requiredScope)) {
        return res.status(403).json({
          error: 'insufficient_scope',
          error_description: `Required scope: ${requiredScope}`,
        });
      }
    }

    req.auth = payload;
    next();
  };
}

module.exports = requireAuth;
