// ############################################################################
// # Imports
// ############################################################################
const express = require("express");
const app = express();
const { Server } = require("socket.io");
const io = new Server({
  // don't serve the socket.io client applicaiton on the server
  serveClient: false,
});
require("dotenv").config();

let doorActive = false;

// ############################################################################
// # Socket IO middlewares
// ############################################################################
io.use((socket, next) => {
  console.log("Connection being attempted");
  if (socket.handshake.query.token === process.env.UNITYKEY) next();
  else if (
    socket.handshake.query.token === process.env.MIDIKEY &&
    socket.handshake.query.secret === process.env.MIDISECRET
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
      // if note 30 activated
      if (msg.message[0] == 144 && msg.message[1] == 30) {
        doorActive = true;
        socket.broadcast.emit("door-on", msg.message[2]);
      }
      // if note 30 deactivated
      else if (msg.message[0] == 128 && msg.message[1] == 30) {
        doorActive = false;
        socket.broadcast.emit("door-on", msg.message[2]);
      }
      // if note 30 was activated and the value changed
      else if (msg.message[0] == 176 && msg.message[1] == 1 && doorActive)
        socket.broadcast.emit("door-on", msg.message[2]);
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
