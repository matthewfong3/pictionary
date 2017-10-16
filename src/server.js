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

// holds a new user's ID so server can refer back to when sending back canvas image data
let socketID;

const rooms = {};
let roomNum = 1;
let roomMember = 1;

const randoWords = ['tree', 'flower', 'house', 'bus', 'airplane', 'boat', 'truck', 'train', 'cat', 'dog', 'turtle', 'key', 'cup', 'fork', 'spoon', 'chair', 'table', 'toilet', 'pencil', 'book', 'door', 'rug', 'television', 'phone', 'refrigerator', 'plunger', 'bag', 'bottle', 'acorn', 'cheese', 'apple', 'banana', 'money', 'clock', 'bed', 'scissor', 'jeans', 'shirt', 'boots', 'slippers', 'microwave', 'toaster', 'toothbrush', 'hand', 'leg', 'mouth', 'eye', 'nose', 'ear', 'mail', 'lamp', 'pan', 'spatula', 'bread', 'egg', 'scarf', 'gloves', 'socks', 'bell', 'stairs', 'sun', 'cloud', 'fish', 'earth', 'can', 'milk', 'strawberry', 'ice cream', 'ice cube', 'fire', 'syringe', 'umbrella', 'tie', 'stapler', 'horse', 'moon', 'sign', 'fence'];

io.sockets.on('connection', (sock) => {
  const socket = sock;

  socket.join(`room${roomNum}`);

  socket.on('join', (data) => {
    // create new room in rooms object
    if (!rooms[`room${roomNum}`]) {
      rooms[`room${roomNum}`] = {};
    }

    // create new room member and set their properties
    rooms[`room${roomNum}`][`roomMember${roomMember}`] = {};
    rooms[`room${roomNum}`][`roomMember${roomMember}`].id = socket.id;
    rooms[`room${roomNum}`][`roomMember${roomMember}`].user = data.user;
    rooms[`room${roomNum}`][`roomMember${roomMember}`].coords = data.coords;
    rooms[`room${roomNum}`][`roomMember${roomMember}`].coords.roomNum = roomNum;
    rooms[`room${roomNum}`][`roomMember${roomMember}`].coords.roomMember = roomMember;
    rooms[`room${roomNum}`][`roomMember${roomMember}`].drawer = false;
    rooms[`room${roomNum}`][`roomMember${roomMember}`].points = 0;

    // get canvas image from first client in the same room and send it to new user
    if (roomMember > 1 && roomMember < 4) {
      socketID = socket.id;
      socket.broadcast.emit('getCanvasImage', rooms[`room${roomNum}`][`roomMember${1}`]);
    }

    // broadcast to all connected clients that a new user has joined
    socket.broadcast.to(`room${rooms[`room${roomNum}`][`roomMember${roomMember}`].coords.roomNum}`).emit('msgToClient', { user: 'server', msg: `${data.user} has joined the room.` });
    // message to new user to confirm they have joined
    socket.emit('msgToClient', { user: 'server', msg: 'You joined the room' });
    // update new user's room on client-side
    socket.emit('updateRoom', { room: rooms[`room${roomNum}`][`roomMember${roomMember}`].coords.roomNum, roomMember: rooms[`room${roomNum}`][`roomMember${roomMember}`].coords.roomMember });

    // a room has 4 members, Start Game!
    if (roomMember === 4) {
      // clear all canvas and send server message to all
      io.sockets.in(`room${rooms[`room${roomNum}`][`roomMember${roomMember}`].coords.roomNum}`).emit('clearCanvas', { user: 'server' });
      io.sockets.in(`room${rooms[`room${roomNum}`][`roomMember${roomMember}`].coords.roomNum}`).emit('msgToClient', { user: 'server', msg: 'Ready to start Pictionary game' });

      // display initial points
      for (let i = 1; i <= roomMember; i++) {
        io.sockets.in(`room${roomNum}`).emit('displayPoints', { user: rooms[`room${roomNum}`][`roomMember${i}`].user, points: rooms[`room${roomNum}`][`roomMember${i}`].points });
      }

      // pick a random person as the drawer
      const memberIndex = Math.floor((Math.random() * (5 - 1)) + 1); // indices from 1 - 4
      rooms[`room${roomNum}`].drawer = rooms[`room${roomNum}`][`roomMember${memberIndex}`]; // keys.length == 5, keys of rooms[`room${data.coords.room}`]
      rooms[`room${roomNum}`][`roomMember${memberIndex}`].drawer = true;

      // let keys = Object.keys(rooms[`room${roomNum}`]);
      // console.log(keys);
      // get random word for drawer
      const wordIndex = Math.floor(Math.random() * randoWords.length);
      rooms[`room${roomNum}`].randoWord = randoWords[wordIndex]; // keys.length == 6, keys of rooms[`room${data.coords.room}`]
      io.sockets.connected[rooms[`room${roomNum}`].drawer.id].emit('msgToClient', { user: 'server', msg: `You are the drawer! Your word is ${rooms[`room${roomNum}`].randoWord}` });

      // reset properties for next room
      roomMember = 0;
      roomNum++;
    }
    roomMember++;
  });

  // called for 2nd and 3rd new users in a room
  socket.on('sendCanvasImage', (data) => {
    // need to keep track of person who sent the request for the canvas snapshot
    io.sockets.connected[socketID].emit('joined', data);
  });

  socket.on('clearCommand', (data) => {
    const keys = Object.keys(rooms[`room${data.coords.room}`]);

    if (keys.length === 6) {
      if (rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].drawer) {
        io.sockets.in(`room${data.coords.room}`).emit('clearCanvas', { user: 'server' });
      }
    } else {
      io.sockets.in(`room${data.coords.room}`).emit('clearCanvas', { user: 'server' });
    }
  });

  // sends back all drawing information to clients in room
  socket.on('updateOnServer', (data) => {
    // only the drawer can draw on the canvas when the game has started
    const keys = Object.keys(rooms[`room${data.coords.room}`]);

    if (keys.length === 6) {
      if (rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].drawer) {
        if (rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].coords.lastUpdate < data.coords.lastUpdate) {
          rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].coords = data.coords;
        }
        io.sockets.in(`room${data.coords.room}`).emit('updateOnClient', { user: data.user, coords: data.coords });
      }
    } else { // else, before game starts, anyone can draw
      if (rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].coords.lastUpdate < data.coords.lastUpdate) {
        rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].coords = data.coords;
      }
      io.sockets.in(`room${data.coords.room}`).emit('updateOnClient', { user: data.user, coords: data.coords });
    }
  });

  // sends message back to clients in room
  socket.on('msgToServer', (data) => {
    const keys = Object.keys(rooms[`room${data.coords.room}`]);

    if (keys.length === 6) {
      if (!rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].drawer) {
        io.sockets.in(`room${data.coords.room}`).emit('msgToClient', { user: data.user, msg: data.msg });

        // check to see if guesser's message matches drawer's word
        if (data.msg === rooms[`room${data.coords.room}`].randoWord) {
          io.sockets.in(`room${data.coords.room}`).emit('msgToClient', { user: 'server', msg: `${data.user} guessed correctly` });
          // give the user a point
          rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].points++;

          io.sockets.in(`room${data.coords.room}`).emit('updatePoints', { user: rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].user, points: rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].points });

          // broadcast winner and reset points for a new game
          if (rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].points >= 3) {
            io.sockets.in(`room${data.coords.room}`).emit('msgToClient', { user: 'server', clear: true });
            socket.emit('msgToClient', { user: 'server', msg: 'Congratulations! You Won!' });
            socket.broadcast.to(`room${data.coords.room}`).emit('msgToClient', { user: 'server', msg: `${data.user} is the Winner!` });

            // loop through all members in the room and reset their points for a new game
            for (let i = 1; i <= 4; i++) {
              rooms[`room${data.coords.room}`][`roomMember${i}`].points = 0;
              io.sockets.in(`room${data.coords.room}`).emit('updatePoints', { user: rooms[`room${data.coords.room}`][`roomMember${i}`].user, points: rooms[`room${data.coords.room}`][`roomMember${i}`].points });
            }
          }

          // loop through all members in the room and set the drawer to false
          for (let i = 1; i <= 4; i++) {
            if (rooms[`room${data.coords.room}`][`roomMember${i}`].drawer) { rooms[`room${data.coords.room}`][`roomMember${i}`].drawer = false; }
          }

          // assign them to new drawer 
          rooms[`room${data.coords.room}`].drawer = rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`];
          rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`].drawer = true;

          // give them a new word
          const wordIndex = Math.floor(Math.random() * randoWords.length);
          rooms[`room${data.coords.room}`].randoWord = randoWords[wordIndex];

          io.sockets.in(`room${data.coords.room}`).emit('clearCanvas', { user: 'server' });
          io.sockets.connected[rooms[`room${data.coords.room}`].drawer.id].emit('msgToClient', { user: 'server', msg: `You are the drawer! Your word is ${rooms[`room${data.coords.room}`].randoWord}` });
        }
      }
    } else {
      io.sockets.in(`room${data.coords.room}`).emit('msgToClient', { user: data.user, msg: data.msg });
    }
  });

  // handles disconnects
  socket.on('disconnect', () => {
    /* const keys = Object.keys(clientObjs);
    let disconnecter;
    let index;
    for (let i = 0; i < keys.length; i++) {
      if (clientObjs[keys[i]].id === socket.id) {
        disconnecter = clientObjs[keys[i]].user;
        index = i;
      }
    }
    const message = `${disconnecter} has left the room.`;

    socket.broadcast.emit('msgToClient', { user: 'server', msg: message }); */

    // rooms[`room${data.coords.room}`][`roomMember${data.coords.roomMember}`];
    // socket.leave(`room${clientObjs[keys[index]].roomNum}`);

    // delete clientObjs[keys[index]];
  });
});
