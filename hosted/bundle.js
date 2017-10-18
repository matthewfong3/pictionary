"use strict";

// canvas-related variables

var canvas = void 0;
var ctx = void 0;
var dragging = false;
var lineWidth = void 0;
var strokeStyle = void 0;

var DEFAULT_LINE_WIDTH = 3;
var DEFAULT_STROKE_STYLE = 'black';

var draws = {}; // object that will hold all of drawing information from server

var user = void 0; // variable to hold local client's username

var clientCoords = {
  prevX: 0, prevY: 0, destX: 0, destY: 0,
  lineWidth: DEFAULT_LINE_WIDTH,
  strokeStyle: DEFAULT_STROKE_STYLE,
  room: 1, roomMember: 1
};

// Helper functions
var getMouse = function getMouse(e) {
  return {
    x: e.pageX - e.target.offsetLeft,
    y: e.pageY - e.target.offsetTop
  };
};

var doMouseDown = function doMouseDown(e) {
  dragging = true;
  var mouse = getMouse(e);
  clientCoords.prevX = mouse.x;
  clientCoords.prevY = mouse.y;

  clientCoords.destX = mouse.x;
  clientCoords.destY = mouse.y;
};

var doMouseMove = function doMouseMove(e) {
  if (!dragging) {
    clientCoords.destX = clientCoords.prevX;
    clientCoords.destY = clientCoords.prevY;
    return;
  }

  var mouse = getMouse(e);
  clientCoords.prevX = clientCoords.destX;
  clientCoords.prevY = clientCoords.destY;

  clientCoords.destX = mouse.x;
  clientCoords.destY = mouse.y;
};

var doMouseUp = function doMouseUp(e) {
  dragging = false;
};

var doMouseOut = function doMouseOut(e) {
  dragging = false;
};

var doLineWidthChange = function doLineWidthChange(e) {
  lineWidth = e.target.value;
};

var doStrokeStyleChange = function doStrokeStyleChange(e) {
  strokeStyle = e.target.value;
};

var doClear = function doClear() {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  //drawGrid(ctx, 'lightgray', 10, 10);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
};

// draws all the information onto canvas
var draw = function draw() {
  var keys = Object.keys(draws);

  for (var i = 0; i < keys.length; i++) {
    var drawCall = draws[keys[i]];

    ctx.lineWidth = drawCall.lineWidth;
    ctx.strokeStyle = drawCall.strokeStyle;

    ctx.beginPath();
    ctx.moveTo(drawCall.prevX, drawCall.prevY);
    ctx.lineTo(drawCall.destX, drawCall.destY);
    ctx.closePath();
    ctx.stroke();
  }
};

// handles new server response on client-side
var handleResponse = function handleResponse(data) {
  if (!draws[data.user]) {
    draws[data.user] = data.coords;
  } else if (data.coords.lastUpdate > draws[data.user].lastUpdate) {
    draws[data.user] = data.coords;
  }

  draw();
};

// client listens for a new user join to server and they request for the current canvas image
var updateOnJoin = function updateOnJoin(data) {
  var image = new Image();

  image.src = data.imgData;
  image.onload = function () {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  console.log('received canvas image from other client');
};

var connectSocket = function connectSocket(e) {
  var socket = io.connect();

  // function for initial setup when user joins server room
  var setup = function setup() {
    var time = new Date().getTime();

    user = document.querySelector("#username").value;

    clientCoords.lastUpdate = time;

    draws[user] = clientCoords;

    socket.emit('join', { user: user, coords: clientCoords });
  };

  // function to send new drawing updates to server
  var update = function update() {
    var time = new Date().getTime();

    clientCoords.lastUpdate = time;

    clientCoords.lineWidth = lineWidth;
    clientCoords.strokeStyle = strokeStyle;

    socket.emit('updateOnServer', { user: user, coords: clientCoords });
  };

  // function that sends a clear canvas command to server
  var sendClearCommand = function sendClearCommand(e) {
    socket.emit('clearCommand', { user: user, coords: clientCoords });
  };

  // function to send messages to server
  var sendMessage = function sendMessage(e) {
    var msgVal = document.querySelector('#message').value;

    if (msgVal) socket.emit('msgToServer', { user: user, msg: msgVal, coords: clientCoords });
  };

  var message = document.querySelector('#message');
  message.onfocus = function () {
    message.value = '';
  };

  socket.on('connect', function () {
    setup(); // setup new user once

    setInterval(update, 1); // send update() to server

    // set up enter key press
    message.addEventListener('keyup', function (e) {
      e.preventDefault();
      if (e.keyCode === 13) {
        sendMessage();
        message.value = '';
      }
    });
    document.querySelector('#send').onclick = sendMessage;
    document.querySelector('#clearButton').onclick = sendClearCommand;
  });

  // when new user joins, grab a screenshot of current canvas
  // send it to server and it will route it back to new user
  socket.on('getCanvasImage', function (data) {
    if (user === data.user) {
      socket.emit('sendCanvasImage', { imgData: canvas.toDataURL() });
    }
  });

  // save user's room number and member on client-side
  socket.on('updateRoom', function (data) {
    clientCoords.room = data.room;
    clientCoords.roomMember = data.roomMember;
  });

  // if new user, they will receive a snapshot of canvas image 
  // and draw it onto their canvas once they joined
  socket.on('joined', updateOnJoin);

  socket.on('clearCanvas', doClear);

  var scoreSection = document.querySelector('#scoreSection');

  // display initial points
  socket.on('displayPoints', function (data) {
    var p = document.createElement('p');
    p.setAttribute('name', data.user);
    p.innerHTML = data.user + "'s points: " + data.points;
    scoreSection.appendChild(p);
  });

  // update points when user gets a point
  socket.on('updatePoints', function (data) {
    var userPoints = document.getElementsByName(data.user);
    userPoints[0].innerHTML = data.user + "'s points: " + data.points;
  });

  // handles response from server and draws all info
  socket.on('updateOnClient', handleResponse);

  var chatarea = document.getElementById('chat');

  // handles messages from server and displays them in chatbox
  socket.on('msgToClient', function (data) {
    chatarea.scrollTop = chatarea.scrollHeight;

    if (data.clear) chat.innerHTML = '';

    if (data.msg) {
      var text = data.user + ": " + data.msg + '\n';
      chat.innerHTML += text;
    }
  });
};

var init = function init() {
  canvas = document.querySelector('#canvas');
  ctx = canvas.getContext('2d');

  lineWidth = DEFAULT_LINE_WIDTH;
  strokeStyle = DEFAULT_STROKE_STYLE;

  ctx.lineCape = 'round';
  ctx.lineJoin = 'round';

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  canvas.onmousedown = doMouseDown;
  canvas.onmousemove = doMouseMove;
  canvas.onmouseup = doMouseUp;
  canvas.onmouseout = doMouseOut;

  document.querySelector('#lineWidthChooser').onchange = doLineWidthChange;document.querySelector('#strokeStyleChooser').onchange = doStrokeStyleChange;

  var connect = document.querySelector('#connect');
  connect.addEventListener('click', connectSocket);
};

window.onload = init;
