if(process.env.NODETIME_ACCOUNT_KEY) {
	require('nodetime').profile({
		accountKey: process.env.NODETIME_ACCOUNT_KEY
	});
}

var fs = require('fs'),
http = require('http');

var server = http.createServer(function (req, res) {
fs.readFile(__dirname + '/static' + req.url, function (err,data) {
		if (err) {
			res.writeHead(404);
			res.end(JSON.stringify(err));
			return;
		}
		res.writeHead(200);
		res.end(data);
	});
}).listen(parseInt(process.env.PORT) || 5000);

var socketLinkSever = require('./index');


socketLinkSever.start(server, process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost:27017/bond' )
