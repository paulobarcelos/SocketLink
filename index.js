
var io = require('socket.io')
var mongoose = require('mongoose');

var connectMongoose = function(url){
	mongoose.connect(url, function (err, res) {
		if (err) {
			console.log ('MONGOOSE: Error connecting to ' + url + ' : ' + err);
			setTimeout(function () {
				connectMongoose(url)
			}, 3000);
		} else {
			console.log ('MONGOOSE: Succeeded to connect to ' + url);
		}
	});
}



var clients = {};
var listeners = {};
var guaranteedReports = {};
var confirmedReportsIds = {};
var GUARANTEED_REPORTS_ID_FACTORY = 1;
var DEFAULT_GROUP = 'shared';

var ClientSchema = new mongoose.Schema({
	created: { 
		type: Date,
		default: Date.now
	},
	uuid: { 
		type: String
	},
	group: { 
		type: String,
		default: DEFAULT_GROUP
	},
	online: { 
		type: Boolean,
		default: false
	}
});
var ClientModel = mongoose.model('Client', ClientSchema);
ClientModel.remove({}, function(err) {});

var InteractionSchema = new mongoose.Schema({
	created: { 
		type: Date,
		default: Date.now
	},
	group: { 
		type: String
	},
	data: mongoose.Schema.Types.Mixed
});
var InteractionModel = mongoose.model('Interaction', InteractionSchema);
ClientModel.remove({}, function(err) {});


var Client = function(providedUuid, providedGroup, clientsRegistry, onDBReadyCallback) {
	var self = this,
	uuid,
	group,
	socket;


	var init = function(){
		if(providedUuid){
			ClientModel.findOne({ uuid : providedUuid }, function (err, doc) {
				if(!err && doc ){
					log('uuid already exists.');

					if(doc.online){
						log('Another client with the same uuid is online. A new uuid will be provided.');
						generateDBEntry(null, providedGroup);
					}
					else {
						if(doc.group !== providedGroup){
							log('Group mismatch.');
							updateGroup(doc, providedGroup, onDBReady);
						}
						else onDBReady(providedUuid, providedGroup);
					}
				}
				else{
					log('uuid does not exist.');
					generateDBEntry(providedUuid, providedGroup);
				}
			});
		}
		else {
			log('No uuid was provided .');
			generateDBEntry(null, providedGroup);
		}
	}
	var generateDBEntry = function (_uuid, _group) {
		_uuid = _uuid || generateUUID();
		_group = _group || DEFAULT_GROUP;
		var model = new ClientModel({
			uuid: _uuid,
			group: _group
		});
		model.save(function (error, doc) {
			if(!error && doc){
				log('New client successfully created.');
				onDBReady(doc.uuid, doc.group);
			}
			else onFatalError('CLIENT: Cannot create DB entry.');
		});
	}
	var updateGroup = function (doc, _group, callback) {
		_group = _group || DEFAULT_GROUP;
		doc.group = _group;
		doc.save(function (error) {
			if(!error){
				log('Client group updated.');
				callback(doc.uuid, doc.group);
			}
			else onFatalError('CLIENT: Cannot updated client.');
		});
	}
	var generateUUID = function(a){
		return a? (a ^ Math.random()* 16 >> a/4).toString(16): ([1e7] + -1e3 + -4e3 + -8e3 +-1e11 ).replace( /[018]/g, generateUUID );
	}

	var onFatalError = function(error) {
		if(socket)socket.emit('fatal error', error );
	}
	var onLogin = function() {
		log('Login successfull.');
		ClientModel.findOne({ uuid : uuid }, function (err, doc) {
			if (err || !doc) return;
			doc.online = true;
			doc.save(function (error) {
				if(!error){
					socket.emit('login', doc);
					requestOnlineClients(function (results) {
						reportToGroupListeners(group, 'update', results);
					})
				}
			});
		})
		
	}
	var onDBReady = function (_uuid, _group) {
		uuid = _uuid;
		group = _group;
		clientsRegistry[uuid] = self;
		if(socket) onLogin();
		if(onDBReadyCallback) onDBReadyCallback(self);
	}
	var onConnect = function() {
		if(uuid) onLogin();
		socket.on('disconnect', onDisconnect);
	}
	var onDisconnect = function() {
		ClientModel.findOne({ uuid : uuid }, function (err, client) {
			if (err || !client) return;
			client.online = false;
			client.save(function (error) {
				if(!error){
					requestOnlineClients(function (results) {
						reportToGroupListeners(group, 'update', results);
					})
				}
			});
		})
		log('disconnect')
		socket = null;
	}
	var requestOnlineClients = function (callback) {
		ClientModel.distinct('uuid', {group: group, online: true}, function (err, results) {
			if(!err && results ){
				callback(results)
			}
		});
	}

	var log = function (message) {
		var g = group || '_'+providedGroup;
		var u = uuid || '_'+providedUuid;
		console.log('CLIENT '+u+'@'+g+': '+message);
	}

	var getUUID = function () {
		return uuid;
	}
	var getGroup = function () {
		return group;
	}
	var getSocket = function () {
		return socket;
	}
	var setSocket =  function(value){
		socket = value;
		onConnect();
	}

	Object.defineProperty(self, 'uuid', {
		get: getUUID,
	});
	Object.defineProperty(self, 'group', {
		get: getGroup,
	});
	Object.defineProperty(self, 'socket', {
		get: getSocket,
		set: setSocket
	});


	init();
}


var clearGuaranteedReports = function(){
	for(var reportId in guaranteedReports){
		var report = guaranteedReports[reportId];
		if(confirmedReportsIds[reportId] || report.attempts > 240) {
			delete guaranteedReports[reportId];
		}
		else{
			report.attempts++;
			guaranteedReportToSingleListener(report.group, report.uuid, report.event, report.data, reportId)
		}
	}
	setTimeout(clearGuaranteedReports, 5000);
}
clearGuaranteedReports();

var queryModel = function(event, socket, Model, query, acknowledgement){
	if(!query) query = {};
	Model.find(query, function (err, results) {
		if(!err && results ){
			//console.log('MONGOOSE: query success', query);
			socket.emit(event, results)
			if(acknowledgement) acknowledgement(results);
		}
		else{
			//console.log('MONGOOSE: query error', query);
		}
	});
}
var queryCountModel = function(event, socket, Model, query, acknowledgement){
	if(!query) query = {};
	InteractionModel.count(query, function (err, count) {
		if(!err ){
			//console.log('MONGOOSE: count success', query);
			socket.emit(event, count)
			if(acknowledgement) acknowledgement(count);
		}
		else{
			//console.log('MONGOOSE: count error', query);
		}
	});
}
var queryDistinctModel = function(event, socket, Model, field, query, acknowledgement){
	if(!query) query = {};
	Model.distinct(field, query, function (err, results) {
		if(!err && results ){
			//console.log('MONGOOSE: query distinct success', field, query, results);
			socket.emit(event, results)
			if(acknowledgement) acknowledgement(results);
		}
		else{
			//console.log('MONGOOSE: query distinct error', field, query);
		}
	});
}
var reportToAllListeners = function(event, data){
	for(var group in listeners){
		reportToGroupListeners(group, event, data);
	}
}
var reportToGroupListeners = function(group, event, data){

	if(!listeners[group]) return;
	for(var uuid in listeners[group]){
		reportToSingleListener(group, uuid, event, data);
	}
}
var reportToSingleListener = function(group, uuid, event, data){
	if(data.guaranteed) return guaranteedReportToSingleListener(group, uuid, event, data);
	try{
		
		listeners[group][uuid].socket.emit(event, data);	
	}
	catch(e){
		//console.log(e);
	}

	
}
var guaranteedReportToSingleListener = function(group, uuid, event, data, reportId){
	try{

		reportId = reportId || GUARANTEED_REPORTS_ID_FACTORY++;
		if(confirmedReportsIds[reportId]){
			if(guaranteedReports[reportId]) delete guaranteedReports[reportId];
			return;
		}
		else{
			guaranteedReports[reportId] = {
				group:group,
				uuid:uuid,
				event:event,
				data:data,
				attempts: 0
			}
		}

		listeners[group][uuid].socket.emit(event, data, function(data){
			// if this runs, we are sure the message was received
			confirmedReportsIds[reportId] = true;
			if(guaranteedReports[reportId]) 
				delete guaranteedReports[reportId];
			
		});
	}
	catch(e){
		//console.log(e);
	}

}
var storeInteraction = function(group, data){
	var model = new InteractionModel({
		group: group,
		data: data
	});
	model.save(function (error, results) {
	});
}

var start = function (port, mongoUrl) {
	var server = io.listen(port);
	server.set('log level', 1)

	connectMongoose(mongoUrl);
	clearGuaranteedReports();

	server.sockets.on('connection', function (socket) {
		socket.on('identity', function(indentityData) {

			var registerEvents = function(client){
				var group = client.group;
				if(!listeners[group]) listeners[group] = {};
				listeners[group][client.uuid] = client;

				socket.on('message', function(data){
					if(typeof data === 'undefined') data = {};
					if(typeof data.log === 'undefined') data.log = true;
					if(typeof data.guaranteed === 'undefined') data.guaranteed = true;

					data.from = client.uuid;

					if(data.to){
						for (var i = 0; i <  data.to.length; i++) {
							reportToSingleListener(client.group, data.to[i], 'message', data);
						};
					}
					else reportToGroupListeners(client.group, 'message', data);

					if(data.log) storeInteraction(client.group, data);
				});

					
			}

			var client = new Client(indentityData.uuid, indentityData.group, clients, registerEvents);
				client.socket = socket;
			
			

		});

		socket.on('interaction-query', function(query, acknowledgement) {
			queryModel('interaction-query', socket, InteractionModel, query, acknowledgement);
		});
		socket.on('interaction-query-count', function(query, acknowledgement) {
			queryCountModel('interaction-query-count', socket, InteractionModel, query, acknowledgement);
		});
		socket.on('interaction-query-distinct', function(data, acknowledgement) {
			queryDistinctModel('interaction-query-distinct', socket, InteractionModel, data.field, data.query, acknowledgement);
		});
		socket.on('client-query', function(query, acknowledgement) {
			queryModel('client-query', socket, ClientModel, query, acknowledgement);
		});
		socket.on('client-query-count', function(query) {
			queryCountModel('client-query-count', socket, ClientModel, query, acknowledgement);
		});
		socket.on('client-query-distinct', function(data, acknowledgement) {
			queryDistinctModel('client-query-distinct', socket, ClientModel, data.field, data.query, acknowledgement);
		});

		
	});
}

exports.start = start;