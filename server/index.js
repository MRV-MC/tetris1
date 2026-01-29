const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Game rooms storage
const rooms = new Map();
const playerRooms = new Map();

// Room class
class GameRoom {
  constructor(id, hostId, hostName) {
    this.id = id;
    this.host = { id: hostId, name: hostName, ready: false, board: null, score: 0, lines: 0, level: 1 };
    this.guest = null;
    this.status = 'waiting'; // waiting, playing, finished
    this.createdAt = Date.now();
  }

  addGuest(guestId, guestName) {
    this.guest = { id: guestId, name: guestName, ready: false, board: null, score: 0, lines: 0, level: 1 };
  }

  removePlayer(playerId) {
    if (this.host && this.host.id === playerId) {
      if (this.guest) {
        this.host = this.guest;
        this.guest = null;
      } else {
        return true; // Room should be deleted
      }
    } else if (this.guest && this.guest.id === playerId) {
      this.guest = null;
    }
    return false;
  }

  getPlayer(playerId) {
    if (this.host && this.host.id === playerId) return this.host;
    if (this.guest && this.guest.id === playerId) return this.guest;
    return null;
  }

  getOpponent(playerId) {
    if (this.host && this.host.id === playerId) return this.guest;
    if (this.guest && this.guest.id === playerId) return this.host;
    return null;
  }

  isFull() {
    return this.host && this.guest;
  }

  bothReady() {
    return this.host?.ready && this.guest?.ready;
  }

  toJSON() {
    return {
      id: this.id,
      host: this.host ? { name: this.host.name, ready: this.host.ready } : null,
      guest: this.guest ? { name: this.guest.name, ready: this.guest.ready } : null,
      status: this.status,
      playerCount: (this.host ? 1 : 0) + (this.guest ? 1 : 0)
    };
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create a new room
  socket.on('createRoom', (playerName) => {
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    const room = new GameRoom(roomId, socket.id, playerName || 'Player 1');
    rooms.set(roomId, room);
    playerRooms.set(socket.id, roomId);
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, room: room.toJSON() });
    io.emit('roomsList', getRoomsList());
    console.log(`Room created: ${roomId} by ${playerName}`);
  });

  // Join existing room
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    if (room.isFull()) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }
    
    if (room.status !== 'waiting') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }

    room.addGuest(socket.id, playerName || 'Player 2');
    playerRooms.set(socket.id, roomId);
    
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, room: room.toJSON() });
    socket.to(roomId).emit('playerJoined', { room: room.toJSON() });
    io.emit('roomsList', getRoomsList());
    console.log(`${playerName} joined room: ${roomId}`);
  });

  // Player ready
  socket.on('playerReady', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!room) return;
    
    const player = room.getPlayer(socket.id);
    if (player) {
      player.ready = true;
      io.to(roomId).emit('roomUpdate', { room: room.toJSON() });
      
      // Start game if both players ready
      if (room.bothReady()) {
        room.status = 'playing';
        const seed = Date.now();
        io.to(roomId).emit('gameStart', { seed });
        console.log(`Game started in room: ${roomId}`);
      }
    }
  });

  // Game state update
  socket.on('gameUpdate', (data) => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!room || room.status !== 'playing') return;
    
    const player = room.getPlayer(socket.id);
    if (player) {
      player.board = data.board;
      player.score = data.score;
      player.lines = data.lines;
      player.level = data.level;
      player.currentPiece = data.currentPiece;
      player.currentX = data.currentX;
      player.currentY = data.currentY;
      player.currentType = data.currentType;
      
      // Send update to opponent
      socket.to(roomId).emit('opponentUpdate', {
        board: data.board,
        score: data.score,
        lines: data.lines,
        level: data.level,
        nextPiece: data.nextPiece,
        currentPiece: data.currentPiece,
        currentX: data.currentX,
        currentY: data.currentY,
        currentType: data.currentType
      });
    }
  });

  // Send garbage lines
  socket.on('sendGarbage', (lines) => {
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      socket.to(roomId).emit('receiveGarbage', lines);
    }
  });

  // Player game over
  socket.on('gameOver', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!room) return;
    
    const opponent = room.getOpponent(socket.id);
    const player = room.getPlayer(socket.id);
    
    room.status = 'finished';
    
    io.to(roomId).emit('gameEnded', {
      winner: opponent ? opponent.name : null,
      loser: player ? player.name : null,
      hostScore: room.host?.score || 0,
      guestScore: room.guest?.score || 0
    });
    
    console.log(`Game ended in room: ${roomId}`);
  });

  // Restart game request
  socket.on('requestRestart', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!room) return;
    
    room.status = 'waiting';
    if (room.host) room.host.ready = false;
    if (room.guest) room.guest.ready = false;
    
    io.to(roomId).emit('gameRestart', { room: room.toJSON() });
  });

  // Leave room
  socket.on('leaveRoom', () => {
    handlePlayerLeave(socket);
  });

  // Get rooms list
  socket.on('getRooms', () => {
    socket.emit('roomsList', getRoomsList());
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handlePlayerLeave(socket);
  });
});

function handlePlayerLeave(socket) {
  const roomId = playerRooms.get(socket.id);
  
  if (roomId) {
    const room = rooms.get(roomId);
    
    if (room) {
      const shouldDelete = room.removePlayer(socket.id);
      
      if (shouldDelete) {
        rooms.delete(roomId);
      } else {
        room.status = 'waiting';
        if (room.host) room.host.ready = false;
        socket.to(roomId).emit('playerLeft', { room: room.toJSON() });
      }
    }
    
    playerRooms.delete(socket.id);
    socket.leave(roomId);
    io.emit('roomsList', getRoomsList());
  }
}

function getRoomsList() {
  const roomsList = [];
  rooms.forEach((room, id) => {
    if (room.status === 'waiting' && !room.isFull()) {
      roomsList.push(room.toJSON());
    }
  });
  return roomsList;
}

// Clean up old empty rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, id) => {
    if (room.status === 'waiting' && !room.guest && now - room.createdAt > 10 * 60 * 1000) {
      rooms.delete(id);
    }
  });
  io.emit('roomsList', getRoomsList());
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
