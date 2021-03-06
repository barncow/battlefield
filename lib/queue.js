var Queue = module.exports = function() {
	this._queue = [];
}

Queue.prototype.add = function(buf, proc) {
	if(this._isConnected && this._queue.length === 0) {
    proc(buf);
  }
  else {
    this._queue.push(buf);
  }
};

Queue.prototype.drain = function(proc, cb) {
  var self = this;
	
  this._queue.forEach(function(buf) {
    process.nextTick(function() {proc(buf);});
  });
  if(cb) process.nextTick(cb);
  this._queue = [];
};