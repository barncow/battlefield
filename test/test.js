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

//9 tests, with 36 vars command tests, 13 admin tests, 3 punkBuster, 10 banlist, 6 reservedslots
var numTests = 9+36+13+3+10+6, numComplete = 0;

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
    info.scores.scores.length.should.be.above(0, 'serverInfo.scores.scores.length');
    info.scores.targetScore.should.be.above(-1);
    info.onlineState.should.eql(''); //todo when the scores was empty, this was 'true'
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
                        
                      privateClient.admin.movePlayer('barncow', 1, 1, true, function(err) {
                        err.should.not.eql("InvalidArguments"); //since we are testing, this player probably isn't in server, and would raise errors.
                        ++numComplete;
                          
                        privateClient.admin.killPlayer('barncow', function(err) {
                          err.should.not.eql("InvalidArguments"); //since we are testing, this player probably isn't in server, and would raise errors.
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
      privateClient.punkBuster.pb_sv_command("pb_sv_plist", function(err, words) { //this gives data in procon
        should.not.exist(err);
        ++numComplete;

        doBanListTests(privateClient);
      });
    });
  });
}

function doBanListTests(privateClient) {
  var BAN_IP = '127.0.0.1', BAN_NAME = 'asdf', BAN_GUID = '1234', NUM_PERMA_BANS = 3;
  privateClient.banList.save(function(err) { //have to do save first so we have somthing to load
    should.not.exist(err, 'banList save '+err);
    ++numComplete;

    privateClient.banList.load(function(err) {
      should.not.exist(err, 'banlist load '+err);
      ++numComplete;

      privateClient.banList.add.ip(BAN_IP).perm('no reason at all', function(err) {
        should.not.exist(err, 'banlist add ip perm '+err);
        ++numComplete;

        privateClient.banList.add.name(BAN_NAME).seconds(10, function(err) {
          should.not.exist(err, 'banlist add name seconds null reason '+err);
          ++numComplete;

          privateClient.banList.add.guid(BAN_GUID).seconds(10, function(err) {
            should.not.exist(err, 'banlist add guid seconds null reason '+err);
            ++numComplete;

            privateClient.banList.remove.ip(BAN_IP, function(err) {
              should.not.exist(err, 'banlist remove ip '+err);
              ++numComplete;

              privateClient.banList.remove.name(BAN_NAME, function(err) {
                should.not.exist(err, 'banlist remove name '+err);
                ++numComplete;

                privateClient.banList.remove.guid(BAN_GUID, function(err) {
                  should.not.exist(err, 'banlist remove guid '+err);
                  ++numComplete;

                  var numReturnedAdds = 0;
                  for(var i = 0; i < NUM_PERMA_BANS; ++i) {
                    privateClient.banList.add.name('fake'+i).perm('testing mass add', function(err) {
                      if(err) throw err;

                      ++numReturnedAdds;

                      if(numReturnedAdds === NUM_PERMA_BANS) {
                        privateClient.banList.list(function(err, list) {
                          should.not.exist(err, 'banlist list '+err);
                          list.should.be.ok;
                          var ban = list[0];
                          ban.idType.should.eql('persona');
                          ban.id.should.eql('fake0');
                          ban.banType.should.eql('perm');
                          ban.time.should.eql('0');
                          ban.time.should.eql('0');
                          ++numComplete;

                          privateClient.banList.clear(function(err) {
                            should.not.exist(err, 'banlist clear '+err);
                            ++numComplete;

                            reservedSlotLists(privateClient);
                          });
                        });
                      }
                    });
                  }
                });
              });
            });
          });
        });
      });
    });
  });

  function reservedSlotLists(privateClient) {
    var RESERVED_SLOT_NAME = 'barncow', NUM_RESERVED_SLOTS = 3;
    privateClient.reservedSlotsList.save(function(err) { //have to do save first so we have somthing to load
      should.not.exist(err, 'reservedSlotsList save '+err);
      ++numComplete;

      privateClient.reservedSlotsList.load(function(err) {
        should.not.exist(err, 'reservedSlotsList load '+err);
        ++numComplete;

        privateClient.reservedSlotsList.add(RESERVED_SLOT_NAME, function(err) {
          should.not.exist(err, 'reservedSlotsList add  '+err);
          ++numComplete;

          privateClient.reservedSlotsList.remove(RESERVED_SLOT_NAME, function(err) {
            should.not.exist(err, 'reservedSlotsList remove '+err);
            ++numComplete;

            var numReturnedAdds = 0;
            for(var i = 0; i < NUM_RESERVED_SLOTS; ++i) {
              privateClient.reservedSlotsList.add('fake'+i, function(err) {
                if(err) throw err;

                ++numReturnedAdds;

                if(numReturnedAdds === NUM_RESERVED_SLOTS) {
                  privateClient.reservedSlotsList.list(function(err, list) {
                    should.not.exist(err, 'reservedSlotsList list '+err);
                    list.should.have.lengthOf(NUM_RESERVED_SLOTS);
                    ++numComplete;

                    privateClient.reservedSlotsList.clear(function(err) {
                      should.not.exist(err, 'reservedSlotsList clear '+err);
                      ++numComplete;

                      numComplete.should.equal(numTests); //todo uncomment
                      privateClient.quit();
                    });
                  });
                }
              });
            }
          });
        });
      });
    });
  }
}