"user strict";

const express = require('express');
const app = express();
const secrets = require('./config/secrets');

app.set('views', 'app/views');
app.set('view engine', 'ejs');
app.use(express.static('public'));

require('./config/routes')(app);

const server = app.listen(8080, function () {
  const host = server.address().address;
  const port = server.address().port;

  console.log(`running at port ${port}`)
});
