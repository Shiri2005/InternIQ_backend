const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Cynaris Backend Running');
});

module.exports = app;
