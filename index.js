var Client = require('./lib/client');

module.exports.connect = function(ip, port, password) {
	return new Client(ip, port, password);
};