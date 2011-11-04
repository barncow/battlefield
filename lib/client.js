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

	self._client = net.connect(port, ip, function() {
    //connected
    self._isConnected = true;
    if(!self._queueRequests()) self._queue.drain(self._sendBuffer);
  });

  self._client.on('data', function(data) {
    var result = self._bufferToWords(data)
      , words = result.words;

    if(result.isResponse) {
      //we have a response to a request we made, call its callback.
      var status = words.shift()
        , cb = self._requests[result.sequence];
      delete self._requests[result.sequence];

      if(typeof cb !== 'function') return; //no callback
      
      if(status === 'OK') cb(null, words);
      else cb(status);
    } else {
      //we have an event
      var e = words.shift();

      self.emit('serverEvent.'+e, words);
    }
  });

  self._client.on('error', function(err) {
    self.emit('error', err);
  });

  self._client.on('disconnect', function() {
    self._isConnected = false;
    self._isAuthenticated = false;
    self._isAuthenticating = false;
  });

	if(typeof password !== 'undefined') {
   self.login.secure(password);
  }
}
util.inherits(Client, EventEmitter2);

Client.prototype._wordsToBuffer = function(isFromServer, isResponse, words) {
  var i = 0
    , packetSize = 12 //packet has 3 32-bit (4 byte) ints for 12 bytes
    , buf = null
    , offset = 0
    , numWords = words.length
    , word = null
    , header = this._sequence & 0x3fffffff
    , ret = {sequence: this._sequence}; 

  if(!isFromServer) header += 0x80000000;
  if(isResponse) header += 0x40000000;

  //iterate through words append word length onto packetSize
  for(; i < numWords; ++i) {
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
    var word = words[i];

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
    wordLength = buf.readUInt32LE(offset);
    offset += 4;

    //read word
    word = buf.toString('utf8', offset, offset+wordLength);
    ret.words.push(word);
    offset += word.length;

    //skip null terminator
    ++offset;
  }

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

  var bufObj = self._wordsToBuffer(false, false, words);

  if(typeof cb === 'function') {
    self._requests[bufObj.sequence] = cb;
  }

  if(command.indexOf('login.') !== 0 && self._queueRequests()) {
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
Client.prototype._getServerActionCallback = function(cb, casting) {
  if(typeof cb !== 'function') {
    return function(err) {
      if(err) self.emit(err);
    };
  }

  return function(err, words) {
    if(err) return cb(err);
    if(typeof casting === 'undefined') return cb(null, words);

    var info = undefined, mvType = null;
    for(var castItr = 0, wordItr = 0; wordItr < words.length && castItr < casting.length; ++wordItr) {
      if(typeof info === 'undefined') info = {};
      
      var word = words[wordItr]
        , castedWord = word;

      if(!mvType) {
        //not currently processing a MultiValueType, proceed as normal.

        var cast = casting[castItr]
          , property = cast;

        //if the cast is a string, don't cast. Otherwise, expect object of: {propName: Number}
        if(cast && typeof cast === 'object') {
          //cast is an object and not null
          property = Object.keys(cast).shift();
          var casterFn = cast[property];

          if(casterFn.name) {
            //not MultiValueType, just cast as normal
            castedWord = casterFn(word);
          } else {
            var casterInstance = new casterFn(word);
            if(casterInstance instanceof MultiValueType) {
              mvType = casterInstance;
              if(mvType.isFinished()) {
                info[property] = mvType.valueOf();
                ++castItr;
                mvType = null;
              }
            } else {
              //not MultiValueType, not a function with name attribute, just cast as normal
              castedWord = casterFn(word);
            }
          }
        }

        if(!mvType) {
          info[property] = castedWord;
          ++castItr;
        }
      } else {
        //processing MultiValueType. Give it the current word, see if we are done.
        mvType.give(word);
        if(mvType.isFinished()) {
          info[property] = mvType.valueOf();
          ++castItr;
          mvType = null;
        }
      }
    }

    return cb(null, info);
  };
};