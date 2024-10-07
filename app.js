// ############################################################################
// # Imports
// ############################################################################
const express = require("express");
const { json } = require("express/lib/response");
const app = express();
const zlib = require('zlib');
const { Server } = require("socket.io");
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
let players = {}; // This will hold the mapping of SocketID to position and rotation
let lastProcessedTime = {}; // This will hold the last processed timestamp for each SocketID

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
    console.log("Connection matched");
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
  console.log(socket.handshake);
  if (socket.handshake.auth.token == process.env.UNITYKEY) {
    console.log(`Unity Connected - ${socket.id}`);

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

    socket.on("disconnect", (args) => {
      console.log("CAM Disconnected");
    });

    socket.on("kdata", (k) => {
      const base64String = k.toString('base64');

      // Construct JSON object
      const jsonObject = {
        data: base64String
      };

      io.emit("kudata", jsonObject);
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
  // Step 1: Decompress the base64 string back to a byte array
  let compressedBytes = Buffer.from(data, 'base64');
  zlib.gunzip(compressedBytes, (err, decompressedBytes) => {
      if (err) {
          console.error('Error during decompression:', err);
          return;
      }

      // Step 2: Extract SocketID and floats from the decompressed byte array
      const idLength = 20; // SocketID is 20 characters long
      let socketID = decompressedBytes.slice(0, idLength).toString('utf8');

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

      // Step 3: Update the players map with the new position data
      players[socketID] = { x, y, z, xRot, yRot };
  });
}

function SendPlayerPositions(){
  // Step 4: Serialize the players map and compress it
  let serializedData = JSON.stringify(players);
  zlib.gzip(Buffer.from(serializedData), (err, compressedResponse) => {
      if (err) {
          console.error('Error during compression:', err);
          return;
      }

      // Step 5: Convert the compressed data to base64 and broadcast to all clients
      io.emit('updatePositions', compressedResponse.toString('base64'));
  });
}

setInterval(SendPlayerPositions, 100);