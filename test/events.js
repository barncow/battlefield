var conf = require('./testconfig.json')
  , bf = require('../index')
  , privateClient = bf.connect('BF3', conf.private.ip, conf.private.port, conf.private.pass)
  , should = require('should')
  , util = require('util');

privateClient.onAny(function(value) {
  util.log('onany args ' + util.inspect(value));
});

privateClient.admin.eventsEnabled(true, function(err) {
  if(err) throw err;
  console.log('set events enabled to true. Press Ctrl-C to exit');
});