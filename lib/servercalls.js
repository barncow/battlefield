var mvTypes = require('./multivaluetypes')
  , TeamScores = mvTypes.TeamScores
  , PlayerInfo = mvTypes.PlayerInfo
  , crypto = require('crypto');

module.exports = function(self) {
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
    Do not need to be logged in to perform this action. 
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
    self._doRequest('quit'); //immediately closes connection
  };

  /**
    Effect: Return list of all players on the server, but with zeroed out GUIDs.
    @param cb callback(err, data) -> where err can take a possible Error Value if something went wrong. Otherwise it is null, and data is specified, which is an object response.
    Possible Error Values: InvalidArguments 
    Do not need to be logged in to perform this action. 

    client.listPlayers.all(cb) -> all players on server
    client.listPlayers.team(teamId, cb) -> team id of team to retrieve (must be 1..16)
    client.listPlayers.squad(teamId, squadId, cb) -> all players in specified team+squad (teamId must be 1..16, squadId must be 1..8)
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
    @param cb(err, salt) - Optional callback. If "err" is truthy, an error ocurred. If not, the operation was a success. "salt" is the string retrieved from the server, if no parameters were given. Otherwise, nothing.
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
        salt = salt.shift().toUpperCase();

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
    @param salt string from client.login.hashed when passed no arguments.
    @param pass string password for the server
    @return hex string of the hashed password.
  */
  self.login.hashPassword = function(salt, pass) {
    var md5 = crypto.createHash('md5');
    md5.update(salt);
    md5.update(pass);
    return md5.digest('hex').toUpperCase();
  };

  self.vars = {}; //create vars namespace

  self.vars.serverName = function(name, cb) {
    if(typeof name === 'function') {
      cb = name;
      name = [];
    } else name = [name];

    self._doRequest('vars.serverName', name, self._getServerActionCallback(cb, String));
  };

/*
  Client.prototype.admin = {};
  Client.prototype.admin.kickPlayer = function(name, reason, cb) {
    if(typeof reason === 'function') {
      cb = reason;
      reason = null;
    }

    var args = [name];
    if(reason) args.push(reason);

    this._doRequest('admin.kickPlayer', args, this._getServerActionCallback(cb));
  };*/
};

