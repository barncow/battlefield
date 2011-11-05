var Client = require('./lib/client');

//using game here to possibly support previous/future battlefield games. This method would dispatch as needed, but for now we throw it away.
module.exports.connect = function(game, ip, port, password) {
	return new Client(ip, port, password);
};