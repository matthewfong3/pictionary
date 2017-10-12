const fs = require('fs');
const http = require('http');
const socketio = require('socket.io');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

const onRequest = (request, response) => {
  fs.readFile(`${__dirname}/../client/client.html`, (err, data) => {
    if (err) throw err;
    response.writeHead(200);
    response.end(data);
  });
};

const app = http.createServer(onRequest);

app.listen(port);

console.log(`listening on 127.0.0.1: ${port}`);

const io = socketio(app);

const clientObjs = {};

let socketID; // holds a new user's ID so server can refer back to when sending back canvas image data

let drawer;
let guessers;

let randoWord = 'tree';

io.sockets.on('connection', (sock) => {
  const socket = sock;

  socket.join('room1');

  socket.on('join', (data) => {
    if (!clientObjs[data.user]) {
      clientObjs[data.user] = {};
      clientObjs[data.user].user = data.user;
      clientObjs[data.user].id = socket.id;
      
      clientObjs[data.user].drawer = false;
      clientObjs[data.user].points = 0;
      
      // set coords for drawing
      clientObjs[data.user].coords = data.coords;
    }

    // get canvas image from first client and send it to new user
    const keys = Object.keys(clientObjs);
    if (keys.length > 0) {
      socketID = socket.id;
      socket.broadcast.emit('getCanvasImage', clientObjs[keys[0]]);
    }

    const response = {
      user: 'server',
      msg: `${data.user} has joined the room.`,
    };

    socket.broadcast.to('room1').emit('msgToClient', response);

    socket.emit('msgToClient', { user: 'server', msg: 'You joined the room' });

    if (keys.length === 4) {
      io.sockets.in('room1').emit('msgToClient', { user: 'server', msg: 'Ready to start Pictionary game' });
      
      let randoIndex = Math.random() * 4;
      randoIndex = Math.floor(randoIndex);
      drawer = clientObjs[keys[randoIndex]];
      clientObjs[keys[randoIndex]].drawer = true;
      console.log(drawer);
  
      io.sockets.connected[drawer.id].emit('msgToClient', {user: 'server', msg: 'You are the drawer! Your word is ' + randoWord});
    }
  });

  socket.on('sendCanvasImage', (data) => {
    // need to keep track of person who sent the request for the canvas snapshot
    io.sockets.connected[socketID].emit('joined', data);
  });

  // sends back all drawing information to clients in room
  socket.on('updateOnServer', (data) => {
    // if new client connected, add them to the client objects with their respective coords
    // else if they exist and they send new data, update it.
    if (clientObjs[data.user].lastUpdate < data.coords.lastUpdate) {
      clientObjs[data.user].coords = data.coords;
    }

    io.sockets.in('room1').emit('updateOnClient', { user: data.user, coords: data.coords });
  });

  // sends message back to clients in room
  socket.on('msgToServer', (data) => {
    // check to see if guesser's message matches drawer's word
    if(data.msg === randoWord && !clientObjs[data.user].drawer){
      io.sockets.in('room1').emit('msgToClient', { user: 'server', msg: data.user + ' guessed correctly' });
      // give the user a point
      clientObjs[data.user].points++;
      // assign them to new drawer and give them new word
      drawer = clientObjs[data.user]; 
      clientObjs[data.user].drawer = true; // but before we do this, we need to set the previous clientObj[].drawer = false
      // everybody else is a guesser
    }

    io.sockets.in('room1').emit('msgToClient', { user: data.user, msg: data.msg });
  });

  // handles disconnects
  socket.on('disconnect', () => {
    // const message = `${s} has left the room.`;
    socket.leave('room1');
  });
});
