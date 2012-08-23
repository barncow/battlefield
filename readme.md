[![build status](https://secure.travis-ci.org/barncow/battlefield.png)](http://travis-ci.org/barncow/battlefield)
# battlefield v0.1.0

A library for Node.JS to connect to a Battlefield 3 (and probably other versions, like Bad Company 2) server, and perform commands.

I will be expanding on the documentation later, but this should be enough to get you started:

## Install
To install, make sure that you install Node.JS v0.6.x and the latest npm. v0.6.x is the stable version of v0.5.x, and is needed for its expanded `Buffer` capabilities.
Then, run `npm install battlefield`

## Sample Code
```javascript
var bf = require('battlefield')
  , client = bf.connect('BF3', '1.1.1.1', 1234); //logging in is optional, but you can only do a few commands.

client.login.secure('password'); //this handles hashing the password so it is not sent over the wire in clear text
//even easier: client = bf.connect('BF3', '1.1.1.1', 1234, 'password'); //automatically hashes the password for you

//Commands are queued until you are connected and logged in
//Commands, for the most part, follow the syntax of the server commands.

client.version(function(err, v) {
  if(err) throw err; //if err has a value, the request failed, otherwise it was a success. Err will contain the error message from the server.

  console.log(v.version); //responses are automatically formatted into an understandable object with their values casted as necessary
});

//If you want to construct commands on your own, with no casting of the response (you just get an array of strings back)
client.command("listPlayers all", function(err, words){
  if(err) throw err;

  console.log(words);

  client.quit(); //close connection
});
```