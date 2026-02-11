const path = require('path');
const express = require('express');
require('dotenv').config();

const app = express();

const apiConfig = require('./api/config');
const apiHealth = require('./api/health');
const apiGrantAdmin = require('./api/grant-admin');
const apiBootstrapAdmin = require('./api/bootstrap-admin');

app.all('/api/health', (req, res) => apiHealth(req, res));

app.all('/api/config', (req, res) => apiConfig(req, res));

app.all('/api/grant-admin', (req, res) => apiGrantAdmin(req, res));
app.all('/api/bootstrap-admin', (req, res) => apiBootstrapAdmin(req, res));

app.get('/vendor/supabase.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT ? Number(process.env.PORT) : 3004;
app.listen(port, () => {
  console.log(`OPEDRIN ADSS running on http://localhost:${port}`);
});
