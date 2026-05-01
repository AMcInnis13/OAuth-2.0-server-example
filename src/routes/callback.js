// src/routes/callback.js
//
// A fake "client app" callback page that lives on the same server for demo purposes.
// In a real setup this would be a separate application entirely.
//
// Flow:
//   1. Receives ?code=...&state=... from the /authorize redirect
//   2. Exchanges the code for tokens by calling POST /token internally
//   3. Calls GET /api/me with the access token to fetch the user's profile
//   4. Renders a success page showing everything worked

const express = require('express');
const router  = express.Router();

router.get('/', async (req, res) => {
  const { code, state, error } = req.query;

  // Handle user-denied case
  if (error === 'access_denied') {
    return res.send(buildPage({
      success: false,
      title: 'Access Denied',
      message: 'You chose not to grant access.',
    }));
  }

  if (!code) {
    return res.status(400).send(buildPage({
      success: false,
      title: 'Missing Code',
      message: 'No authorization code was received.',
    }));
  }

  try {
    // Step 1 — Exchange the auth code for tokens
    // We call our own /token endpoint using fetch (built into Node 18+)
    const baseUrl = `${req.protocol}://${req.hostname}:${process.env.PORT || 3000}`;

    const tokenRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        client_id:     'demo-client',
        client_secret: 'demo-client-secret',
        redirect_uri:  `${baseUrl}/callback`,
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokenRes.ok) {
      return res.send(buildPage({
        success: false,
        title: 'Token Exchange Failed',
        message: `${tokens.error}: ${tokens.error_description}`,
      }));
    }

    // Step 2 — Use the access token to fetch the user's profile
    const profileRes = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    // Step 3 — Render the success page
    return res.send(buildPage({
      success: true,
      title: 'OAuth Works! 🎉',
      state,
      profile,
      tokens,
    }));

  } catch (err) {
    return res.send(buildPage({
      success: false,
      title: 'Server Error',
      message: err.message,
    }));
  }
});

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------
function buildPage({ success, title, message, profile, tokens, state }) {
  const green  = '#16a34a';
  const red    = '#dc2626';
  const accent = success ? green : red;
  const icon   = success ? '✅' : '❌';

  // Decode JWT payload for display (just base64 — no verification needed here)
  let jwtPayload = null;
  if (tokens?.access_token) {
    try {
      const parts = tokens.access_token.split('.');
      jwtPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch {}
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 48px 16px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      width: 100%;
      max-width: 680px;
      overflow: hidden;
    }
    .header {
      background: ${accent};
      color: #fff;
      padding: 28px 32px;
    }
    .header h1 { font-size: 1.6rem; font-weight: 700; }
    .header p  { margin-top: 6px; opacity: 0.85; font-size: 0.95rem; }
    .body { padding: 28px 32px; }
    .section { margin-bottom: 28px; }
    .section:last-child { margin-bottom: 0; }
    h2 {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 10px;
    }
    .kv {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 6px 12px;
      font-size: 0.9rem;
    }
    .kv .key   { color: #64748b; font-weight: 500; }
    .kv .value { color: #1e293b; word-break: break-all; }
    .token-box {
      background: #f1f5f9;
      border-radius: 8px;
      padding: 14px;
      font-family: monospace;
      font-size: 0.78rem;
      word-break: break-all;
      color: #334155;
      line-height: 1.6;
    }
    .badge {
      display: inline-block;
      background: #eff6ff;
      color: #2563eb;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .error-msg {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 16px;
      color: #991b1b;
      font-size: 0.9rem;
    }
    .try-again {
      display: inline-block;
      margin-top: 20px;
      padding: 10px 20px;
      background: ${accent};
      color: #fff;
      border-radius: 6px;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 500;
    }
    .divider {
      border: none;
      border-top: 1px solid #e2e8f0;
      margin: 24px 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${icon} ${title}</h1>
      ${success
        ? `<p>The full OAuth 2.0 Authorization Code flow completed successfully.</p>`
        : `<p>Something went wrong during the OAuth flow.</p>`
      }
    </div>
    <div class="body">

      ${!success ? `
        <div class="error-msg">${message}</div>
        <a class="try-again" href="/authorize?client_id=demo-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=read:profile&state=xyz123">
          Try again
        </a>
      ` : `

        <div class="section">
          <h2>👤 User Profile (from /api/me)</h2>
          <div class="kv">
            <span class="key">Name</span>    <span class="value">${profile?.name ?? '—'}</span>
            <span class="key">Email</span>   <span class="value">${profile?.email ?? '—'}</span>
            <span class="key">User ID</span> <span class="value">${profile?.id ?? '—'}</span>
            <span class="key">Scope</span>   <span class="value"><span class="badge">${profile?.granted_scope ?? '—'}</span></span>
          </div>
        </div>

        <hr class="divider">

        <div class="section">
          <h2>🔑 Access Token (JWT)</h2>
          <div class="token-box">${tokens?.access_token}</div>
        </div>

        ${jwtPayload ? `
        <div class="section">
          <h2>📦 JWT Payload (decoded)</h2>
          <div class="kv">
            <span class="key">Subject (user)</span> <span class="value">${jwtPayload.sub}</span>
            <span class="key">Client ID</span>       <span class="value">${jwtPayload.client_id}</span>
            <span class="key">Scope</span>            <span class="value"><span class="badge">${jwtPayload.scope}</span></span>
            <span class="key">Issued at</span>        <span class="value">${new Date(jwtPayload.iat * 1000).toLocaleString()}</span>
            <span class="key">Expires at</span>       <span class="value">${new Date(jwtPayload.exp * 1000).toLocaleString()}</span>
            <span class="key">Issuer</span>           <span class="value">${jwtPayload.iss}</span>
          </div>
        </div>
        ` : ''}

        <hr class="divider">

        <div class="section">
          <h2>🔄 Refresh Token</h2>
          <div class="token-box">${tokens?.refresh_token}</div>
          <p style="margin-top:8px;font-size:0.8rem;color:#64748b">
            Valid for 30 days. Rotated on every use.
          </p>
        </div>

        <hr class="divider">

        <div class="section">
          <h2>🔗 Flow Summary</h2>
          <div class="kv">
            <span class="key">State param</span>    <span class="value">${state ?? '—'}</span>
            <span class="key">Token type</span>     <span class="value">${tokens?.token_type}</span>
            <span class="key">Expires in</span>     <span class="value">${tokens?.expires_in}s (${tokens?.expires_in / 60} minutes)</span>
          </div>
        </div>

        <a class="try-again" href="/authorize?client_id=demo-client&redirect_uri=http://localhost:3000/callback&response_type=code&scope=read:profile&state=xyz123"
           style="background:#475569">
          Run the flow again
        </a>

      `}
    </div>
  </div>
</body>
</html>`;
}

module.exports = router;
