var exports = module.exports
  , util = require('util');

/**
  Base interface for types that consume more than one word from a response. All types should inherit from this base type.
  Calling these parent functions are not necessary (except constructor), this is mainly to document the expected interface.
  @param initial word as a string (you will need to cast it yourself as necessary)
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