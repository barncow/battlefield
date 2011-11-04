var mvTypes = require('./multivaluetypes')
  , TeamScores = mvTypes.TeamScores;

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

  self.login = {}; //create login namespace
  self.login.plainText = function(pass) {
    self._isAuthenticating = true;

    self._doRequest('login.plainText', [pass], function(err) {
      self._isAuthenticating = false;
      if(err) return self.emit('error', err);

      //still here, login was successful
      self._isAuthenticating = false;
      self._isAuthenticated = true;
      self._queue.drain(function(buf) {
        self._client.write(buf);
      });
    });
  };

  /*Client.prototype.vars = {};
  Client.prototype.vars.serverName = function(name, cb) {
    if(typeof name === 'function') {
      cb = name;
      name = null;
    }

    this._doRequest('vars.serverName', [name], this._getServerActionCallback(cb, [{property: 'name'}]));
  };

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

