var mvTypes = require('./multivaluetypes')
  , TeamScores = mvTypes.TeamScores
  , PlayerInfo = mvTypes.PlayerInfo
  , BanList = mvTypes.BanList
  , MapList = mvTypes.MapList
  , MapIndicies = mvTypes.MapIndicies
  , MapRounds = mvTypes.MapRounds
  , GameAdmins = mvTypes.GameAdmins
  , crypto = require('crypto');

  /*Native function does not properly cast "false" to false. Don't need native function anywhere else in here.*/
  var origBoolean = Boolean
    , Boolean = function(str) {
      return (str === 'true');
    };

module.exports = function(self) {
  /**
    Creates a function that can do a Get/Set operation (for instance, the vars commands)
    @param command String of the command to send (full, ie. "vars.serverName")
    @param casting Function to use to cast the response.
  */
  self._createGetSetFn = function(command, casting) {
    return function(arg, cb) {
      if(typeof arg === 'function') {
        cb = arg;
        arg = [];
      } else arg = [arg];

      self._doRequest(command, arg, self._getServerActionCallback(cb, casting));
    };
  };

  /**
    Effect: Reports game server type, and build ID 
    Comments: Some of the arguments will be empty or zero when the server isn’t fully up and running or between
    @param cb callback(err, data) -> where err can take a possible Error Value if something went wrong. Otherwise it is null, and data is specified, which is an object response.
    Possible Error Values: InvalidArguments
    Do not need to be logged in to perform this action. 
  */
  self.version = function(cb) {
    self._doRequest('version', [], self._getServerActionCallback(cb, ['game', {'version': Number}]));
  };

  /**
    Effect: Query for brief server info.
    Comments: Game server type and build ID uniquely identify the server, and the protocol it is running.
    @param cb callback(err, data) -> where err can take a possible Error Value if something went wrong. Otherwise it is null, and data is specified, which is an object response.
    Possible Error Values: InvalidArguments 
    Do not need to be logged in to perform this action. //todo fix
  */
  self.serverInfo = function(cb) {
    self._doRequest('serverInfo', [], self._getServerActionCallback(cb, [
        'serverName'
      , {'currentPlayerCount': Number}
      , {'maxPlayerCount': Number}
      , 'currentGameMode'
      , 'currentMap'
      , {'roundsPlayed': Number}
      , 'roundsTotal'
      , {'scores': TeamScores}
      , 'onlineState'
      , {'ranked': Boolean}
      , {'punkBuster': Boolean}
      , {'hasGamePassword': Boolean}
      , {'serverUpTime': Number}
      , {'roundTime': Number}
    ]));
  };

  /**
    Effect: Logout from game server, regardless of prior login status. This keeps the connection open.
    @param cb callback(err) -> where err can take a possible Error Value if something went wrong. Otherwise it is null, and it was successful.
    Possible Error Values: InvalidArguments
    Do not need to be logged in to perform this action. 
  */
  self.logout = function(cb) {
    self._doRequest('logout', [], function(err) {
      if(err) {
        if(typeof cb === 'undefined') {
          return cb(err);
        } else self.emit('error', err);
      }

      self._isAuthenticated = false;
      cb();
    });
  };

  /**
    Effect: Close connection to game server.
    Do not need to be logged in to perform this action. 
  */
  self.quit = function() {
    self._doRequest('quit');
    self._client.destroy();
    self._isConnected = false;
    self._isAuthenticating = false;
    self._isAuthenticated = false;
  };

  /**
    Effect: Return list of all players on the server, but with zeroed out GUIDs.
    @param cb callback(err, data) -> where err can take a possible Error Value if something went wrong. Otherwise it is null, and data is specified, which is an object response.
    Possible Error Values: InvalidArguments 
    Do not need to be logged in to perform this action. 

    client.listPlayers.all(cb) -> all players on server
    client.listPlayers.team(teamId, cb) -> team id of team to retrieve (must be 1..16, use zero for neutral team)
    client.listPlayers.squad(teamId, squadId, cb) -> all players in specified team+squad (teamId must be 1..16 [use 0 for neutral team], squadId must be 1..8 [use 0 for no squad])
  */
  self.listPlayers = {};

  /**
    Helper function to generate the response object.
  */
  self.listPlayers._callback = function(cb) {
    return self._getServerActionCallback(cb, PlayerInfo);
  };

  self.listPlayers.all = function(cb) {
    self._doRequest('listPlayers', ['all'], self.listPlayers._callback(cb));
  };

  self.listPlayers.team = function(teamId, cb) {
    console.log('lp team call')
    self._doRequest('listPlayers', ['team', teamId], self.listPlayers._callback(cb));
  };

  self.listPlayers.squad = function(teamId, squadId, cb) {
    self._doRequest('listPlayers', ['squad', teamId, squadId], self.listPlayers._callback(cb));
  };

  self.login = {}; //create login namespace

  /**
    Login to the server. Note - this is not recommended to use, since it sends your password in clear text. Use client.login.secure() instead.
    @param pass string of the password for the server.
    Possible Error Values: 
      InvalidPassword - Login unsuccessful, logged-in status unchanged 
      PasswordNotSet - No password set for server, login impossible
      InvalidArguments
    Do not need to be logged in to perform this action.
  */
  self.login.plainText = function(pass) {
    self._isAuthenticating = true;

    self._doRequest('login.plainText', [pass], function(err) {
      self._isAuthenticating = false;
      if(err) return self.emit('error', err);

      //still here, login was successful
      self._isAuthenticated = true;
      self._queue.drain(self._sendBuffer);
    });
  };

  /**
    If no arguments are entered,
    @param passHash Optional - hashed string of the password.
    @param cb(err, salt) - Optional callback. If "err" is truthy, an error ocurred. If not, the operation was a success. "salt" is the buffer retrieved from the server (as a byte representation of the hex number, not characters), if no parameters were given. Otherwise, nothing.
    Possible Error Values: 
      PasswordNotSet - No password set for server, login impossible
      InvalidPasswordHash - Login unsuccessful, logged-in status unchanged 
      InvalidArguments
    Do not need to be logged in to perform this action.
  */
  self.login.hashed = function(passHash, cb) {
    if(!passHash || typeof passHash === 'function') {
      cb = passHash;
      passHash = [];
    } else {
      self._isAuthenticating = true;
      passHash = [passHash];
    }

    self._doRequest('login.hashed', passHash, function(err, salt) {
      if(err) {
        self._isAuthenticating = false;
        if(!cb || typeof cb === 'undefined') return self.emit('error', err);
        else return cb(err);
      }

      if(salt && salt.length === 1) {
        //get operation

        salt = salt.shift(); //get first word, which is our salt

        //create a byte representation of our hex number (not characters)
        var buf = new Buffer(salt.length/2);
        buf.write(salt, 0, buf.length, 'hex');

        return cb(null, buf);
      }

      //still here, login was successful
      self._isAuthenticating = false;
      self._isAuthenticated = true;
      var callback = null;
      if(typeof cb !== 'undefined') callback = function() {cb(null);};
      self._queue.drain(self._sendBuffer, callback);
    });
  };

  /**
    Login to the server by hashing the password. It combines the uses of client.login.hashed into one method.
    This is not a standard BF server method.
    @param pass string of the password for the server.
    Possible Error Values: 
      PasswordNotSet - No password set for server, login impossible
      InvalidPasswordHash - Login unsuccessful, logged-in status unchanged 
      InvalidArguments
    Do not need to be logged in to perform this action.
  */
  self.login.secure = function(pass) {
    self._isAuthenticating = true;

    self.login.hashed(function(err, salt) {
      if(err) return self.emit('error', err);
      self.login.hashed(self.login.hashPassword(salt, pass));
    });
  };

  /**
    Function that will hash a password with the given salt, for use with client.login.hashed.
    This is not a standard BF server method.
    @param salt buffer from client.login.hashed when passed no arguments.
    @param pass string password for the server
    @return hex string of the hashed password.
  */
  self.login.hashPassword = function(salt, pass) {
    var md5 = crypto.createHash('md5');
    md5.update(salt);
    md5.update(pass);
    return md5.digest('hex').toUpperCase();
  };

  self.admin = {}; //create admin namespace

  self.admin.eventsEnabled = self._createGetSetFn('admin.eventsEnabled', Boolean);

  /**
    Docs suggest you can get the password with this method, but that just gets an "InvalidArguments error."
  */
  self.admin.password = function(password, cb) {
    self._doRequest('admin.password', [password], self._getServerActionCallback(cb));
  };

  self.admin.help = function(cb) {
    self._doRequest('admin.help', [], self._getServerActionCallback(cb));
  };

  self.admin.say = {}; //create admin.say namespace

  /**
    Helper function to generate the response object.
  */
  self.admin.say._callback = function(cb) {
    return self._getServerActionCallback(cb);
  };

  self.admin.say.all = function(txt, cb) {
    self._doRequest('admin.say', [txt, 'all'], self.admin.say._callback(cb));
  };

  self.admin.say.team = function(teamId, txt, cb) {
    self._doRequest('admin.say', [txt, 'team', teamId], self.admin.say._callback(cb));
  };

  self.admin.say.squad = function(teamId, squadId, txt, cb) {
    self._doRequest('admin.say', [txt, 'squad', teamId, squadId], self.admin.say._callback(cb));
  };

  self.admin.kickPlayer = function(soldierName, reason, cb) {
    var words = [soldierName];
    if(typeof reason === 'function') {
      cb = reason;
      reason = null;
    }
    if(reason !== null) words.push(reason);

    self._doRequest('admin.kickPlayer', words, self._getServerActionCallback(cb));
  };

  self.admin.listPlayers = {}; //creating admin.listPlayers namespace.
  //note, using the regular list players callback here.

  self.admin.listPlayers.all = function(cb) {
    self._doRequest('admin.listPlayers', ['all'], self.listPlayers._callback(cb));
  };

  self.admin.listPlayers.team = function(teamId, cb) {
    self._doRequest('admin.listPlayers', ['team', teamId], self.listPlayers._callback(cb));
  };

  self.admin.listPlayers.squad = function(teamId, squadId, cb) {
    self._doRequest('admin.listPlayers', ['squad', teamId, squadId], self.listPlayers._callback(cb));
  };

  self.admin.movePlayer = function(soldierName, teamId, squadId, forceKill, cb) {
    self._doRequest('admin.movePlayer', [soldierName, teamId, squadId, forceKill], self._getServerActionCallback(cb));
  };

  self.admin.killPlayer = function(soldierName, cb) {
    self._doRequest('admin.killPlayer', [soldierName], self._getServerActionCallback(cb));
  };

  self.admin.shutDown = function(cb) {
    self._doRequest('admin.shutDown', [], self._getServerActionCallback(cb));
  };

  self.punkBuster = {}; //create punkBuster namespace

  self.punkBuster.isActive = function(cb) {
    self._doRequest('punkBuster.isActive', [], self._getServerActionCallback(cb, Boolean));
  };

  self.punkBuster.activate = function(cb) {
    self._doRequest('punkBuster.activate', [], self._getServerActionCallback(cb));
  };

  self.punkBuster.pb_sv_command = function(cmd, cb) {
    self._doRequest('punkBuster.activate', [cmd], self._getServerActionCallback(cb));
  };

  self.banList = {}; //create banList namespace

  self.banList.load = function(cb) {
    self._doRequest('banList.load', [], self._getServerActionCallback(cb));
  };

  self.banList.save = function(cb) {
    self._doRequest('banList.save', [], self._getServerActionCallback(cb));
  };

  self.banList.add = {} //adding banlist.add namespace

  self.banList._genTimeoutFn = function(idType, id) {
    return {
      perm: function(reason, cb) {
        if(typeof reason === 'function') {
          cb = reason;
          reason = null;
        }

        var words = [idType, id, 'perm'];
        if(reason) words.push(reason);

        self._doRequest('banList.add', words, self._getServerActionCallback(cb));
      }
      /*, round: function(reason, cb) { //in docs, but server and procon don't seem to support
        if(typeof reason === 'function') {
          cb = reason;
          reason = null;
        }

        var words = [idType, id, 'round'];
        if(reason) words.push(reason);

        self._doRequest('banList.add', words, self._getServerActionCallback(cb));
      }*/
      , seconds: function(seconds, reason, cb) {
        if(typeof reason === 'function') {
          cb = reason;
          reason = null;
        }

        var words = [idType, id, 'seconds', seconds];
        if(reason) words.push(reason);

        self._doRequest('banList.add', words, self._getServerActionCallback(cb));
      }
    };
  };

  self.banList.add.name = function(soldierName) {
    return self.banList._genTimeoutFn('name', soldierName); //docs say name, server says persona.
  };

  self.banList.add.ip = function(ip) {
    return self.banList._genTimeoutFn('ip', ip);
  };

  self.banList.add.guid = function(guid) {
    return self.banList._genTimeoutFn('guid', guid);
  };

  self.banList.remove = {} //adding banlist.remove namespace

  self.banList.remove.name = function(soldierName, cb) {
    self._doRequest('banList.remove', ['name', soldierName], self._getServerActionCallback(cb)); //docs say name, server says persona.
  };

  self.banList.remove.ip = function(ip, cb) {
    self._doRequest('banList.remove', ['ip', ip], self._getServerActionCallback(cb));
  };

  self.banList.remove.guid = function(guid, cb) {
    self._doRequest('banList.remove', ['guid', guid], self._getServerActionCallback(cb));
  };

  self.banList.clear = function(cb) {
    self._doRequest('banList.clear', [], self._getServerActionCallback(cb));
  };

  self.banList.list = function(startOffset, cb) {
    if(typeof startOffset === 'function') {
      cb = startOffset;
      startOffset = null;
      var words = [];
    } else var words = [startOffset];

    self._doRequest('banList.list', words, self._getServerActionCallback(cb, BanList));
  };

  self.reservedSlotsList = {}; //create reservedSlotsList namespace

  self.reservedSlotsList.load = function(cb) {
    self._doRequest('reservedSlotsList.load', [], self._getServerActionCallback(cb));
  };

  self.reservedSlotsList.save = function(cb) {
    self._doRequest('reservedSlotsList.save', [], self._getServerActionCallback(cb));
  };

  self.reservedSlotsList.add = function(soldierName, cb) {
    self._doRequest('reservedSlotsList.add', [soldierName], self._getServerActionCallback(cb));
  };

  self.reservedSlotsList.remove = function(soldierName, cb) {
    self._doRequest('reservedSlotsList.remove', [soldierName], self._getServerActionCallback(cb));
  };

  self.reservedSlotsList.list = function(cb) {
    self._doRequest('reservedSlotsList.list', [], self._getServerActionCallback(cb));
  };

  self.reservedSlotsList.clear = function(cb) {
    self._doRequest('reservedSlotsList.clear', [], self._getServerActionCallback(cb));
  };

  self.unlockList = {}; //create unlockList namespace

  self.unlockList.save = function(cb) {
    self._doRequest('unlockList.save', [], self._getServerActionCallback(cb));
  };

  self.unlockList.add = function(unlockName, cb) {
    self._doRequest('unlockList.add', [unlockName], self._getServerActionCallback(cb));
  };

  self.unlockList.remove = function(unlockName, cb) {
    self._doRequest('unlockList.remove', [unlockName], self._getServerActionCallback(cb));
  };

  self.unlockList.list = function(cb) {
    self._doRequest('unlockList.list', [], self._getServerActionCallback(cb));
  };

  self.unlockList.clear = function(cb) {
    self._doRequest('unlockList.clear', [], self._getServerActionCallback(cb));
  };

  self.mapList = {}; //create mapList namespace

  self.mapList.load = function(cb) {
    self._doRequest('mapList.load', [], self._getServerActionCallback(cb));
  };

  self.mapList.save = function(cb) {
    self._doRequest('mapList.save', [], self._getServerActionCallback(cb));
  };

  self.mapList.add = function(map, gameMode, rounds, index, cb) {
    if(typeof index === 'function') {
      cb = index;
      index = null;
    }
    var words = [map, gameMode, rounds];
    if(index !== null) words.push(index);

    self._doRequest('mapList.add', words, self._getServerActionCallback(cb));
  };

  self.mapList.remove = function(index, cb) {
    self._doRequest('mapList.remove', [index], self._getServerActionCallback(cb));
  };

  self.mapList.clear = function(cb) {
    self._doRequest('mapList.clear', [], self._getServerActionCallback(cb));
  };

  self.mapList.list = function(cb) {
    self._doRequest('mapList.list', [], self._getServerActionCallback(cb, MapList));
  };

  self.mapList.setNextMapIndex = function(index, cb) {
    self._doRequest('mapList.setNextMapIndex', [index], self._getServerActionCallback(cb));
  };

  self.mapList.runNextRound = function(cb) {
    self._doRequest('mapList.runNextRound', [], self._getServerActionCallback(cb));
  };

  self.mapList.restartRound = function(cb) {
    self._doRequest('mapList.restartRound', [], self._getServerActionCallback(cb));
  };

  self.mapList.endRound = function(winnerTeamId, cb) {
    self._doRequest('mapList.endRound', [winnerTeamId], self._getServerActionCallback(cb));
  };

  self.mapList.getMapIndices = function(cb) {
    self._doRequest('mapList.getMapIndices', [], self._getServerActionCallback(cb, MapIndicies));
  };

  self.mapList.getRounds = function(cb) {
    self._doRequest('mapList.getRounds', [], self._getServerActionCallback(cb, MapRounds));
  };

  self.mapList.setNextMap = function(map, gameMode, cb) {
    self._doRequest('mapList.setNextMap', [map, gameMode], self._getServerActionCallback(cb));
  };

  self.gameAdmin = {}; //create gameAdmin namespace

  self.gameAdmin.load = function(cb) {
    self._doRequest('gameAdmin.load', [], self._getServerActionCallback(cb));
  };

  self.gameAdmin.save = function(cb) {
    self._doRequest('gameAdmin.save', [], self._getServerActionCallback(cb));
  };

  self.gameAdmin.add = function(soldierName, restrictionLevel, cb) {
    self._doRequest('gameAdmin.add', [soldierName, restrictionLevel], self._getServerActionCallback(cb));
  };

  self.gameAdmin.remove = function(soldierName, cb) {
    self._doRequest('gameAdmin.remove', [soldierName], self._getServerActionCallback(cb));
  };

  self.gameAdmin.list = function(cb) {
    self._doRequest('gameAdmin.list', [], self._getServerActionCallback(cb, GameAdmins));
  };

  self.gameAdmin.clear = function(cb) {
    self._doRequest('gameAdmin.clear', [], self._getServerActionCallback(cb));
  };

  /**
    Vars commands all follow a typical pattern, so we will just automatically create these functions.
  */

  self.vars = {}; //create vars namespace

  self.vars._commands = [
      {'serverName': String}
    , {'gamePassword': String}
    , {'autoBalance': Boolean}
    , {'friendlyFire': Boolean}
    , {'maxPlayers': Number}
    , {'killCam': Boolean}
    , {'miniMap': Boolean}
    , {'hud': Boolean}
    //, {'crossHair': Boolean} //in docs, but brings up 'UnknownCommand' error
    , {'3dSpotting': Boolean}
    , {'miniMapSpotting': Boolean}
    , {'nameTag': Boolean}
    , {'3pCam': Boolean}
    , {'regenerateHealth': Boolean}
    , {'teamKillCountForKick': Number}
    , {'teamKillValueForKick': Number}
    , {'teamKillValueIncrease': Number}
    , {'teamKillValueDecreasePerSecond': Number}
    , {'teamKillKickForBan': Number}
    , {'idleTimeout': Number}
    , {'idleBanRounds': Number}
    , {'roundStartPlayerCount': Number}
    , {'roundRestartPlayerCount': Number}
    , {'vehicleSpawnAllowed': Boolean}
    , {'roundRestartPlayerCount': Number}
    , {'soldierHealth': Number}
    , {'playerRespawnTime': Number}
    , {'playerManDownTime': Number}
    , {'bulletDamage': Number}
    , {'onlySquadLeaderSpawn': Boolean}
    , {'serverDescription': String}
    , {'vehicleSpawnDelay': Number}
    , {'bannerUrl': String}
    , {'minimap': Boolean}
    , {'serverMessage': String}
    , {'clientSideDamageArbitration': Boolean}
    , {'killRotation': Boolean}
    , {'gameModeCounter': Number}
    , {'roundsPerMap': Number}
  ];

  self.vars._commands.forEach(function(cmdObj) {
    var cmd = Object.keys(cmdObj).shift()
      , cast = cmdObj[cmd];

    self.vars[cmd] = self._createGetSetFn('vars.'+cmd, cast);
  });  
};
