var conf = require('./testconfig.json')
  , bf = require('../index')
  , publicClient = bf.connect('BF3', conf.public.ip, conf.public.port)
  , privateClient = bf.connect('BF3', conf.private.ip, conf.private.port, conf.private.pass)
  , should = require('should');

publicClient.on('error', function(err) {console.error('PUBLICERROR', err);});
publicClient.on('close', function() {
  console.log('public client disconnected');
});
privateClient.on('error', function(err) {console.error('PRIVATEERROR', err);});
privateClient.on('close', function() {
  console.log('private client disconnected');
  console.log('completed tests:', numComplete);
});

//9 tests, with 27 vars command tests
var numTests = 9+27, numComplete = 0;

publicClient.version(function(err, v) {
  v.should.be.ok;
  v.game.should.eql('BF3');
  v.version.should.be.above(0);
  ++numComplete;

  publicClient.serverInfo(function(err2, info) {
    info.should.be.ok;
    info.serverName.should.be.ok;
    info.currentPlayerCount.should.be.above(-1);
    info.maxPlayerCount.should.be.above(0);
    info.currentGameMode.should.be.ok;
    info.currentMap.should.be.ok
    info.roundsPlayed.should.be.above(-1);
    info.roundsTotal.should.be.ok;
    info.scores.should.be.ok;
    info.scores.scores.should.be.ok;
    info.scores.scores.length.should.be.above(0);
    info.scores.targetScore.should.be.above(-1);
    info.onlineState.should.eql('');
    info.ranked.should.be.ok;
    info.punkBuster.should.be.ok;
    info.hasGamePassword.should.not.be.ok;
    info.serverUpTime.should.be.above(0);
    info.roundTime.should.be.above(0);

    ++numComplete;
  });
});

publicClient.listPlayers.all(function(err, data) {
  if(err) return console.error('Error in listPlayers.all', err);

  data.should.be.ok;
  data.length.should.be.above(0);

  var numAllPlayers = data.length;

  var first = data[0];
  first.name.should.be.ok;
  first.guid.should.eql(''); //public listPlayers does not have guids
  first.teamId.should.be.within(0, 16); //0 is neutral team
  first.squadId.should.be.within(0, 8); //0 is no squad
  first.kills.should.be.above(-1);
  first.deaths.should.be.above(-1);
  first.score.should.be.above(-1);
  ++numComplete;

  publicClient.listPlayers.team(1, function(err, data) {
    if(err) return console.error('Error in listPlayers.team', err);

    data.should.be.ok;
    data.length.should.be.within(0, numAllPlayers);
    var numTeamPlayers = data.length;
    ++numComplete;

    publicClient.listPlayers.squad(1, 1, function(err, data) {
      if(err) return console.error('Error in listPlayers.squad', err);

      data.should.be.ok;
      data.length.should.be.within(0, numTeamPlayers);
      ++numComplete;

      publicClient.quit();
    });
  });
});

privateClient.vars.serverName(function(err, name) {
  var SERVER_NAME = "Barncow's Fistorama";

  if(err) return console.error("serverName ERROR", err);
  name.should.be.ok;
  ++numComplete;

  privateClient.vars.serverName(SERVER_NAME, function(err, name) {
    if(err) return console.error("serverNameSet ERROR", err);
    
    should.not.exist(name); //doing a set name here, so no name is returned.
    ++numComplete;

    privateClient.vars.serverName(function(err, name) {
      if(err) return console.error("serverName2 ERROR", err);
      
      name.should.eql(SERVER_NAME);
      ++numComplete;

      privateClient.logout(function(err) {
        if(err) return console.error("logout ERROR", err);

        privateClient.vars.serverName(function(err, name) {
          err.should.eql("LogInRequired"); //since we tried to set the name while not logged in
          ++numComplete;

          //re-login for next tests
          privateClient.login.secure(conf.private.pass);

          //now we will test our other var methods. Just doing gets, to check that methods are OK and casting is correct.
          var varCommands = Object.keys(privateClient.vars)
            , commandItr = 0
            , totalCommands = varCommands.length-2;

          varCommands.forEach(function(command) {
            if(command !== 'serverName' && command !== "_commands") {
              //already thoroughly tested serverName, don't want _commands array
              (function(command) {
                privateClient.vars[command](function(err, value) {
                  try {
                    should.not.exist(err);
                    should.exist(value);
                    //console.log('vars.'+command, value);
                  } catch(e) {
                    console.error("Error doing command", 'vars.'+command);
                    throw e;
                  }
                  
                  ++commandItr;++numComplete;
                  if(commandItr >= totalCommands) {
                    numComplete.should.equal(numTests);
                    privateClient.quit();
                  }
                });
              })(command);
            }
          });
        });
      });
    });
  });
});
