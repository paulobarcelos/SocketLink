define(
[
],
function (
){
	var io = {}
	var SocketLink = function(group, uuid) {
	
		var self = this,
		socket,
		callbacks = {};

		var connect = function (host) {
			if(!io[host]){
				require([host + '/socket.io/socket.io.js'], function (socketio) {
					io[host] = socketio;
					connectSocket(socketio, host)
				})
			}
			else connectSocket(io[host], host)			
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
	return SocketLink;
});