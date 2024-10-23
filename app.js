// ############################################################################
// # Imports
// ############################################################################
const express = require("express");
const app = express();
const zlib = require('zlib');
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const io = new Server({
  // don't serve the socket.io client applicaiton on the server
  serveClient: false,
  maxHttpBufferSize: 1e8,
  perMessageDeflate: {
    threshold: 1024, // Only compress messages above 1KB
    zlibDeflateOptions: {
      // See zlib defaults.
      chunkSize: 1024,
      memLevel: 7,
      level: 3 // Compression level (0-9), higher = more compression, more CPU usage
    }
  },
});
require("dotenv").config();

// ############################################################################
// # Server Lifetime Global Vars
// ############################################################################
const CLIENT_ROOM = "CLIENT";
const CAM_ROOM = "CAM";
const MIDI_ROOM = "MIDI";

let players = {}; // This will hold the mapping of SocketID to position and rotation
let lastProcessedTime = {}; // This will hold the last processed timestamp for each SocketID
let updateControllersKinectTransform = false;

let kinectTransform = {
  position: {x: 0, y: 0},
  rotation: {x: 0, y: 0}
}

const assignableColors = [
  [238,64,53],
  [243,119,54],
  [253,244,152],
  [123,192,67],
  [3,146,207],
  [103,56,136],
  [141,85,36]
]

ReadTransformFile();

// ############################################################################
// # Socket IO middlewares
// ############################################################################
io.use((socket, next) => {
  console.log("Connection being attempted");
  console.log(socket.handshake.query);
  console.log(socket.handshake.query.token);
  console.log(socket.handshake.query.secret);
  console.log(socket.handshake.auth.token);
  console.log(socket.handshake.auth.secret);
  if (socket.handshake.auth.token === process.env.UNITYKEY) {
    next();
  }
  else if (
    socket.handshake.query.token === process.env.MIDIKEY &&
    socket.handshake.query.secret === process.env.MIDISECRET
  )
    next();
  else if (
    socket.handshake.query.token === process.env.CAMKEY &&
    socket.handshake.query.secret === process.env.CAMSECRET
  )
    next();
  else {
    console.log("Connection failed - Auth Error");
    next(new Error("Authentication error"));
  }
});

// ############################################################################
// # Socket IO Connected Node Setup
// ############################################################################
io.sockets.on("connection", (socket) => {
  // Unity client connected
  if (socket.handshake.auth.token == process.env.UNITYKEY) {
    console.log(`Unity Connected - ${socket.id}`);
    players[socket.id] = {};
    const randColor = assignableColors[Math.floor(Math.random() * assignableColors.length)];
    players[socket.id].x = 0;
    players[socket.id].y = 0;
    players[socket.id].z = 0;
    players[socket.id].xRot = 0;
    players[socket.id].yRot = 0;
    players[socket.id].display = false;
    players[socket.id].r = randColor[0];
    players[socket.id].g = randColor[1];
    players[socket.id].b = randColor[2];
    players[socket.id].affectLights = false;
    lastProcessedTime[socket.id] = Date.now();

    socket.join(CLIENT_ROOM);

    socket.on("disconnect", (args) => {
      console.log(`Unity Disconnected - ${socket.id}`);
      io.emit("deletePlayer", socket.id.toString());
      delete players[socket.id];
      delete lastProcessedTime[socket.id];
    });

    socket.on("unity-panel-update-request", (value) => {
      console.log(value);
      io.emit("panel-update", value);
    });

    socket.on("playerPosUpdate", (data) => {
      RecievePlayerPosition(data);
    })

    return;
  }

  // MIDI client connected
  if (socket.handshake.query.token === process.env.MIDIKEY) {
    console.log("MIDI Connected");

    socket.join(MIDI_ROOM);

    socket.on("disconnect", (args) => {
      console.log("MIDI Disconnected");
    });

    socket.on("midi-message", (msg) => {
      console.log(msg);
      console.log(msg.message[0]);
      console.log(msg.message[1]);
      // if note 30 activated
      if (Number(msg.message[0]) == 144 && Number(msg.message[1]) == 10) {
        console.log("Emit 144");
        io.emit("door-on", msg.message[2]);
      }
      // if note 30 deactivated
      else if (Number(msg.message[0]) == 128 && Number(msg.message[1]) == 10) {
        console.log("Emit 128");
        io.emit("door-on", msg.message[2]);
      }
      // if note 30 was activated and the value changed
      else if (Number(msg.message[0]) == 176 && Number(msg.message[1]) == 30) {
        console.log("Emit 176");
        io.emit("door-on", msg.message[2]);
      }
    });

    return;
  }

  // CAM connected
  if (socket.handshake.query.token === process.env.CAMKEY) {
    console.log("CAM Connected");
    updateControllersKinectTransform = true;

    socket.join(CAM_ROOM);

    socket.on("disconnect", (args) => {
      console.log("CAM Disconnected");
    });

    socket.on("kdata", (k) => {
      const base64String = k.toString('base64');

      // Construct JSON object
      const jsonObject = {
        data: base64String
      };

      io.to(CLIENT_ROOM).emit("kudata", jsonObject);
    });

    socket.on("kmov", (k) => {
      //io.to(CAM_ROOM).emit("kmov2cam", k);
      try {
        const vec = JSON.parse(k);
        if(!isNumeric(vec.x)) throw("Bad Data");
        if(!isNumeric(vec.y)) throw("Bad Data");
        kinectTransform.position.x += vec.x * 1;
        kinectTransform.position.y += vec.y * 1;
        updateControllersKinectTransform = true;
      } catch(e) {
        console.error(`Bad kmov data from: ${socket.id}`);
      }
    });

    socket.on("krot", (k) => {
      //io.to(CAM_ROOM).emit("krot2cam", k);
      try {
        const vec = JSON.parse(k);
        kinectTransform.rotation.x += vec.x * 5;
        if(kinectTransform.rotation.x >= 360) kinectTransform.rotation.x -= 360;
        else if(kinectTransform.rotation.x < 0) kinectTransform.rotation.x += 360;
        updateControllersKinectTransform = true;
      } catch(e) {
        console.error(`Bad krot data from: ${socket.id}`);
      }
    });


    socket.on("applyt", (k) => {
      try {
        const transform = JSON.parse(k);
        if(!isNumeric(transform.position.x)) throw("Bad Data");
        if(!isNumeric(transform.position.y)) throw("Bad Data");
        if(!isNumeric(transform.rotation.x)) throw("Bad Data");
        if(!isNumeric(transform.rotation.y)) throw("Bad Data");
        kinectTransform = {
          position: {
            x: transform.position.x,
            y: transform.position.y
          },
          rotation: {
              x: transform.rotation.x,
              y: transform.rotation.y
          }
        };
      } catch(e) {
        console.error(`Bad krot data from: ${socket.id}`);
      }
    });

    socket.on("savet", (d) => {
      SaveTransformFile();
    });

    return;
  }

  console.log("Connection falied");
});

// ############################################################################
// # Express Static Site Hosting
// ############################################################################
app.use(express.static("public"));

// ############################################################################
// # Start Socket and Express Servers
// ############################################################################
io.listen(3001);
app.listen(3002);

// ############################################################################
// # Function Bodies
// ############################################################################
function RecievePlayerPosition(data) {
  try{
    // Step 1: Decompress the base64 string back to a byte array
    let compressedBytes = Buffer.from(data, 'base64');
    zlib.gunzip(compressedBytes, (err, decompressedBytes) => {
      if (err) {
        console.error('Error during decompression:', err);
        return;
      }

      // Step 2: Extract SocketID and floats from the decompressed byte array
      const idLength = 20; // SocketID is 20 characters long
      let socketID = decompressedBytes.subarray(0, idLength).toString('utf8');

      //Skip if the ID is invalid
      if(lastProcessedTime[socketID] === undefined || players[socketID] === undefined) return;
      
      // Step 3: Check the rate limit
      let currentTime = Date.now();
      if (lastProcessedTime[socketID] && (currentTime - lastProcessedTime[socketID] < 70)) {
          return; // Skip processing if within the rate limit window
      }

      // Update last processed time
      lastProcessedTime[socketID] = currentTime;
      
      let x = decompressedBytes.readFloatLE(idLength);
      let y = decompressedBytes.readFloatLE(idLength + 4);
      let z = decompressedBytes.readFloatLE(idLength + 8);
      let xRot = decompressedBytes.readFloatLE(idLength + 12);
      let yRot = decompressedBytes.readFloatLE(idLength + 16);
      let display = decompressedBytes.readUInt8(idLength + 20) !== 0
      let affectLights = decompressedBytes.readUInt8(idLength + 21) !== 0

      // Step 3: Update the players map with the new position data
      players[socketID].x = x;
      players[socketID].y = y;
      players[socketID].z = z;
      players[socketID].xRot = xRot;
      players[socketID].yRot = yRot;
      players[socketID].display = display;
      players[socketID].affectLights = affectLights;
    });
  }
  catch(e){
    console.error(`Bad player pos data from: ${socket.id}`);
  }
}

function SendKinectTransform() {
  //SendKinectCoords
  if(updateControllersKinectTransform) {
    io.to([CLIENT_ROOM, CAM_ROOM]).emit("kinectTransform", JSON.stringify(kinectTransform));
    updateControllersKinectTransform = false;
  }
  else
    io.to([CLIENT_ROOM]).emit("kinectTransform", JSON.stringify(kinectTransform));

    Object.keys(lastProcessedTime).forEach((lpt) => {
      if(Date.now() - lastProcessedTime[lpt] > 120*1000) {
        delete players[lpt];
        delete lastProcessedTime[lpt]
      }
    })
}

function UpdateLights() {
  const colorsToSend = [];
  Object.entries(players).forEach(entry => {
    const [key, value] = entry;
    if(!value.display || !value.affectLights) return;
    colorsToSend.push({r: value.r, g: value.g, b: value.b});
  });
  console.info(colorsToSend);
  io.to(MIDI_ROOM).emit("lights_update", colorsToSend);
}

function SendPlayersData(){
  // Step 4: Serialize the players map and compress it
  // https://stackoverflow.com/questions/286141/remove-blank-attributes-from-an-object-in-javascript
  let serializedData = JSON.stringify(Object.fromEntries(Object.entries(players).filter(([_, v]) => v != null)));
  zlib.gzip(Buffer.from(serializedData), (err, compressedResponse) => {
    if (err) {
      console.error('Error during compression:', err);
      return;
    }

    // Step 5: Convert the compressed data to base64 and broadcast to all clients
    io.to(CLIENT_ROOM).emit('updatePositions', compressedResponse.toString('base64'));
  });
}

function ReadTransformFile() 
{
  fs.access(path.resolve(__dirname, "transform.json"), fs.constants.F_OK, (err) => {
    if(err) fs.writeFile(path.resolve(__dirname, "transform.json"), JSON.stringify(kinectTransform), (err) => {if(err)console.error(err)});
    fs.readFile(path.resolve(__dirname, "transform.json"), (err, data) => {
      if(!err)
        kinectTransform = JSON.parse(data);
    });
  });
}

function SaveTransformFile() {
  fs.writeFile(path.resolve(__dirname, "transform.json"), JSON.stringify(kinectTransform), (err) => {if(err)console.error(err)});
}

setInterval(SendPlayersData, 1000/10);
setInterval(SendKinectTransform, 1000/ 3);
setInterval(UpdateLights, 1000/ 3);


//https://stackoverflow.com/questions/9716468/pure-javascript-a-function-like-jquerys-isnumeric
function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}