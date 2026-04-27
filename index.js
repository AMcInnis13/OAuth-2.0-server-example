// src/index.js
// Entry point — wires together Express, routes, and middleware.

require('dotenv').config();

const express = require('express');
const app = express();

const authorizeRouter = require('./routes/authorize');
const tokenRouter     = require('./routes/token');
const resourceRouter  = require('./routes/resources');

// Parse JSON bodies for API routes
app.use('/api', express.json());

// ---------------------------------------------------------------------------
// OAuth endpoints
// ---------------------------------------------------------------------------
app.use('/authorize', authorizeRouter);  // Authorization Code flow
app.use('/token', tokenRouter);          // Token exchange + refresh

// ---------------------------------------------------------------------------
// Protected resource endpoints (your actual API)
// ---------------------------------------------------------------------------
app.use('/api', resourceRouter);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error', error_description: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OAuth server running on http://localhost:${PORT}`);
  console.log('');
  console.log('Demo credentials:');
  console.log('  client_id:     demo-client');
  console.log('  client_secret: demo-client-secret');
  console.log('  user email:    alice@example.com');
  console.log('  user password: password123');
  console.log('');
  console.log('Start the flow:');
  console.log(`  http://localhost:${PORT}/authorize?client_id=demo-client&redirect_uri=http://localhost:4000/callback&response_type=code&scope=read:profile&state=xyz123`);
});
