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
// Grace period timers: roomId -> timeout (clear on rejoin)
const disconnectTimers = new Map();
const RECONNECT_GRACE_MS = 30000;

// Room class
class GameRoom {
  constructor(id, hostId, hostName) {
    this.id = id;
    this.host = { id: hostId, name: hostName, ready: false, board: null, score: 0, lines: 0, level: 1, rating: 1000 };
    this.guest = null;
    this.status = 'waiting'; // waiting, playing, finished
    this.createdAt = Date.now();
  }

  addGuest(guestId, guestName) {
    this.guest = { id: guestId, name: guestName, ready: false, board: null, score: 0, lines: 0, level: 1, rating: 1000 };
  }
  
  calculateRatingChange(winnerId) {
    const winner = this.getPlayer(winnerId);
    const loser = this.getOpponent(winnerId);
    
    if (!winner || !loser) return;
    
    const winnerRating = winner.rating || 1000;
    const loserRating = loser.rating || 1000;
    
    // Expected score (probability of winning)
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const expectedLoser = 1 - expectedWinner;
    
    // K-factor: 32 for new players (< 30 games), 16 for experienced
    const kFactor = 32; // Simplified - could track games played
    
    // Calculate new ratings
    const winnerChange = Math.round(kFactor * (1 - expectedWinner));
    const loserChange = Math.round(kFactor * (0 - expectedLoser));
    
    winner.rating = Math.max(0, winnerRating + winnerChange);
    loser.rating = Math.max(0, loserRating + loserChange);
    
    return {
      winner: { rating: winner.rating, change: winnerChange },
      loser: { rating: loser.rating, change: loserChange }
    };
  }
  
  getRank(rating) {
    if (rating < 800) return { name: 'Bronze', color: '#cd7f32' };
    if (rating < 1200) return { name: 'Silver', color: '#c0c0c0' };
    if (rating < 1600) return { name: 'Gold', color: '#ffd700' };
    if (rating < 2000) return { name: 'Platinum', color: '#e5e4e2' };
    return { name: 'Diamond', color: '#b9f2ff' };
  }

  removePlayer(playerId) {
    if (this.host && this.host.id === playerId) {
      if (this.guest && this.guest.id) {
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

  // Mark player as disconnected (grace period for reconnect)
  markDisconnected(playerId) {
    if (this.host && this.host.id === playerId) {
      this.host.disconnectedAt = Date.now();
      this.host.id = null;
      return 'host';
    }
    if (this.guest && this.guest.id === playerId) {
      this.guest.disconnectedAt = Date.now();
      this.guest.id = null;
      return 'guest';
    }
    return null;
  }

  // Rejoin: assign new socket.id to disconnected slot with matching name
  tryRejoin(socketId, playerName) {
    if (this.host && this.host.name === playerName && this.host.id === null) {
      this.host.id = socketId;
      this.host.disconnectedAt = null;
      return true;
    }
    if (this.guest && this.guest.name === playerName && this.guest.id === null) {
      this.guest.id = socketId;
      this.guest.disconnectedAt = null;
      return true;
    }
    return false;
  }

  // Remove disconnected slot after grace period (returns true if room should be deleted)
  removeDisconnectedIfExpired(graceMs) {
    const now = Date.now();
    if (this.host && this.host.id === null && this.host.disconnectedAt && (now - this.host.disconnectedAt >= graceMs)) {
      if (this.guest && this.guest.id) {
        this.host = this.guest;
        this.guest = null;
      } else {
        return true; // Room empty
      }
    }
    if (this.guest && this.guest.id === null && this.guest.disconnectedAt && (now - this.guest.disconnectedAt >= graceMs)) {
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
    return !!(this.host && this.guest);
  }

  hasDisconnectedSlot() {
    return (this.host && this.host.id === null) || (this.guest && this.guest.id === null);
  }

  bothReady() {
    return this.host?.ready && this.guest?.ready;
  }

  toJSON() {
    return {
      id: this.id,
      host: this.host ? { name: this.host.name, ready: this.host.ready, rating: this.host.rating, disconnected: this.host.id === null } : null,
      guest: this.guest ? { name: this.guest.name, ready: this.guest.ready, rating: this.guest.rating, disconnected: this.guest.id === null } : null,
      status: this.status,
      playerCount: (this.host && this.host.id ? 1 : 0) + (this.guest && this.guest.id ? 1 : 0)
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

  // Rejoin room after disconnect (e.g. page refresh)
  socket.on('rejoinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    if (!room.tryRejoin(socket.id, playerName || '')) {
      socket.emit('error', { message: 'Could not rejoin (slot expired or name mismatch)' });
      return;
    }
    // Clear grace-period timer if any
    if (disconnectTimers.has(roomId)) {
      clearTimeout(disconnectTimers.get(roomId));
      disconnectTimers.delete(roomId);
    }
    playerRooms.set(socket.id, roomId);
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, room: room.toJSON() });
    socket.to(roomId).emit('playerRejoined', { room: room.toJSON() });
    io.emit('roomsList', getRoomsList());
    console.log(`${playerName} rejoined room: ${roomId}`);
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
      
      // Send update to opponent (support both delta and full board)
      socket.to(roomId).emit('opponentUpdate', {
        board: data.board,
        boardDelta: data.boardDelta,
        score: data.score,
        lines: data.lines,
        level: data.level,
        nextPiece: data.nextPiece,
        holdPiece: data.holdPiece,
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

  // Send speed boost attack to opponent
  socket.on('speedBoostAttack', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!room || room.status !== 'playing') return;
    
    // Send speed boost to opponent
    socket.to(roomId).emit('receiveSpeedBoost');
    console.log(`Speed boost attack sent in room: ${roomId}`);
  });

  // Send piece change attack to opponent
  socket.on('changePieceAttack', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!room || room.status !== 'playing') return;
    
    // Send piece change to opponent
    socket.to(roomId).emit('receivePieceChange');
    console.log(`Piece change attack sent in room: ${roomId}`);
  });

  // Player game over - restart only the losing player
  socket.on('gameOver', () => {
    const roomId = playerRooms.get(socket.id);
    const room = rooms.get(roomId);
    
    if (!room || room.status !== 'playing') return;
    
    const player = room.getPlayer(socket.id);
    const opponent = room.getOpponent(socket.id);
    
    // Calculate rating change (opponent wins by default when player loses)
    if (opponent) {
      const ratingChange = room.calculateRatingChange(opponent.id);
      if (ratingChange) {
        // Notify both players about rating change
        io.to(roomId).emit('ratingUpdate', {
          winner: { id: opponent.id, rating: ratingChange.winner.rating, change: ratingChange.winner.change },
          loser: { id: socket.id, rating: ratingChange.loser.rating, change: ratingChange.loser.change }
        });
      }
    }
    
    // Reset player state but keep game running
    if (player) {
      player.board = null;
      player.score = 0;
      player.lines = 0;
      player.level = 1;
      player.currentPiece = null;
    }
    
    // Send restart signal only to the losing player
    socket.emit('playerRestart', { 
      seed: Date.now(),
      opponentScore: opponent?.score || 0
    });
    
    // Notify opponent that player restarted
    socket.to(roomId).emit('opponentRestarted');
    
    console.log(`Player restarted in room: ${roomId}`);
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

  // Leave room (intentional - free slot immediately)
  socket.on('leaveRoom', () => {
    handlePlayerLeave(socket, true);
  });

  // Get rooms list
  socket.on('getRooms', () => {
    socket.emit('roomsList', getRoomsList());
  });

  // Disconnect (e.g. refresh - grace period for rejoin)
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handlePlayerLeave(socket, false);
  });
});

function handlePlayerLeave(socket, intentionalLeave) {
  const roomId = playerRooms.get(socket.id);
  
  if (roomId) {
    const room = rooms.get(roomId);
    
    if (room) {
      if (intentionalLeave) {
        const shouldDelete = room.removePlayer(socket.id);
        if (shouldDelete) {
          rooms.delete(roomId);
        } else {
          room.status = 'waiting';
          if (room.host) room.host.ready = false;
          socket.to(roomId).emit('playerLeft', { room: room.toJSON() });
        }
      } else {
        const slot = room.markDisconnected(socket.id);
        if (slot) {
          if (disconnectTimers.has(roomId)) clearTimeout(disconnectTimers.get(roomId));
          const timer = setTimeout(() => {
            disconnectTimers.delete(roomId);
            const shouldDelete = room.removeDisconnectedIfExpired(RECONNECT_GRACE_MS);
            if (shouldDelete) {
              rooms.delete(roomId);
            } else {
              room.status = 'waiting';
              if (room.host) room.host.ready = false;
              if (room.guest) room.guest.ready = false;
              io.to(roomId).emit('playerLeft', { room: room.toJSON() });
            }
            io.emit('roomsList', getRoomsList());
          }, RECONNECT_GRACE_MS);
          disconnectTimers.set(roomId, timer);
          socket.to(roomId).emit('playerLeft', { room: room.toJSON() });
        }
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
