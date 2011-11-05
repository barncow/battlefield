var conf = require('./testconfig.json')
  , bf = require('../index')
  , publicClient = bf.connect('BF3', conf.public.ip, conf.public.port)
  , privateClient = bf.connect('BF3', conf.private.ip, conf.private.port, conf.private.pass)
  , should = require('should');

publicClient.on('error', function(err) {console.error('PUBLICERROR', err);publicClient.quit();});
publicClient.on('close', function() {
  console.log('public client disconnected');
});
privateClient.on('error', function(err) {console.error('PRIVATEERROR', err);privateClient.quit();});
privateClient.on('close', function() {
  console.log('private client disconnected');
  console.log('completed tests:', numComplete, 'of', numTests);
});

//9 tests, with 36 vars command tests, 11 admin tests, 3 punkBuster
var numTests = 9+36+11+3, numComplete = 0;

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
                  } catch(e) {
                    console.error("Error doing command", 'vars.'+command);
                    throw e;
                  }
                  
                  ++commandItr;++numComplete;
                  if(commandItr >= totalCommands) {
                    doAdminTests(privateClient);
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

function doAdminTests(privateClient) {
  privateClient.admin.eventsEnabled(function(err, value) {
    try {
      should.not.exist(err);
      should.exist(value);
    } catch(e) {
      console.error("Error doing command", 'admin.eventsEnabled');
      throw e;
    }
    ++numComplete;

    privateClient.admin.password(conf.private.pass, function(err, value) {
      try {
        should.not.exist(err);
        should.exist(value);
      } catch(e) {
        console.error("Error doing command", 'admin.password');
        throw e;
      }
      ++numComplete;

      privateClient.admin.help(function(err, helpCommands) {
        try {
          should.not.exist(err);
          should.exist(helpCommands);
          helpCommands.length.should.be.above(0);
        } catch(e) {
          console.error("Error doing command", 'admin.help');
          throw e;
        }
        ++numComplete;

        //test that everything the server recognizes is implemented here
        var undefMethods = [];
        helpCommands.forEach(function(cmd) {
          if(cmd.indexOf(".") >= 0) {
            var parts = cmd.split(".")
              , ns = privateClient[parts[0]];

            if(typeof ns === 'undefined') undefMethods.push(cmd);
            else if(typeof ns[parts[1]] === 'undefined') undefMethods.push(cmd);
          }
        });
        //undefMethods.should.eql([]); //todo uncomment when we think we are done.
        ++numComplete;

        privateClient.admin.say.all('blah', function(err) {
          should.not.exist(err);
          ++numComplete;

          privateClient.admin.say.team(1, 'blah', function(err) {
            should.not.exist(err);
            ++numComplete;
            
            privateClient.admin.say.squad(1, 1, 'blah', function(err) {
              should.not.exist(err);
              ++numComplete;
              
              privateClient.admin.kickPlayer('barncow', 'blah', function(err) {
                err.should.not.eql("InvalidArguments"); //since we are testing, this player probably isn't in server, and would raise a PlayerNotFound.
                ++numComplete;
                
                privateClient.admin.listPlayers.all(function(err, info) {
                  should.not.exist(err);
                  should.exist(info); //would like to test that a player has a guid...
                  ++numComplete;

                  privateClient.admin.listPlayers.team(1, function(err, info) {
                    should.not.exist(err);
                    should.exist(info);
                    ++numComplete;
                    
                    privateClient.admin.listPlayers.squad(1, 1, function(err, info) {
                      should.not.exist(err);
                      should.exist(info);
                      ++numComplete;
                        
                      doPunkBusterTests(privateClient);
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

function doPunkBusterTests(privateClient) {
  privateClient.punkBuster.isActive(function(err, isActive) {
    should.not.exist(err);
    isActive.should.be.ok;
    ++numComplete;

    privateClient.punkBuster.activate(function(err) {
      should.not.exist(err);
      ++numComplete;

      //not sure if this does anything, but OK is returned...
      privateClient.punkBuster.pb_sv_command("PB_SV_Ver", function(err) {
        should.not.exist(err);
        ++numComplete;

        numComplete.should.equal(numTests);
        privateClient.quit();
      });
    });
  });
}