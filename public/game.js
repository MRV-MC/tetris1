// Socket.io connection
const socket = io();

// DOM Elements
const menuScreen = document.getElementById('menu-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const gameOverModal = document.getElementById('game-over-modal');

const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const confirmJoinBtn = document.getElementById('confirm-join-btn');
const joinForm = document.getElementById('join-form');
const roomsList = document.getElementById('rooms-list');

const roomIdSpan = document.getElementById('room-id');
const hostNameSpan = document.getElementById('host-name');
const guestNameSpan = document.getElementById('guest-name');
const hostStatus = document.getElementById('host-status');
const guestStatus = document.getElementById('guest-status');
const readyBtn = document.getElementById('ready-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

const playerBoard = document.getElementById('player-board');
const opponentBoard = document.getElementById('opponent-board');
const playerNext = document.getElementById('player-next');
const opponentNext = document.getElementById('opponent-next');
const playerCtx = playerBoard.getContext('2d');
const opponentCtx = opponentBoard.getContext('2d');
const playerNextCtx = playerNext.getContext('2d');
const opponentNextCtx = opponentNext.getContext('2d');

const connectionStatus = document.getElementById('connection-status');
const statusDot = connectionStatus.querySelector('.status-dot');
const statusText = connectionStatus.querySelector('.status-text');

// Game Constants
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 20;
const NEXT_BLOCK_SIZE = 16;

const COLORS = {
    I: '#00f5ff',
    O: '#ffeb3b',
    T: '#9c27b0',
    S: '#4caf50',
    Z: '#f44336',
    J: '#2196f3',
    L: '#ff9800',
    GHOST: 'rgba(255, 255, 255, 0.2)',
    GARBAGE: '#666666'
};

const PIECES = {
    I: [[0,0,0,0], [1,1,1,1], [0,0,0,0], [0,0,0,0]],
    O: [[1,1], [1,1]],
    T: [[0,1,0], [1,1,1], [0,0,0]],
    S: [[0,1,1], [1,1,0], [0,0,0]],
    Z: [[1,1,0], [0,1,1], [0,0,0]],
    J: [[1,0,0], [1,1,1], [0,0,0]],
    L: [[0,0,1], [1,1,1], [0,0,0]]
};

// Game State
let currentRoom = null;
let playerName = '';
let isReady = false;
let gameRunning = false;
let gameInterval = null;
let gameSeed = null;
let pieceIndex = 0;

// Player game state
let board = [];
let currentPiece = null;
let currentX = 0;
let currentY = 0;
let currentType = '';
let nextPiece = null;
let nextType = '';
let score = 0;
let lines = 0;
let level = 1;
let dropSpeed = 1000;
let lastDrop = 0;
let garbageQueue = 0;

// Random generator with seed
class SeededRandom {
    constructor(seed) {
        this.seed = seed;
    }
    
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
}

let rng = null;

// Screen Management
function showScreen(screen) {
    [menuScreen, lobbyScreen, gameScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

// Connection Status
socket.on('connect', () => {
    statusDot.classList.remove('disconnected');
    statusDot.classList.add('connected');
    statusText.textContent = 'Connected';
    socket.emit('getRooms');
});

socket.on('disconnect', () => {
    statusDot.classList.remove('connected');
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
});

// Menu Events
createRoomBtn.addEventListener('click', () => {
    playerName = playerNameInput.value.trim() || 'Player';
    socket.emit('createRoom', playerName);
});

joinRoomBtn.addEventListener('click', () => {
    joinForm.classList.toggle('hidden');
});

confirmJoinBtn.addEventListener('click', () => {
    const roomId = roomCodeInput.value.trim().toUpperCase();
    if (roomId) {
        playerName = playerNameInput.value.trim() || 'Player';
        socket.emit('joinRoom', { roomId, playerName });
    }
});

// Rooms List
socket.on('roomsList', (rooms) => {
    if (rooms.length === 0) {
        roomsList.innerHTML = '<p class="no-rooms">No rooms available</p>';
    } else {
        roomsList.innerHTML = rooms.map(room => `
            <div class="room-item">
                <div class="room-info">
                    <div class="room-code">${room.id}</div>
                    <div class="host-name">Host: ${room.host.name}</div>
                </div>
                <button class="btn btn-accent" onclick="quickJoin('${room.id}')">Join</button>
            </div>
        `).join('');
    }
});

window.quickJoin = function(roomId) {
    playerName = playerNameInput.value.trim() || 'Player';
    socket.emit('joinRoom', { roomId, playerName });
};

// Room Events
socket.on('roomCreated', ({ roomId, room }) => {
    currentRoom = roomId;
    updateLobby(room);
    showScreen(lobbyScreen);
});

socket.on('roomJoined', ({ roomId, room }) => {
    currentRoom = roomId;
    updateLobby(room);
    showScreen(lobbyScreen);
});

socket.on('playerJoined', ({ room }) => {
    updateLobby(room);
});

socket.on('roomUpdate', ({ room }) => {
    updateLobby(room);
});

socket.on('playerLeft', ({ room }) => {
    updateLobby(room);
    isReady = false;
    readyBtn.textContent = 'Ready';
    readyBtn.classList.remove('btn-success');
});

socket.on('error', ({ message }) => {
    alert(message);
});

function updateLobby(room) {
    roomIdSpan.textContent = room.id;
    
    if (room.host) {
        hostNameSpan.textContent = room.host.name;
        hostStatus.textContent = room.host.ready ? 'Ready' : 'Not Ready';
        hostStatus.className = 'status ' + (room.host.ready ? 'ready' : 'not-ready');
    }
    
    if (room.guest) {
        guestNameSpan.textContent = room.guest.name;
        guestStatus.textContent = room.guest.ready ? 'Ready' : 'Not Ready';
        guestStatus.className = 'status ' + (room.guest.ready ? 'ready' : 'not-ready');
    } else {
        guestNameSpan.textContent = 'Waiting...';
        guestStatus.textContent = '-';
        guestStatus.className = 'status';
    }
}

// Lobby Events
readyBtn.addEventListener('click', () => {
    isReady = !isReady;
    socket.emit('playerReady');
    readyBtn.textContent = isReady ? 'Waiting...' : 'Ready';
});

leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom');
    currentRoom = null;
    isReady = false;
    readyBtn.textContent = 'Ready';
    showScreen(menuScreen);
});

// Game Start
socket.on('gameStart', ({ seed }) => {
    gameSeed = seed;
    rng = new SeededRandom(seed);
    pieceIndex = 0;
    startGame();
    showScreen(gameScreen);
});

function startGame() {
    // Reset game state
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropSpeed = 1000;
    garbageQueue = 0;
    gameRunning = true;
    
    // Update UI
    document.getElementById('player-score').textContent = '0';
    document.getElementById('player-lines').textContent = '0';
    document.getElementById('player-level').textContent = '1';
    document.getElementById('player-game-name').textContent = playerName;
    document.getElementById('opponent-score').textContent = '0';
    document.getElementById('opponent-lines').textContent = '0';
    document.getElementById('opponent-level').textContent = '1';
    
    // Spawn first pieces
    spawnPiece();
    spawnNextPiece();
    
    // Start game loop
    lastDrop = Date.now();
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, 16);
    
    // Draw initial state
    draw();
}

function createBoard() {
    return Array(ROWS).fill(null).map(() => Array(COLS).fill(0));
}

function getRandomPieceType() {
    const types = Object.keys(PIECES);
    const index = Math.floor(rng.next() * types.length);
    return types[index];
}

function spawnPiece() {
    if (nextPiece) {
        currentPiece = nextPiece;
        currentType = nextType;
    } else {
        currentType = getRandomPieceType();
        currentPiece = PIECES[currentType].map(row => [...row]);
    }
    
    currentX = Math.floor((COLS - currentPiece[0].length) / 2);
    currentY = 0;
    
    spawnNextPiece();
    
    if (checkCollision(currentX, currentY, currentPiece)) {
        gameOver();
    }
}

function spawnNextPiece() {
    nextType = getRandomPieceType();
    nextPiece = PIECES[nextType].map(row => [...row]);
    drawNextPiece();
}

function checkCollision(x, y, piece) {
    for (let row = 0; row < piece.length; row++) {
        for (let col = 0; col < piece[row].length; col++) {
            if (piece[row][col]) {
                const newX = x + col;
                const newY = y + row;
                
                if (newX < 0 || newX >= COLS || newY >= ROWS) {
                    return true;
                }
                
                if (newY >= 0 && board[newY][newX]) {
                    return true;
                }
            }
        }
    }
    return false;
}

function rotatePiece() {
    const rotated = currentPiece[0].map((_, i) =>
        currentPiece.map(row => row[i]).reverse()
    );
    
    // Wall kick
    const kicks = [0, 1, -1, 2, -2];
    for (const kick of kicks) {
        if (!checkCollision(currentX + kick, currentY, rotated)) {
            currentPiece = rotated;
            currentX += kick;
            return true;
        }
    }
    return false;
}

function movePiece(dx, dy) {
    if (!checkCollision(currentX + dx, currentY + dy, currentPiece)) {
        currentX += dx;
        currentY += dy;
        return true;
    }
    return false;
}

function hardDrop() {
    while (movePiece(0, 1)) {
        score += 2;
    }
    lockPiece();
}

function lockPiece() {
    for (let row = 0; row < currentPiece.length; row++) {
        for (let col = 0; col < currentPiece[row].length; col++) {
            if (currentPiece[row][col]) {
                const boardY = currentY + row;
                if (boardY >= 0) {
                    board[boardY][currentX + col] = currentType;
                }
            }
        }
    }
    
    clearLines();
    addGarbage();
    spawnPiece();
    sendGameUpdate();
}

function clearLines() {
    let clearedLines = 0;
    
    for (let row = ROWS - 1; row >= 0; row--) {
        if (board[row].every(cell => cell !== 0)) {
            board.splice(row, 1);
            board.unshift(Array(COLS).fill(0));
            clearedLines++;
            row++; // Check same row again
        }
    }
    
    if (clearedLines > 0) {
        lines += clearedLines;
        
        // Score calculation
        const lineScores = [0, 100, 300, 500, 800];
        score += lineScores[clearedLines] * level;
        
        // Level up
        level = Math.floor(lines / 10) + 1;
        dropSpeed = Math.max(100, 1000 - (level - 1) * 80);
        
        // Update UI
        document.getElementById('player-score').textContent = score;
        document.getElementById('player-lines').textContent = lines;
        document.getElementById('player-level').textContent = level;
        
        // Send garbage to opponent (if cleared 2+ lines)
        if (clearedLines >= 2) {
            socket.emit('sendGarbage', clearedLines - 1);
        }
    }
}

function addGarbage() {
    if (garbageQueue > 0) {
        const garbageLines = Math.min(garbageQueue, ROWS - 4);
        garbageQueue = 0;
        
        // Remove top lines
        board.splice(0, garbageLines);
        
        // Add garbage at bottom
        for (let i = 0; i < garbageLines; i++) {
            const hole = Math.floor(Math.random() * COLS);
            const garbageLine = Array(COLS).fill('GARBAGE');
            garbageLine[hole] = 0;
            board.push(garbageLine);
        }
    }
}

function getGhostY() {
    let ghostY = currentY;
    while (!checkCollision(currentX, ghostY + 1, currentPiece)) {
        ghostY++;
    }
    return ghostY;
}

function gameLoop() {
    if (!gameRunning) return;
    
    const now = Date.now();
    if (now - lastDrop >= dropSpeed) {
        if (!movePiece(0, 1)) {
            lockPiece();
        }
        lastDrop = now;
    }
    
    draw();
}

function draw() {
    // Clear canvas
    playerCtx.fillStyle = '#0a0a1a';
    playerCtx.fillRect(0, 0, playerBoard.width, playerBoard.height);
    
    // Draw board
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (board[row][col]) {
                drawBlock(playerCtx, col, row, COLORS[board[row][col]] || COLORS.GARBAGE);
            }
        }
    }
    
    // Draw ghost piece
    const ghostY = getGhostY();
    for (let row = 0; row < currentPiece.length; row++) {
        for (let col = 0; col < currentPiece[row].length; col++) {
            if (currentPiece[row][col]) {
                drawBlock(playerCtx, currentX + col, ghostY + row, COLORS.GHOST);
            }
        }
    }
    
    // Draw current piece
    for (let row = 0; row < currentPiece.length; row++) {
        for (let col = 0; col < currentPiece[row].length; col++) {
            if (currentPiece[row][col]) {
                drawBlock(playerCtx, currentX + col, currentY + row, COLORS[currentType]);
            }
        }
    }
    
    // Draw grid
    playerCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (let row = 0; row <= ROWS; row++) {
        playerCtx.beginPath();
        playerCtx.moveTo(0, row * BLOCK_SIZE);
        playerCtx.lineTo(COLS * BLOCK_SIZE, row * BLOCK_SIZE);
        playerCtx.stroke();
    }
    for (let col = 0; col <= COLS; col++) {
        playerCtx.beginPath();
        playerCtx.moveTo(col * BLOCK_SIZE, 0);
        playerCtx.lineTo(col * BLOCK_SIZE, ROWS * BLOCK_SIZE);
        playerCtx.stroke();
    }
}

function drawBlock(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * BLOCK_SIZE + 1, y * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
    
    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x * BLOCK_SIZE + 2, y * BLOCK_SIZE + 2, BLOCK_SIZE - 6, 3);
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x * BLOCK_SIZE + 2, y * BLOCK_SIZE + BLOCK_SIZE - 5, BLOCK_SIZE - 6, 3);
}

function drawNextPiece() {
    playerNextCtx.fillStyle = '#0a0a1a';
    playerNextCtx.fillRect(0, 0, playerNext.width, playerNext.height);
    
    const offsetX = (4 - nextPiece[0].length) / 2;
    const offsetY = (4 - nextPiece.length) / 2;
    
    for (let row = 0; row < nextPiece.length; row++) {
        for (let col = 0; col < nextPiece[row].length; col++) {
            if (nextPiece[row][col]) {
                playerNextCtx.fillStyle = COLORS[nextType];
                const x = (offsetX + col) * NEXT_BLOCK_SIZE + 4;
                const y = (offsetY + row) * NEXT_BLOCK_SIZE + 4;
                playerNextCtx.fillRect(x, y, NEXT_BLOCK_SIZE - 2, NEXT_BLOCK_SIZE - 2);
            }
        }
    }
}

function sendGameUpdate() {
    socket.emit('gameUpdate', {
        board: board,
        score: score,
        lines: lines,
        level: level,
        nextPiece: { type: nextType, piece: nextPiece }
    });
}

function gameOver() {
    gameRunning = false;
    if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null;
    }
    socket.emit('gameOver');
}

// Opponent Updates
socket.on('opponentUpdate', (data) => {
    document.getElementById('opponent-score').textContent = data.score;
    document.getElementById('opponent-lines').textContent = data.lines;
    document.getElementById('opponent-level').textContent = data.level;
    
    // Draw opponent board
    drawOpponentBoard(data.board);
    
    // Draw opponent next piece
    if (data.nextPiece) {
        drawOpponentNextPiece(data.nextPiece);
    }
});

function drawOpponentBoard(opBoard) {
    opponentCtx.fillStyle = '#0a0a1a';
    opponentCtx.fillRect(0, 0, opponentBoard.width, opponentBoard.height);
    
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (opBoard[row] && opBoard[row][col]) {
                const color = COLORS[opBoard[row][col]] || COLORS.GARBAGE;
                opponentCtx.fillStyle = color;
                opponentCtx.fillRect(col * BLOCK_SIZE + 1, row * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            }
        }
    }
}

function drawOpponentNextPiece(nextPieceData) {
    opponentNextCtx.fillStyle = '#0a0a1a';
    opponentNextCtx.fillRect(0, 0, opponentNext.width, opponentNext.height);
    
    const piece = nextPieceData.piece;
    const type = nextPieceData.type;
    
    if (!piece) return;
    
    const offsetX = (4 - piece[0].length) / 2;
    const offsetY = (4 - piece.length) / 2;
    
    for (let row = 0; row < piece.length; row++) {
        for (let col = 0; col < piece[row].length; col++) {
            if (piece[row][col]) {
                opponentNextCtx.fillStyle = COLORS[type];
                const x = (offsetX + col) * NEXT_BLOCK_SIZE + 4;
                const y = (offsetY + row) * NEXT_BLOCK_SIZE + 4;
                opponentNextCtx.fillRect(x, y, NEXT_BLOCK_SIZE - 2, NEXT_BLOCK_SIZE - 2);
            }
        }
    }
}

// Receive Garbage
socket.on('receiveGarbage', (lineCount) => {
    garbageQueue += lineCount;
});

// Game End
socket.on('gameEnded', ({ winner, loser, hostScore, guestScore }) => {
    gameRunning = false;
    if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null;
    }
    
    document.getElementById('game-result').textContent = winner === playerName ? 'You Win!' : 'Game Over';
    document.getElementById('winner-name').textContent = winner || 'Winner';
    document.getElementById('loser-name').textContent = loser || 'Loser';
    document.getElementById('winner-score').textContent = Math.max(hostScore, guestScore);
    document.getElementById('loser-score').textContent = Math.min(hostScore, guestScore);
    
    gameOverModal.classList.remove('hidden');
});

// Game Restart
socket.on('gameRestart', ({ room }) => {
    gameOverModal.classList.add('hidden');
    isReady = false;
    readyBtn.textContent = 'Ready';
    updateLobby(room);
    showScreen(lobbyScreen);
});

document.getElementById('play-again-btn').addEventListener('click', () => {
    socket.emit('requestRestart');
});

document.getElementById('back-to-menu-btn').addEventListener('click', () => {
    socket.emit('leaveRoom');
    gameOverModal.classList.add('hidden');
    currentRoom = null;
    isReady = false;
    showScreen(menuScreen);
});

// Keyboard Controls
document.addEventListener('keydown', (e) => {
    if (!gameRunning) return;
    
    switch(e.code) {
        case 'ArrowLeft':
            movePiece(-1, 0);
            break;
        case 'ArrowRight':
            movePiece(1, 0);
            break;
        case 'ArrowUp':
            rotatePiece();
            break;
        case 'ArrowDown':
            if (movePiece(0, 1)) score += 1;
            lastDrop = Date.now();
            break;
        case 'Space':
            e.preventDefault();
            hardDrop();
            break;
    }
    
    draw();
});

// Initial rooms request
socket.emit('getRooms');
