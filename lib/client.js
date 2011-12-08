var net = require('net')
	, util = require('util')
  , EventEmitter2 = require('eventemitter2').EventEmitter2
  , Queue = require('./queue')
  , MultiValueType = require('./multivaluetypes.js').MultiValueType
  , serverCalls = require('./servercalls');

var Client = module.exports = function(ip, port, password) {
  var self = this;

	EventEmitter2.call(self, {wildcard: true});

	self.ip = ip;
	self.port = port;
	self._queue = new Queue();
  self._requests = {};
	self._isConnected = false;
  self._isAuthenticating = false;
  self._isAuthenticated = false;
  self._sequence = 1;
  self._hasDied = false;

  //this should be the first listener, so we can clean up some state before the user can use this error.
  self.on('error', function() {
    self._hasDied = true;
    if(self._client) self._client.end();
    self._requests = []; //clear callbacks
  });

  //server calls have to be instance methods instead of prototypes
  //because they have namespaces (ie. client.login.plainText)
  //hopefully this doesn't shred memory to pieces
  serverCalls(self);

  //instance function since this will be detached, need the "self" variable.
  self._sendBuffer = function(buf) {
    if(!self._hasDied) self._client.write(buf);
  };

  self._partialBuffer = null;
  self._partialBufferOffset = null;

  self._eventToJSON = function(event, words) {
    var json = {event: event};

      switch(event) {
        //case "player.onLeave", "server.onRoundOverPlayers": todo finish - has "player info block"
        //case "server.onRoundOverTeamScores" "end-of-round scores"
        case "player.onJoin":
          json.name = words[0];
          json.guid = words[1];
        break;
        case "player.onAuthenticated":
          json.name = words[0];
        break;
        case "player.onSpawn":
          json.name = words[0];
          json.team = Number(words[1]); //todo test that this is still there, docs say it may be removed
        break;
        case "player.onKill":
          json.killerName = words[0];
          json.victimName = words[1];
          json.weapon = words[2];
          json.headshot = Boolean(words[3]);
        break
        case "player.onChat":
          json.name = words[0];
          json.text = words[1];
        break;
        case "player.onSquadChange":
          json.name = words[0];
          json.team = Number(words[1]);
          json.squad = Number(words[2]);
        break;
        case "player.onTeamChange":
          json.name = words[1];
          json.team = Number(words[2]);
          json.squad = Number(words[3]);
        break;
        case "punkBuster.onMessage":
          json.response = words[0];
        break;
        case "server.onLevelLoaded":
          json.levelName = words[0];
          json.gameMode = words[1];
          json.roundsPlayed = Number(words[2]);
          json.roundsTotal = Number(words[3]);
        break;
        case "server.onRoundOver":
          json.winningTeam = Number(words[0]);
        break;
        //note - commands sent to server also trigger events, with no data.

        default: json.words = words;
      }

    return json;
  };

  //handles complete buffers
  self._handleData = function(data) {
    var result = self._bufferToWords(data)
      , words = result.words;

    if(result.isResponse) {
      //we have a response to a request we made, call its callback.
      var status = words.shift()
        , cmdObj = self._requests[result.sequence];
      if(typeof cmdObj === 'undefined') return;
      delete self._requests[result.sequence];

      if(typeof cmdObj.callback !== 'function') return; //no callback
      
      if(status === 'OK') cmdObj.callback(null, words);
      else cmdObj.callback(status);
    } else {
      //we have received an event

      //docs say to return 'OK' to server, however there was an error when I tried from Node.
      //Server does not seem to mind, so I'm going to ignore for now.

      var e = words.shift()
        , json = self._eventToJSON(e, words);
      self.emit(e, json);
    }
  };

  self.connect = function() {
    if(self._isConnected) self.quit();

  	self._client = net.connect(port, ip, function() {
      //connected
      self._isConnected = true;
      if(!self._queueRequests()) self._queue.drain(self._sendBuffer);
    });

    self._client.on('data', function(data) {
      if(self._partialBuffer === null) {
        var packetSize = data.readUInt32LE(4);

        if(data.length < packetSize) {
          self._partialBuffer = new Buffer(packetSize);
          data.copy(self._partialBuffer, 0, 0);
          self._partialBufferOffset = data.length;
          return;
        }

        //we have full buffer, let's process it.
        self._handleData(data);
      } else {
        //we have data from before, copy bytes into it, see if we can proceed
        data.copy(self._partialBuffer, self._partialBufferOffset, 0);
        self._partialBufferOffset += data.length;

        if(self._partialBufferOffset === self._partialBuffer.length) {
          self._handleData(self._partialBuffer);
          self._partialBuffer = null;
          self._partialBufferOffset = null;
        }
      }
    });

    self._client.on('error', function(err) {
      self.emit('error', err);
    });

    self._client.on('close', function() {
      self._isConnected = false;
      self._isAuthenticated = false;
      self._isAuthenticating = false;
      self.emit('close');
    });

    self._client.on('timeout', function() {
      self._isConnected = false;
      self._isAuthenticated = false;
      self._isAuthenticating = false;
      self.emit('timeout');
    });

    self._client.on('end', function() {
      self._isConnected = false;
      self._isAuthenticated = false;
      self._isAuthenticating = false;
      self.emit('end');
    });

  	if(typeof password !== 'undefined') {
     self.login.secure(password);
    }
  };
  self.connect();
}
util.inherits(Client, EventEmitter2);

Client.prototype._wordsToBuffer = function(isFromServer, isResponse, words, sequence) {
  if(typeof sequence === 'undefined') sequence = this._sequence;

  var i = 0
    , packetSize = 12 //packet has 3 32-bit (4 byte) ints for 12 bytes
    , buf = null
    , offset = 0
    , numWords = words.length
    , word = null
    , header = sequence & 0x3fffffff
    , ret = {sequence: sequence};

  //console.log('creating req:', words, 'seq:', ret.sequence);

  if(!isFromServer) header += 0x80000000;
  if(isResponse) header += 0x40000000;

  //iterate through words append word length onto packetSize
  for(; i < numWords; ++i) {
    if(typeof words[i] !== 'string') words[i] = words[i].toString();
    packetSize += words[i].length +5; //4 bytes for int32 size, + 1 byte null terminator per word
  }

  buf = new Buffer(packetSize);

  //send header
  buf.writeUInt32LE(header, offset);
  ++this._sequence;
  offset += 4;

  //send packetsize
  buf.writeUInt32LE(packetSize, offset);
  offset += 4;

  //send numwords
  buf.writeUInt32LE(numWords, offset);
  offset += 4;

  //send words
  for(i=0; i < numWords; ++i) {
    word = words[i];

    //output word length
    buf.writeUInt32LE(word.length, offset);
    offset += 4;

    //output word
    buf.write(word, offset);
    offset += word.length;

    //output null terminator
    buf.writeUInt8(0x00, offset);
    ++offset;
  }

  ret.buffer = buf;

  return ret;
};

Client.prototype._bufferToWords = function(buf) {
  var i = 0
    , offset = 0
    , word = null
    , numWords = 0
    , wordLength = null
    , ret = null;

  //read header
  ret = this._parseHeader(buf.readUInt32LE(offset));
  offset += 4;

  //read packetsize
  ret.packetSize = buf.readUInt32LE(offset);
  offset += 4;

  //read numwords
  ret.numWords = numWords = buf.readUInt32LE(offset);
  offset += 4;

  //read words
  ret.words = [];
  for(; i < numWords; ++i) {
    //read word length
    wordLength = buf.readUInt32LE(offset); //todo this seems to fail sometimes
    offset += 4;

    //read word
    word = buf.toString('utf8', offset, offset+wordLength);
    ret.words.push(word);
    offset += word.length;

    //skip null terminator
    ++offset;
  }

  //console.log('received res:', ret.words, 'seq:', ret.sequence);

  return ret;
};

Client.prototype._parseHeader = function(header) {
  return {
      sequence: header & 0x3fffffff
    , isFromServer: ((header & 0x80000000) === 0)
    , isResponse: ((header & 0x40000000) !== 0)
  };
};

Client.prototype._queueRequests = function() {
  return (!this._isConnected || this._isAuthenticating);
};

Client.prototype._doRequest = function(command, words, cb) {
  var self = this;

  if(!words) words = [];

  words.unshift(command);

  self._sendCommand(words, cb);
};

Client.prototype.command = function(words, cb) {
  var self = this;

  if(typeof words === 'string') words = words.split(" ");

  if(!words || !Array.isArray(words)) cb('NoCommandSpecified');

  self._sendCommand(words, cb);
};

Client.prototype._sendCommand = function(words, cb) {
  var self = this;


  var bufObj = self._wordsToBuffer(false, false, words);
  var cmdObj = {words: words, sequence: bufObj.sequence}
  if(typeof cb === 'function') {
    cmdObj.callback = cb;
  }

  //if we are quitting, no need to keep the object around.
  if(words[0] !== 'quit') self._requests[bufObj.sequence] = cmdObj;

  if(words[0].indexOf('login.') !== 0 && self._queueRequests()) {
    self._queue.add(bufObj.buffer, self._sendBuffer);
  } else {
    self._sendBuffer(bufObj.buffer);
  }
};

/**
  Provides an error handler callback if no callback is defined. Will also provide a callback that will cast the values before calling the user's callback.
  Should be used when able to cast values word-by-word.
  @param cb User's callback
  @param casting array of objects with a single property: ie. {"myPropName": Number}. Order of array corresponds to order of words returned by server. 
    "myPropName" is the name of the property in the object given to the user's callback, and it is passed through to the given Function.
    Alternatively, you can just specify a string "myPropName" which will add that property to the resulting object with its data as a String.
    If a value in the array is null, the word is ignored.
*/

/*
casting can be a casting function, multivaluetype, array(of strings, and/or {myProp: Number})
*/

Client.prototype._getServerActionCallback = function(cb, casting, preCb) {
  var self = this;

  if(typeof cb !== 'function') {
    return function(err) {
      if(err) self.emit(err);
    };
  }

  return function(err, words) {
    var info = null;

    if(err) return cb(err);
    if(typeof casting === 'undefined') return cb(null, words);
    
    if(Array.isArray(casting)) {
      //we have an array of values to make an object with
      info = {};
      var singleVal = false;
    } else {
      //we have one cast to make, and set info to.
      var singleVal = true;
      casting = [casting];
    }

    var procMvType = null;
    for(var wordItr = 0, castItr = 0; wordItr < words.length && castItr < casting.length; ++wordItr) {
      var word = words[wordItr], cast = casting[castItr];

      if(procMvType !== null) {
        procMvType.give(word);
        if(procMvType.isFinished()) {
          if(singleVal) info = procMvType.valueOf();
          else info[property] = procMvType.valueOf();
          ++castItr;
          procMvType = null;
        }
        continue;
      }

      if(typeof cast === 'string') {
        if(singleVal) info = word;
        else info[cast] = word;
        ++castItr;
      } else if(cast !== null) {
        if(singleVal) {
          castingFn = cast;
        } else {
          //we should have key/value pair
          var property = Object.keys(cast).shift()
            , castingFn = cast[property];
        }

        var castedWord = castingFn(word);

        if(castedWord instanceof MultiValueType) {
          //we are starting a multivaluetype
          procMvType = castedWord;
          if(procMvType.isFinished()) {
            if(singleVal) info = procMvType.valueOf();
            else info[property] = procMvType.valueOf();
            ++castItr;
            procMvType = null;
          }
        } else {
          if(singleVal) info = castedWord;
          else info[property] = castedWord;
          ++castItr;
        }
      }
    }

    //some responses like banList.list don't properly provide a way for the MVType to close itself. If it's still open, set info to valueOf.
    if(procMvType !== null) {
      if(singleVal) info = procMvType.valueOf();
      else info[property] = procMvType.valueOf();
    }

    if(singleVal && words.length === 0) {
      var castingFn = casting[0]
        , castedWord = castingFn(null);
      if(castedWord instanceof MultiValueType) {
        info = castedWord.valueOf();
      }
    }

    if(typeof preCb === 'function') preCb(info);
    return cb(null, info);
  };
};

Client.prototype.convertMapToHumanReadable = function(mapNameFromServer) {
  var maps = {
      'MP_001': 'Grand Bazaar'
    , 'MP_003': 'Tehran Highway'
    , 'MP_007': 'Caspian Border'
    , 'MP_011': 'Seine Crossing'
    , 'MP_012': 'Operation Firestorm'
    , 'MP_013': 'Damavand Peak'
    , 'MP_017': 'Noshahar Canals'
    , 'MP_018': 'Kharg Island'
    , 'MP_Subway': 'Operation Metro'
  };

  return maps[mapNameFromServer]; //if map is not in list, it will return undefined and will be fine.
};

Client.prototype.convertModeToHumanReadable = function(modeFromServer) {
  var modes = {
      'ConquestLarge0': 'Conquest64'
    , 'ConquestSmall0': 'Conquest'
    , 'RushLarge0': 'Rush'
    , 'SquadRush0': 'Squad Rush'
    , 'SquadDeathMatch0': 'Squad Deathmatch'
    , 'TeamDeathMatch0': 'Team Deathmatch'
  };

  return modes[modeFromServer]; //if mode is not in list, it will return undefined and will be fine.
};