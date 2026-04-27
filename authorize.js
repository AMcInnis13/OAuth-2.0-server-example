// src/routes/authorize.js
//
// GET  /authorize  — show login/consent screen
// POST /authorize  — handle form submission, issue auth code

const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const { getClient, isRedirectUriAllowed, areScopesAllowed } = require('../utils/clients');
const { generateOpaqueToken, expiresAt, AUTH_CODE_TTL } = require('../utils/tokens');

const router = express.Router();

// ---------------------------------------------------------------------------
// Validate the incoming authorization request params.
// Returns an error string, or null if everything is valid.
// ---------------------------------------------------------------------------
function validateAuthRequest({ client_id, redirect_uri, response_type, scope }) {
  if (!client_id)     return 'missing client_id';
  if (!redirect_uri)  return 'missing redirect_uri';
  if (!scope)         return 'missing scope';

  if (response_type !== 'code') {
    return `unsupported response_type "${response_type}" — only "code" is supported`;
  }

  const client = getClient(client_id);
  if (!client) return `unknown client_id "${client_id}"`;

  if (!isRedirectUriAllowed(client, redirect_uri)) {
    return `redirect_uri "${redirect_uri}" is not registered for this client`;
  }

  if (!areScopesAllowed(client, scope)) {
    return `requested scope "${scope}" exceeds what this client is allowed to request`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// GET /authorize
// The client redirects the user here. We show a login + consent form.
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { client_id, redirect_uri, response_type, scope, state } = req.query;

  const validationError = validateAuthRequest({ client_id, redirect_uri, response_type, scope });
  if (validationError) {
    // Don't redirect back on client_id/redirect_uri errors — they can't be trusted
    return res.status(400).send(`<pre>Bad authorization request: ${validationError}</pre>`);
  }

  const client = getClient(client_id);

  // Inline HTML form — swap this out for a real template engine in production
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Authorize ${client.name}</title>
      <style>
        body { font-family: system-ui, sans-serif; max-width: 400px; margin: 80px auto; padding: 0 16px; }
        h2 { margin-bottom: 4px; }
        .scope { background: #f4f4f4; border-radius: 6px; padding: 10px 14px; margin: 16px 0; font-size: 14px; }
        label { display: block; margin-bottom: 6px; font-size: 14px; }
        input[type=email], input[type=password] {
          width: 100%; padding: 8px 10px; box-sizing: border-box;
          border: 1px solid #ccc; border-radius: 6px; margin-bottom: 12px; font-size: 14px;
        }
        button { width: 100%; padding: 10px; background: #2563eb; color: #fff;
          border: none; border-radius: 6px; font-size: 15px; cursor: pointer; }
        button:hover { background: #1d4ed8; }
        .deny { background: #fff; color: #555; border: 1px solid #ccc; margin-top: 8px; }
      </style>
    </head>
    <body>
      <h2>${client.name}</h2>
      <p>is requesting access to your account.</p>
      <div class="scope">
        <strong>Requested permissions:</strong><br>${scope.split(' ').join('<br>')}
      </div>

      <form method="POST" action="/authorize">
        <input type="hidden" name="client_id"     value="${client_id}">
        <input type="hidden" name="redirect_uri"  value="${redirect_uri}">
        <input type="hidden" name="scope"         value="${scope}">
        <input type="hidden" name="state"         value="${state || ''}">
        <input type="hidden" name="response_type" value="${response_type}">

        <label>Email</label>
        <input type="email" name="email" required autofocus>
        <label>Password</label>
        <input type="password" name="password" required>

        <button type="submit" name="action" value="approve">Allow access</button>
        <button type="submit" name="action" value="deny" class="deny">Deny</button>
      </form>
    </body>
    </html>
  `);
});

// ---------------------------------------------------------------------------
// POST /authorize
// User submitted the login form. Authenticate them, then either:
//   - Redirect with ?code=...&state=... (approved)
//   - Redirect with ?error=access_denied (denied)
// ---------------------------------------------------------------------------
router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const { client_id, redirect_uri, response_type, scope, state, email, password, action } = req.body;

  // Re-validate params in case someone crafted a POST directly
  const validationError = validateAuthRequest({ client_id, redirect_uri, response_type, scope });
  if (validationError) {
    return res.status(400).send(`<pre>Bad request: ${validationError}</pre>`);
  }

  // Build the base redirect URL
  const redirectBase = new URL(redirect_uri);

  // User clicked Deny
  if (action === 'deny') {
    redirectBase.searchParams.set('error', 'access_denied');
    if (state) redirectBase.searchParams.set('state', state);
    return res.redirect(redirectBase.toString());
  }

  // Authenticate the user
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    // Re-show the form with an error rather than leaking whether the email exists
    return res.status(401).send(`
      <p style="color:red;font-family:system-ui;max-width:400px;margin:80px auto">
        Invalid email or password. <a href="/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=${response_type}&scope=${encodeURIComponent(scope)}&state=${state}">Try again</a>
      </p>
    `);
  }

  // Generate and store the authorization code
  const code = generateOpaqueToken();
  db.prepare(`
    INSERT INTO auth_codes (code, client_id, user_id, redirect_uri, scope, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, client_id, user.id, redirect_uri, scope, expiresAt(AUTH_CODE_TTL));

  // Redirect back to the client with the code
  redirectBase.searchParams.set('code', code);
  if (state) redirectBase.searchParams.set('state', state);

  res.redirect(redirectBase.toString());
});

module.exports = router;
