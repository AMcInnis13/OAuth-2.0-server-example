# OAuth 2.0 Authorization Server

Minimal OAuth 2.0 server — Node.js + Express + JWT. Implements the Authorization Code flow with refresh token rotation.

## Quick start

```powershell
npm install
Copy-Item .env.example .env
# Edit .env and set a strong JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
npm start
```

The server seeds a demo client and user on first run.

## Project structure

```
src/
  index.js                 # Entry point
  db/
    database.js            # SQLite schema + seed data
  utils/
    tokens.js              # JWT sign/verify, opaque token generation
    clients.js             # Client lookup and validation helpers
  middleware/
    requireAuth.js         # Bearer token middleware for protected routes
  routes/
    authorize.js           # GET/POST /authorize — login + consent screen
    token.js               # POST /token — code exchange + refresh
    resources.js           # Example protected API endpoints
```

## The flow, step by step

### 1. Start the authorization flow

Send the user to `/authorize` from your client app:

```
GET http://localhost:3000/authorize
  ?client_id=demo-client
  &redirect_uri=http://localhost:4000/callback
  &response_type=code
  &scope=read:profile
  &state=<random-csrf-nonce>
```

The user logs in with `alice@example.com` / `password123` and clicks **Allow**.

### 2. Receive the authorization code

Your client's `redirect_uri` receives:

```
http://localhost:4000/callback?code=<auth-code>&state=<your-nonce>
```

Verify that `state` matches what you sent. Then exchange the code server-side.

### 3. Exchange code for tokens

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/token -Body @{
    grant_type   = "authorization_code"
    code         = "<auth-code>"
    client_id    = "demo-client"
    client_secret = "demo-client-secret"
    redirect_uri = "http://localhost:4000/callback"
}
```

Response:
```json
{
  "access_token": "<jwt>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "<opaque-token>",
  "scope": "read:profile"
}
```

### 4. Call a protected endpoint

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/me `
    -Headers @{ Authorization = "Bearer <access_token>" }
```

### 5. Refresh the access token

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/token -Body @{
    grant_type     = "refresh_token"
    refresh_token  = "<refresh_token>"
    client_id      = "demo-client"
    client_secret  = "demo-client-secret"
}
```

Each refresh rotates the refresh token — the old one is immediately revoked.

## Registering new clients

Insert directly into SQLite for prototyping. In production, build a `/register` endpoint.

```js
const bcrypt = require('bcrypt');
const db = require('./src/db/database');

db.prepare(`
  INSERT INTO clients (client_id, client_secret, name, redirect_uris, allowed_scopes)
  VALUES (?, ?, ?, ?, ?)
`).run(
  'my-app',
  bcrypt.hashSync('my-secret', 10),
  'My Application',
  JSON.stringify(['https://myapp.com/callback']),
  'read:profile write:posts'
);
```

## Security notes for production

- **HTTPS only.** Never run OAuth over plain HTTP outside localhost.
- **Rotate JWT_SECRET** with a key management service; support key versioning so you can rotate without invalidating all existing tokens.
- **Use a real database** (Postgres/MySQL) with row-level locking to prevent race conditions on auth code redemption.
- **Rate-limit `/token`** to slow credential stuffing attacks.
- **PKCE** (`code_challenge` / `code_verifier`) should be added for public clients (SPAs, mobile apps) that can't safely store a `client_secret`.
- **Token introspection** (`POST /introspect`) lets resource servers validate opaque tokens without sharing the JWT secret.
- **Audit log** every token issuance and revocation event.
