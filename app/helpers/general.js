"use strict";

exports.parseCookies = function (request) {
  var list = {}, rc = request.headers.cookie;
  rc && rc.split(';').forEach(function( cookie ) {
      var parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
  });
  return list;
}

