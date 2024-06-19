"use strict";
        
// canvas-related variables
let canvas;
let ctx;
let dragging = false;
let lineWidth;
let strokeStyle;

let DEFAULT_LINE_WIDTH = 3;
let DEFAULT_STROKE_STYLE = 'black';

let draws = {}; // object that will hold all of drawing information from server

let user; // variable to hold local client's username

const clientCoords = {
  prevX: 0, prevY: 0, destX: 0, destY: 0,
  lineWidth: DEFAULT_LINE_WIDTH, 
  strokeStyle: DEFAULT_STROKE_STYLE,
  roomNum: 1, roomMember: 1,
};

// Helper functions
const getMouse = (e) => {
  return {
    x: e.pageX - e.target.offsetLeft,
    y: e.pageY - e.target.offsetTop,
  };
};

const doMouseDown = (e) => {
  dragging = true;

  var mouse = getMouse(e);

  clientCoords.prevX = mouse.x;
  clientCoords.prevY = mouse.y;
  
  clientCoords.destX = mouse.x;
  clientCoords.destY = mouse.y;
};

const doMouseMove = (e) => {
  if(!dragging){
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

const doMouseUp = (e) => {
  dragging = false;
};

const doMouseOut = (e) => {
  dragging = false;
};

const doLineWidthChange = (e) => {
  lineWidth = e.target.value;
};

const doStrokeStyleChange = (e) => {
  strokeStyle = e.target.value;
};

const doClear = () => {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
};

// draws all the information onto canvas
const draw = () => {
  let keys = Object.keys(draws);
  
  for(let i = 0; i < keys.length; i++){
    const drawCall = draws[keys[i]];
 
    ctx.lineWidth = drawCall.lineWidth;
    ctx.strokeStyle = drawCall.strokeStyle;
    
    ctx.beginPath();
    ctx.moveTo(drawCall.prevX, drawCall.prevY);
    ctx.lineTo(drawCall.destX, drawCall.destY);
    ctx.closePath();
    ctx.stroke();
  }
};

// handles new incoming server response on client-side
const handleResponse = (data) => {
  if(!draws[data.user]) draws[data.user] = data.coords;
  else if(data.coords.lastUpdate > draws[data.user].lastUpdate) draws[data.user] = data.coords;
  
  draw();
};

// function that will draw the received canvas image data onto the client's canvas
const updateOnJoin = (data) => {          
  let image = new Image();
  
  image.src = data.imgData;
  image.onload = () => {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  };
  
  console.log('received canvas image from other client');
};

const connectSocket = (e) => {
  const socket = io.connect();

  const scoreSection = document.querySelector('#scoreSection');
  const chatarea = document.getElementById('chat');
  
  // function for initial setup when user joins server room
  const setup = () => {
    const time = new Date().getTime();
  
    user = document.querySelector("#username").value;
  
    clientCoords.lastUpdate = time;
  
    draws[user] = clientCoords;
  
    // client emits a 'join' event to server
    socket.emit('join', {user: user, coords: clientCoords});

    // reset (clear) the value of message element on focus
    const message = document.querySelector('#message');
    message.onfocus = () => { message.value = ''; };

    // set up enter key press
    message.addEventListener('keyup', (e) => {
      e.preventDefault();
      if(e.keyCode === 13){
        sendMessage();
        message.value = '';
      }
        
    });
    
    document.querySelector('#send').onclick = sendMessage;
    document.querySelector('#clearButton').onclick = sendClearCommand;
  };
  
  // function to send new drawing updates to server
  const update = () => {
    const time = new Date().getTime();
  
    clientCoords.lastUpdate = time;
  
    clientCoords.lineWidth = lineWidth;
    clientCoords.strokeStyle = strokeStyle;
   
    socket.emit('updateOnServer', {user: user, coords: clientCoords});
  };
  
  // function that sends a clear canvas command to server
  const sendClearCommand = (e) => {
    socket.emit('clearCommand', {user: user, coords: clientCoords});
  };
  
  // function to send messages to server
  const sendMessage = (e) => {
    let msgVal = document.querySelector('#message').value;
    
    if(msgVal) socket.emit('msgToServer', {user: user, msg: msgVal, coords: clientCoords});
  };
  
  socket.on('connect', () => {
    setup(); // setup new user once
    
    setInterval(update, 1); // send update() to server
  });
  
  // when new user joins, grab a screenshot of current canvas
  // send it to server and it will route it back to new user
  socket.on('getCanvasImage', (data) => {
    if(user === data.user) socket.emit('sendCanvasImage', {imgData: canvas.toDataURL()});
  });
  
  // save user's roomNumber and roomMember on client-side
  socket.on('updateRoom', (data) => {
    clientCoords.roomNum = data.roomNum;
    clientCoords.roomMember = data.roomMember;
  });
  
  // if new user, they will receive a snapshot of canvas image and draw it onto their canvas once they joined
  socket.on('joined', updateOnJoin);
  
  socket.on('clearCanvas', doClear);
  
  // display initial points
  socket.on('displayPoints', (data) => {
    let p = document.createElement('p');
    p.setAttribute('name', data.user);
    p.innerHTML = data.user + "'s points: " + data.points;
    scoreSection.appendChild(p);
  });
  
  // update points when user gets a point
  socket.on('updatePoints', (data) => {
    let userPoints = document.getElementsByName(data.user);
    userPoints[0].innerHTML = data.user + "'s points: " + data.points;
  });
  
  // handles response from server and draws all info
  socket.on('updateOnClient', handleResponse);
  
  // handles messages from server and displays them in chatbox
  socket.on('msgToClient', (data) => {
    chatarea.scrollTop = chatarea.scrollHeight;
    
    if(data.clear) chat.innerHTML = '';
    
    if(data.msg){
      let text = data.user + ": " + data.msg + '\n';
      chat.innerHTML += text;
    }
  });
};

const init = () => {
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
  
  document.querySelector('#lineWidthChooser').onchange = doLineWidthChange; document.querySelector('#strokeStyleChooser').onchange = doStrokeStyleChange;
  
  const connect = document.querySelector('#connect');
  connect.addEventListener('click', connectSocket);
};

window.onload = init;