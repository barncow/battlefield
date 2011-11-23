var conf = require('./testconfig.json')
  , bf = require('../index')
  , privateClient = bf.connect('BF3', conf.private.ip, conf.private.port, conf.private.pass)
  , should = require('should');

var numReqs = 1000, numCompleted = 0;

for(var i = 0; i < numReqs; ++i) {
  privateClient.vars.serverName(function(err, v) {
    ++numCompleted;
    should.not.exist(err);
    console.log('Completed', numCompleted, 'of', numReqs);
    if(numCompleted >= numReqs) privateClient.quit();
  });
}