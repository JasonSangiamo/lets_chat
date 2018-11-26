//used some of the functions introduced in: https://socket.io/get-started/chat/
// Require the packages we will use:
var http = require("http"),
socketio = require("socket.io"),
fs = require("fs");

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
		if(err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);
console.log('Server running at http://ec2-34-229-89-124.compute-1.amazonaws.com:3456/ or localhost:3456');
// Creating JavaScript Objects to hold the information I need:
var users = {}; //keeps track of the socket id's for each user
var roomslist = {'Lobby': 'lfaldkfjnaonespoaenpoimplkcasmd;'}; //keeps track of who created each room
var private_rooms={}; //keep track of private room passwords
var userLocations = {} //keeps track of where each person is
var banned_users = {}; //keeps track of who's been banned from each room
// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket){
	//adding a + to all functions I've checked
	//+Adding a user +
	socket.on('add_user', function(user, socketid){
		for(var key in users){
			console.log(key);
			if(key == user){
				socket.emit('username_taken');
				return;
			}
		}
		socket.user = user;
		socket.room='Lobby';
		users[user]=socketid;
		userLocations[user]=socket.room;
		console.log("new user: "+user);
		socket.join(socket.room);
		socket.emit('message_to_client', 'MOD', 'You have joined '+socket.room,[],[]);
		socket.broadcast.to(socket.room).emit('message_to_client', 'MOD', socket.user+" has joined "+socket.room,[],[]);
		socket.emit("update_users", userLocations, roomslist);
		socket.broadcast.to(socket.room).emit("new_user", socket.user, socket.room, roomslist);
		socket.emit("update_rooms", roomslist, private_rooms, banned_users);
	});
	//+Send a message to current room+
	socket.on('message_to_server', function(msg,color,style) {
		console.log(socket.user+": "+msg); // log it to the Node.JS output
		//io.sockets.in(socket.room).emit("message_to_client", socket.user, msg,[],[]); // broadcast the message to other users
		
		console.log(socket.user+": "+msg); // log it to the Node.JS output
		//logging style for debugging
		console.log("STYLE IS " + style);
		console.log("COLOR IS " + color);
		io.sockets.in(socket.room).emit("message_to_client", socket.user, msg, color, style); // broadcast the message to other users
	});
	//+Sending a private message+
	socket.on('private_message', function(target, msg, color, style){
		console.log("(Private)"+socket.user+": "+msg);
		socket.to(users[target]).emit("message_to_client", "(Private) "+socket.user, msg, color, style);
		socket.emit("message_to_client", "(Private to "+target+")", msg, color,style);
	});
	
	//Switch Rooms
	socket.on('switch_rooms', function(room){
		console.log("Switching from "+socket.room+" to "+room);
		//leave current room and join new room
		socket.leave(socket.room);
		socket.join(room);
		//display new room in chat
		socket.emit('message_to_client', 'MOD', 'You have joined '+room, [], []);
		//announce to the room you just left and room you just joined
		socket.broadcast.to(socket.room).emit('message_to_client', 'MOD', socket.user+" has left "+socket.room,[],[]);
		socket.broadcast.to(room).emit('message_to_client', 'MOD', socket.user+" has joined "+room,[],[]);
		//
		userLocations[socket.user]=room;
		socket.broadcast.to(socket.room).emit("update_users", userLocations, roomslist);
		socket.broadcast.to(room).emit("update_users", userLocations, roomslist);
		//switch rooms
		socket.emit("update_users", userLocations, roomslist);
		socket.emit("update_rooms", roomslist, private_rooms, banned_users);
		socket.room=room;
	});
	//Creating a new room
	socket.on('create_room', function(room){
		roomslist[room]=socket.user;
		console.log("Creating Room: "+room, "By "+socket.user);
		io.sockets.emit("update_rooms", roomslist, private_rooms, banned_users);
	});
	//disconnect event found at https://stackoverflow.com/questions/17287330/socket-io-handling-disconnect-event
	socket.on('disconnect', function() {
		//socket.broadcast.to(socket.room).emit("user_disconnect", socket.user);
		socket.broadcast.to(socket.room).emit("message_to_client", 'MOD', socket.user+" has disconnected",[],[]);
		console.log("REMOVING DISCONNECTED USER FROM ROOM");
		console.log(socket.room);
		delete userLocations[socket.user];
		socket.broadcast.to(socket.room).emit("update_users", userLocations, roomslist);
		socket.broadcast.to(socket.room).emit("update_rooms", roomslist, private_rooms, banned_users);
		console.log(userLocations);
		console.log(roomslist);
   });
	//Creating a new private room
	socket.on('create_private_room', function(room, password){
		roomslist[room]=socket.user;
		private_rooms[room]=password;
		console.log("Creating Private Room: "+room, " By "+socket.user);
		io.sockets.emit("update_rooms", roomslist, private_rooms, banned_users);
	});
	socket.on('join_private_room', function(room, password){
		socket.emit("verify_private_room", roomslist, room, private_rooms, password);
	});
	socket.on('kick', function(target){
		socket.to(users[target]).emit("get_kicked");
	});
	socket.on('ban', function(target){
		if(banned_users.hasOwnProperty(socket.room)){
			banned_users[socket.room].push(target);
		}
		else{
			banned_users[socket.room]=[target];
		}
		
		socket.to(users[target]).emit("get_banned");
	});
	//kick the targeted user from var room
	socket.on('got_kicked', function(){
		socket.leave(socket.room);
		socket.join('Lobby');
		userLocations[socket.user]='Lobby';
		socket.emit('message_to_client', 'MOD', 'You have been kicked from '+socket.room+'. Now in Lobby',[],[]);
		socket.emit("update_users", userLocations, roomslist);
		socket.emit("update_rooms", roomslist, private_rooms, banned_users);
		socket.broadcast.to(socket.room).emit('message_to_client', 'MOD', socket.user+" has been kicked from "+socket.room,[],[]);
		socket.broadcast.to(socket.room).emit("update_users", userLocations, roomslist);
		//announce to the room you just left and room you just joined
		socket.broadcast.to('Lobby').emit('message_to_client', 'MOD', socket.user+" has joined Lobby",[],[]);
		socket.broadcast.to('Lobby').emit("new_user", socket.user, socket.room, roomslist);
		
		socket.room='Lobby';
	});
	//ban the targeted user from var room
	socket.on('got_banned', function(){
		socket.leave(socket.room);
		socket.join('Lobby');

		userLocations[socket.user]='Lobby';
		//message the user, update their users and rooms
		socket.emit('message_to_client', 'MOD', 'You have been banned from '+socket.room+'. Now in Lobby',[],[]);
		socket.emit("update_users", userLocations, roomslist);
		socket.emit("update_rooms", roomslist, private_rooms, banned_users);
		//message the room that the user was banned from and update users
		socket.broadcast.to(socket.room).emit('message_to_client', 'MOD', socket.user+" has been banned from "+socket.room,[],[]);
		socket.broadcast.to(socket.room).emit("update_users", userLocations, roomslist);
		
		//announce to the room you just left and room you just joined
		socket.broadcast.to('Lobby').emit('message_to_client', 'MOD', socket.user+" has joined Lobby",[],[]);
		socket.broadcast.to('Lobby').emit("new_user", socket.user, socket.room, roomslist);
		socket.room='Lobby';
	})
	/*
		//display new room in chat
		socket.emit('message_to_client', 'MOD', 'You have joined '+room, [], []);
		//announce to the room you just left and room you just joined
		socket.broadcast.to(socket.room).emit('message_to_client', 'MOD', socket.user+" has left "+socket.room,[],[]);
		socket.broadcast.to(room).emit('message_to_client', 'MOD', socket.user+" has joined "+room,[],[]);
		//
		userLocations[socket.user]=room;
		socket.broadcast.to(socket.room).emit("update_users", userLocations, room, socket.user, roomslist);
		socket.broadcast.to(room).emit("update_users", userLocations, room, socket.user, roomslist);
		//switch rooms
		socket.emit("update_users", userLocations, room, socket.user, roomslist);
		socket.emit("update_rooms", roomslist, room, private_rooms, banned_users);
		socket.room=room;
	*/
	
});
