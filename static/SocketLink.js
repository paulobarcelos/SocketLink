(function (){

	var ioServer = {}
	var SocketLink = function( group, uuid ) {
	
		var self = this,
		socket,
		callbacks = {};

		var connect = function (host) {
			if(!ioServer[host]){
				loadScript(host + '/socket.io/socket.io.js', function (socketio) {
					ioServer[host] = socketio || window.io;
					connectSocket(ioServer[host], host)
				})
			}
			else connectSocket(ioServer[host], host)			
		}
		var connectSocket = function (socketio, host) {
			socket = socketio.connect(host, {'force new connection': true});
			socket.on('error', function () {
				setTimeout(function () {
					socket.socket.connect();
				}, 1000);
			});

			socket.on('connect', function () {
				socket.emit('identity', {
					uuid: uuid,
					group: group
				});
			});			

			socket.on('fatal error', function (error) {
				if(callbacks['fatal error']) callbacks['error'](error);
			});

			socket.on('login', function (client) {
				uuid = client.uuid;
				group = client.group;
				if(callbacks['connect']) callbacks['connect'](uuid, group);
			});

			socket.on('disconnect', function () {
				if(callbacks['disconnect']) callbacks['disconnect'](uuid, group);
			});

			socket.on('message', function (data, acknowledgement){
				if(acknowledgement) acknowledgement(uuid);
				if(callbacks['message']) callbacks['message'](data.original);
			});

			socket.on('update', function (data){
				if(callbacks['update']) callbacks['update'](data);
			});

		}

		var send = function (message, to, guaranteed, log) {
			var data = { original: message };
			data.to = to;
			data.guaranteed = guaranteed;
			data.log = log;

			if(data.to && !(data.to instanceof Array)) data.to = [data.to];
			if(typeof data.guaranteed === 'undefined') data.guaranteed = true;
			if(typeof data.log === 'undefined') data.log = true;

			socket.emit('message', data);
		}

		var on = function (event, fn) {
			callbacks[event] = fn
		}

		var listGroups = function (fn) {
			socket.emit(
				'client-query-distinct',
				{
					field: 'group',
					query:{
						online: true
					}
				},
				fn
			);
		}

		var getSocket = function () {
			return socket;
		}
		var loadScript = function(url, callback){
			if(typeof require !== 'undefined'){
				require([url], callback);
				return;
			}
			// Adding the script tag to the head as suggested before
			var head = document.getElementsByTagName('head')[0];
			var script = document.createElement('script');
			script.type = 'text/javascript';
			script.src = url;

			console.log('aaaa', script)
			// Then bind the event to the callback function.
			// There are several events for cross browser compatibility.
			script.onreadystatechange = callback;
			script.onload = callback;

			// Fire the loading
			head.appendChild(script);
		}

		Object.defineProperty(self, 'connect', {
			value: connect
		});
		Object.defineProperty(self, 'send', {
			value: send
		});
		Object.defineProperty(self, 'on', {
			value: on
		});
		Object.defineProperty(self, 'listGroups', {
			value: listGroups
		});
		Object.defineProperty(self, 'socket', {
			get: getSocket
		});

	}

	if(typeof define !== 'undefined'){
		define([], function(){
			return SocketLink;
		});
	}
	else if (typeof exports !== 'undefined'){
		exports.SocketLink = SocketLink;
	}
	else window.SocketLink = SocketLink;

})();