var exports = module.exports
  , util = require('util');

/**
  Base interface for types that consume more than one word from a response. All types should inherit from this base type.
  Calling these parent functions are not necessary (except constructor), this is mainly to document the expected interface.
  @param initial word as a string (you will need to cast it yourself as necessary)
  Constructor should also call its own new variation if it is not an instance:
  if(!(this instanceof MyType)) return new MyType(word);
*/
var MultiValueType = exports.MultiValueType = function(word) {};

/**
  Receive a word from server response word list as a string (you will need to cast it yourself as necessary).
*/
MultiValueType.prototype.give = function(word) {};

/**
  Return true if no further values are needed, otherwise false if more values should be given to give function.
*/
MultiValueType.prototype.isFinished = function() {};

/**
  Called immediately after isFinished to grab the value that is placed in the resulting JSON object (and should return an object literal, not a function object)
*/
MultiValueType.prototype.valueOf = function() {};

/*--------------------------
  CUSTOM TYPES FOLLOW
----------------------------*/

/**
  TeamScores type - used in serverInfo to record scores for each team, along with target score (first to this score ends game - win or lose)
*/
var TeamScores = module.exports.TeamScores = function(word) {
  if(!(this instanceof TeamScores)) return new TeamScores(word);
	MultiValueType.call(this, word);

  this.totalWords = Number(word)+1; //word is number of scores (words) that follow. There is an extra for target score.
  this.numWords = 0; //used to count words given.
  this.scores = [];
};
util.inherits(TeamScores, MultiValueType);

TeamScores.prototype.give = function(word) {
  this.scores.push(Number(word));
  ++this.numWords;
};

TeamScores.prototype.isFinished = function() {
  return (this.numWords >= this.totalWords);
};

TeamScores.prototype.valueOf = function() {
  var targetScore = this.scores.pop();
  return {
      scores: this.scores
    , targetScore: targetScore
  };
};

var PlayerInfo = module.exports.PlayerInfo = function(word) {
  if(!(this instanceof PlayerInfo)) return new PlayerInfo(word);
  MultiValueType.call(this, word);

  this.numParams = Number(word);
  this.numPlayers = null;
  this.totalWords = this.numParams+1;

  this.wordItr = 1; //already processed our first word
  this.paramItr = 0;

  this.params = [];
  this.currentPlayer = {};
  this.players = [];

  //lists params and casts. If not in list, String is assumed
  this.customCasts = {
      teamId: Number
    , squadId: Number
    , kills: Number
    , deaths: Number
    , score: Number
  };
};
util.inherits(PlayerInfo, MultiValueType);

PlayerInfo.prototype.give = function(word) {
  if(this.wordItr < this.numParams+1) { //+1 because first word was num params
    //still handling params
    this.params.push(word);
  } else if(this.wordItr === this.numParams+1) { //+1 because first word was num params
    //number of players
    this.numPlayers = Number(word);
    this.totalWords += this.numPlayers * this.numParams+1;
  } else if (this.wordItr < this.totalWords) {
    var param = this.params[this.paramItr]
        ,castFn = this.customCasts[param];

    if(typeof castFn !== 'undefined') {
      word = castFn(word);
    }

    this.currentPlayer[param] = word;

    ++this.paramItr;
    if(this.paramItr >= this.numParams) {
      this.paramItr = 0;
      this.players.push(this.currentPlayer);
      this.currentPlayer = {};
    }
  }

  ++this.wordItr;
};

PlayerInfo.prototype.isFinished = function() {
  return (this.wordItr >= this.totalWords && this.numPlayers !== null);
};

PlayerInfo.prototype.valueOf = function() {
  return this.players;
};

var BanList = module.exports.BanList = function(word) {
  if(!(this instanceof BanList)) return new BanList(word);
  MultiValueType.call(this, word);

  this.banParams = ['idType', 'id', 'banType', 'time', 'reason'];
  this.numBanParams = this.banParams.length
  this.banParamItr = 0;
  this.currentBan = {};
  this.bans = [];

  //this should have been the number of bans, but the response wants to give us idType instead.
  this.give(word);
};
util.inherits(BanList, MultiValueType);

BanList.prototype.give = function(word) {
  this.currentBan[this.banParams[this.banParamItr]] = word;

  ++this.banParamItr;

  if(this.banParamItr === this.numBanParams) {
    this.bans.push(this.currentBan);
    this.currentBan = {};
    this.banParamItr = 0;
  }
};

BanList.prototype.isFinished = function() {
  return false; //never finishes since response doesn't tell us when
};

BanList.prototype.valueOf = function() {
  return this.bans;
};

/**
  MapList type - returns an array of objects of the server's map list
*/
var MapList = module.exports.MapList = function(word) {
  if(!(this instanceof MapList)) return new MapList(word);
  MultiValueType.call(this, word);

  this.numMaps = Number(word);
  this.paramNames = ['rounds', 'mapName', 'gameMode'];
  this.numParamNames  =this.paramNames.length;
  this.totalWords = this.numMaps * this.numParamNames +1; //already processed first word
  this.wordItr = 1;
  this.paramItr = 0;
  this.currentMap = {};
  this.maps = [];
};
util.inherits(MapList, MultiValueType);

MapList.prototype.give = function(word) {
  var castedWord = word;
  if(this.paramItr === 0) castedWord = Number(word); //casting rounds

  this.currentMap[this.paramNames[this.paramItr]] = castedWord;

  ++this.paramItr; ++this.wordItr;
  if(this.paramItr === this.numParamNames) {
    this.paramItr = 0;
    this.maps.push(this.currentMap);
    this.currentMap = {};
  }
};

MapList.prototype.isFinished = function() {
  return (this.wordItr >= this.totalWords);
};

MapList.prototype.valueOf = function() {
  return this.maps;
};

/**
  MapIndicies type - returns an object that shows the current map index, and the next map index
*/
var MapIndicies = module.exports.MapIndicies = function(word) {
  if(!(this instanceof MapIndicies)) return new MapIndicies(word);
  MultiValueType.call(this, word);

  this.mapIndicies = {
    currentMapIndex: Number(word)
  }
  this.totalWords = 2;
  this.wordItr = 1;
};
util.inherits(MapIndicies, MultiValueType);

MapIndicies.prototype.give = function(word) {
  this.mapIndicies.nextMapIndex = Number(word); //shortcutting since we know this only gets called on second param
  ++this.wordItr;
};

MapIndicies.prototype.isFinished = function() {
  return (this.wordItr >= this.totalWords);
};

MapIndicies.prototype.valueOf = function() {
  return this.mapIndicies;
};

/**
  MapRounds type - returns an object that shows the current round, and the total number of rounds for this map
*/
var MapRounds = module.exports.MapRounds = function(word) {
  if(!(this instanceof MapRounds)) return new MapRounds(word);
  MultiValueType.call(this, word);

  this.mapRounds = {
    currentRound: Number(word)
  }
  this.totalWords = 2;
  this.wordItr = 1;
};
util.inherits(MapRounds, MultiValueType);

MapRounds.prototype.give = function(word) {
  this.mapRounds.totalRounds = Number(word); //shortcutting since we know this only gets called on second param
  ++this.wordItr;
};

MapRounds.prototype.isFinished = function() {
  return (this.wordItr >= this.totalWords);
};

MapRounds.prototype.valueOf = function() {
  return this.mapRounds;
};

var GameAdmins = module.exports.GameAdmins = function(word) {
  if(!(this instanceof GameAdmins)) return new GameAdmins(word);
  MultiValueType.call(this, word);

  this.params = ['name', 'restrictionLevel'];
  this.numParams = this.params.length
  this.paramItr = 0;
  this.current = {};
  this.admins = [];

  //this should have been the number of bans, but the response wants to give us name instead.
  this.give(word);
};
util.inherits(GameAdmins, MultiValueType);

GameAdmins.prototype.give = function(word) {
  var castedWord = word;
  if(this.paramItr === 1) castedWord = Number(word); //casting restr level

  this.current[this.params[this.paramItr]] = castedWord;

  ++this.paramItr;

  if(this.paramItr === this.numParams) {
    this.admins.push(this.current);
    this.current = {};
    this.paramItr = 0;
  }
};

GameAdmins.prototype.isFinished = function() {
  return false; //never finishes since response doesn't tell us when
};

GameAdmins.prototype.valueOf = function() {
  return this.admins;
};
