var mvTypes = require('./multivaluetypes')
  , TeamScores = mvTypes.TeamScores;

module.exports = function(Client) {
  /**
    Effect: Reports game server type, and build ID 
    Comments: Some of the arguments will be empty or zero when the server isn’t fully up and running or between
    @param cb callback(err, data) -> where err can take a possible Error Value if something went wrong. Otherwise it is null, and data is specified, which is an object response.
    Possible Error Values: InvalidArguments
    Do not need to be logged in to perform this action. 
  */
  Client.prototype.version = function(cb) {
    this._doRequest('version', [], this._getServerActionCallback(cb, ['game', {'version': Number}]));
  };

  /**
    Effect: Query for brief server info.
    Comments: Game server type and build ID uniquely identify the server, and the protocol it is running.
    @param cb callback(err, data) -> where err can take a possible Error Value if something went wrong. Otherwise it is null, and data is specified, which is an object response.
    Possible Error Values: InvalidArguments 
    Do not need to be logged in to perform this action. 
  */
  Client.prototype.serverInfo = function(cb) {
    this._doRequest('serverInfo', [], this._getServerActionCallback(cb, [
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

