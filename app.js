// ############################################################################
// # Imports
// ############################################################################
const express = require("express");
const { json } = require("express/lib/response");
const app = express();
const { Server } = require("socket.io");
const io = new Server({
  // don't serve the socket.io client applicaiton on the server
  serveClient: false,
});
require("dotenv").config();

// ############################################################################
// # Socket IO middlewares
// ############################################################################
io.use((socket, next) => {
  console.log("Connection being attempted");
  console.log(socket.handshake.query);
  if (socket.handshake.query.token === process.env.UNITYKEY) next();
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
    console.log("Connection failed");
    next(new Error("Authentication error"));
  }
});

// ############################################################################
// # Socket IO Connected Node Setup
// ############################################################################
io.sockets.on("connection", (socket) => {
  // Unity client connected
  console.log(socket.handshake);
  if (socket.handshake.query.token == process.env.UNITYKEY) {
    console.log("Unity Connected");

    socket.on("disconnect", (args) => {
      console.log("Unity Disconnected");
    });

    socket.on("unity-panel-update-request", (value) => {
      console.log(value);
      io.emit("panel-update", value);
    });

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

    socket.on("keyframes", (k) => {
      console.log(k);
      io.emit("ukeyframes", k);
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
