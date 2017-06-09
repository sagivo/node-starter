"use strict";

module.exports = function(app){
  const home = require('../app/controllers/home_controller');
  app.get('/', home.index)
};