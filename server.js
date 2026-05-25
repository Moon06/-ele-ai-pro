const express = require('express');
const { initDB } = require('./db');
const { registerRoutes } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

async function start() {
  await initDB();
  registerRoutes(app);

  app.get('*', (req, res) => {
    res.sendFile('index.html', { root: './public' });
  });

  app.listen(PORT, () => {
    console.log(`家庭积分乐园 http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
