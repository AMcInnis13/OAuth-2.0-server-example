// src/routes/resources.js
//
// Example protected API endpoints.
// These live on your "Resource Server" — in a real app this would be a
// separate service, but for a prototype it's fine to co-locate them here.

const express = require('express');
const db = require('../db/database');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// GET /api/me — requires any valid token
router.get('/me', requireAuth(), (req, res) => {
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.auth.sub);
  if (!user) return res.status(404).json({ error: 'user_not_found' });

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    granted_scope: req.auth.scope,
  });
});

// GET /api/posts — requires read:profile scope
router.get('/posts', requireAuth('read:profile'), (req, res) => {
  // Stub data — replace with a real DB query
  res.json({
    user_id: req.auth.sub,
    posts: [
      { id: 1, title: 'Hello OAuth', body: 'It works!' },
    ],
  });
});

// POST /api/posts — requires write:posts scope
router.post('/posts', requireAuth('write:posts'), (req, res) => {
  const { title, body } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  // Stub — replace with an actual INSERT
  res.status(201).json({ id: 42, title, body, author_id: req.auth.sub });
});

module.exports = router;
