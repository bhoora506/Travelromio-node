'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health Route ────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Travelromio Node API is healthy',
    data: {
      service: 'travelromio-node',
      status: 'ok',
    },
  });
});

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

module.exports = app;
