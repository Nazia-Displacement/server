## WebSocket Server with Express and Socket.IO

> This application sets up a WebSocket server using Socket.IO and an Express server to host a static site, facilitating real-time communication with Unity clients, MIDI devices, and cameras. It manages player positions and Kinect transformation data while ensuring authenticated access. This server acts as a dedicated bridge between the MIDI device output and all connected Unity3D clients.

## Prerequisites

This project is tested on the following Node and NPM versions. [Node](http://nodejs.org/) and [NPM](https://npmjs.org/) are really easy to install. To make sure you have them available on your machine, try running the following command.

```sh
$ npm -v && node -v
9.8.1
v18.18.2
```

## Table of Contents

- [WebSocket Server with Express and Socket.IO](#websocket-server-with-express-and-socketio)
  - [Prerequisites](#prerequisites)
  - [Table of Contents](#table-of-contents)
  - [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Serving the app](#serving-the-app)
  - [Credits](#credits)
  - [Built With](#built-with)
  - [Authors](#authors)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine.

## Installation

**BEFORE YOU INSTALL:** please read the [prerequisites](#prerequisites).

Start with cloning this repo on your local machine. To install the needed modules run in the project directory:

```sh
npm install
```

## Usage

### Serving the app

```sh
$ node app.js
```

## Credits

- Nazia Parvez - Owner of https://formblu.com/ and creative mind behind the project
- John-Michael Reed - Creator of the hardware and its [code](https://github.com/BleepLabs/Parvez-touch-panel). See their Github: [BleepLabs aka Dr. Bleep](https://github.com/BleepLabs)

## Built With

- Node.js
- dotenv
- express
- socket.io
- zlib
- fs
- path

## Authors

- **Isaac Hisey** - _Initial work_ - [TheTornadoTitan](https://github.com/thetornadotitan)
