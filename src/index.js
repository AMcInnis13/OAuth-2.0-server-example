// src/index.js
require('dotenv').config();

const express = require('express');
const { initializeDb } = require('./db/database');

const app = express();
app.use('/api', express.json());

const authorizeRouter = require('./routes/authorize');
const tokenRouter     = require('./routes/token');
const resourceRouter  = require('./routes/resources');

app.use('/authorize', authorizeRouter);
app.use('/token',     tokenRouter);
app.use('/api',       resourceRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error', error_description: err.message });
});

const PORT = process.env.PORT || 3000;

// Initialize the database first, then start listening
initializeDb().then(() => {
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
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
