if(process.env.NODETIME_ACCOUNT_KEY) {
	require('nodetime').profile({
		accountKey: process.env.NODETIME_ACCOUNT_KEY
	});
}

var socketLinkSever = require('./index');


socketLinkSever.start(parseInt(process.env.PORT) || 5000, process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost:27017/bond' )
