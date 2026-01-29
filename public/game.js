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
const opponentBoardCanvas = document.getElementById('opponent-board');
const playerNext = document.getElementById('player-next');
const opponentNext = document.getElementById('opponent-next');
const playerCtx = playerBoard.getContext('2d');
const opponentCtx = opponentBoardCanvas.getContext('2d');
const playerNextCtx = playerNext.getContext('2d');
const opponentNextCtx = opponentNext.getContext('2d');

const connectionStatus = document.getElementById('connection-status');
const statusDot = connectionStatus.querySelector('.status-dot');
const statusText = connectionStatus.querySelector('.status-text');

// Game Constants - увеличенные размеры
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // Увеличено с 20 до 30
const NEXT_BLOCK_SIZE = 24; // Увеличено с 16 до 24

const COLORS = {
    I: '#00f5ff',
    O: '#ffeb3b',
    T: '#9c27b0',
    S: '#4caf50',
    Z: '#f44336',
    J: '#2196f3',
    L: '#ff9800',
    GHOST: 'rgba(255, 255, 255, 0.15)',
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

// Sound System using Web Audio API
class SoundManager {
    constructor() {
        this.audioContext = null;
        this.soundsEnabled = true;
        this.init();
    }

    init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
            this.soundsEnabled = false;
        }
    }

    playTone(frequency, duration, type = 'sine', volume = 0.3) {
        if (!this.soundsEnabled || !this.audioContext) return;
        
        try {
            // Resume audio context if suspended (required by browsers)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {
                    this.soundsEnabled = false;
                    return;
                });
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.value = frequency;
            oscillator.type = type;
            
            gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);
        } catch (e) {
            // Disable sounds if there's an error
            this.soundsEnabled = false;
        }
    }

    playMove() {
        this.playTone(200, 0.05, 'square', 0.2);
    }

    playRotate() {
        this.playTone(300, 0.08, 'sine', 0.25);
    }

    playDrop() {
        this.playTone(150, 0.1, 'sawtooth', 0.3);
    }

    playHardDrop() {
        this.playTone(100, 0.15, 'sawtooth', 0.4);
    }

    playLineClear(count) {
        const frequencies = [400, 500, 600, 700];
        const freq = frequencies[Math.min(count - 1, 3)] || 400;
        this.playTone(freq, 0.2, 'sine', 0.4);
    }

    playGameOver() {
        // Sad descending tone
        const notes = [400, 350, 300, 250];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(freq, 0.3, 'sine', 0.5);
            }, i * 150);
        });
    }

    playLevelUp() {
        // Ascending tone
        const notes = [300, 400, 500, 600];
        notes.forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(freq, 0.15, 'sine', 0.3);
            }, i * 100);
        });
    }

    playGarbage() {
        this.playTone(250, 0.2, 'sawtooth', 0.35);
    }

    playButton() {
        this.playTone(350, 0.1, 'sine', 0.2);
    }
}

const soundManager = new SoundManager();

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
let dropSpeed = 700; // Ускорено с 1000 до 700
let lastDrop = 0;
let garbageQueue = 0;
let lastUpdateTime = 0;
let lastSentX = -1;
let lastSentY = -1;
let updateThrottle = 150; // Увеличено с 50 до 150мс для снижения нагрузки

// Opponent state
let opponentBoard = [];
let opponentCurrentPiece = null;
let opponentCurrentX = 0;
let opponentCurrentY = 0;
let opponentCurrentType = '';
let opponentNextPiece = null;
let opponentNextType = '';

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
    console.log('Socket connected');
});

socket.on('disconnect', () => {
    statusDot.classList.remove('connected');
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Disconnected';
    console.log('Socket disconnected');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    statusDot.classList.remove('connected');
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Connection Error';
});

// Menu Events
createRoomBtn.addEventListener('click', () => {
    try {
        soundManager.playButton();
    } catch (e) {
        // Ignore sound errors
    }
    playerName = playerNameInput.value.trim() || 'Player';
    socket.emit('createRoom', playerName);
});

joinRoomBtn.addEventListener('click', () => {
    try {
        soundManager.playButton();
    } catch (e) {
        // Ignore sound errors
    }
    joinForm.classList.toggle('hidden');
});

confirmJoinBtn.addEventListener('click', () => {
    const roomId = roomCodeInput.value.trim().toUpperCase();
    if (roomId) {
        try {
            soundManager.playButton();
        } catch (e) {
            // Ignore sound errors
        }
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
    try {
        soundManager.playButton();
    } catch (e) {
        // Ignore sound errors
    }
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
    try {
        soundManager.playButton();
    } catch (e) {
        // Ignore sound errors
    }
    isReady = !isReady;
    socket.emit('playerReady');
    readyBtn.textContent = isReady ? 'Waiting...' : 'Ready';
});

leaveRoomBtn.addEventListener('click', () => {
    try {
        soundManager.playButton();
    } catch (e) {
        // Ignore sound errors
    }
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
    opponentBoard = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropSpeed = 700; // Ускорено
    garbageQueue = 0;
    gameRunning = true;
    lastUpdateTime = Date.now();
    lastSentX = -1;
    lastSentY = -1;
    
    // Reset opponent state
    opponentCurrentPiece = null;
    opponentNextPiece = null;
    
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
    
    // Start game loop with smoother animation
    lastDrop = Date.now();
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = requestAnimationFrame(gameLoop);
    
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
            soundManager.playRotate();
            return true;
        }
    }
    return false;
}

function movePiece(dx, dy) {
    if (!checkCollision(currentX + dx, currentY + dy, currentPiece)) {
        currentX += dx;
        currentY += dy;
        if (dx !== 0) soundManager.playMove();
        return true;
    }
    return false;
}

function hardDrop() {
    soundManager.playHardDrop();
    while (movePiece(0, 1)) {
        score += 2;
    }
    lockPiece();
}

function lockPiece() {
    soundManager.playDrop();
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
    
    const clearedCount = clearLines();
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
        soundManager.playLineClear(clearedLines);
        lines += clearedLines;
        
        // Score calculation
        const lineScores = [0, 100, 300, 500, 800];
        score += lineScores[clearedLines] * level;
        
        // Level up
        const newLevel = Math.floor(lines / 10) + 1;
        if (newLevel > level) {
            soundManager.playLevelUp();
        }
        level = newLevel;
        dropSpeed = Math.max(50, 700 - (level - 1) * 60); // Ускорено
        
        // Update UI
        document.getElementById('player-score').textContent = score;
        document.getElementById('player-lines').textContent = lines;
        document.getElementById('player-level').textContent = level;
        
        // Send garbage to opponent (if cleared 2+ lines)
        if (clearedLines >= 2) {
            socket.emit('sendGarbage', clearedLines - 1);
        }
    }
    
    return clearedLines;
}

function addGarbage() {
    if (garbageQueue > 0) {
        soundManager.playGarbage();
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

// Smooth game loop using requestAnimationFrame
function gameLoop(timestamp) {
    if (!gameRunning) return;
    
    const now = Date.now();
    const deltaTime = now - lastDrop;
    
    if (deltaTime >= dropSpeed) {
        if (!movePiece(0, 1)) {
            lockPiece();
        }
        lastDrop = now;
    }
    
    // Send updates only when piece position changed or periodically
    const pieceMoved = (currentX !== lastSentX || currentY !== lastSentY);
    const timeToUpdate = (now - lastUpdateTime >= updateThrottle);
    
    if (pieceMoved || timeToUpdate) {
        sendGameUpdate();
        lastSentX = currentX;
        lastSentY = currentY;
        lastUpdateTime = now;
    }
    
    draw();
    gameInterval = requestAnimationFrame(gameLoop);
}

function draw() {
    // Draw player board
    drawPlayerBoard();
    
    // Draw opponent board
    drawOpponentBoard();
}

function drawPlayerBoard() {
    // Clear canvas
    playerCtx.fillStyle = '#0a0a1a';
    playerCtx.fillRect(0, 0, playerBoard.width, playerBoard.height);
    
    // Draw board with gradient effect
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
    
    // Draw current piece with smooth animation
    for (let row = 0; row < currentPiece.length; row++) {
        for (let col = 0; col < currentPiece[row].length; col++) {
            if (currentPiece[row][col]) {
                drawBlock(playerCtx, currentX + col, currentY + row, COLORS[currentType]);
            }
        }
    }
    
    // Draw grid
    drawGrid(playerCtx);
}

function drawOpponentBoard() {
    // Clear canvas
    opponentCtx.fillStyle = '#0a0a1a';
    opponentCtx.fillRect(0, 0, opponentBoardCanvas.width, opponentBoardCanvas.height);
    
    // Draw opponent board
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            if (opponentBoard[row] && opponentBoard[row][col]) {
                drawBlock(opponentCtx, col, row, COLORS[opponentBoard[row][col]] || COLORS.GARBAGE);
            }
        }
    }
    
    // Draw opponent ghost piece
    if (opponentCurrentPiece) {
        let opponentGhostY = opponentCurrentY;
        while (!checkOpponentCollision(opponentCurrentX, opponentGhostY + 1, opponentCurrentPiece)) {
            opponentGhostY++;
        }
        
        for (let row = 0; row < opponentCurrentPiece.length; row++) {
            for (let col = 0; col < opponentCurrentPiece[row].length; col++) {
                if (opponentCurrentPiece[row][col]) {
                    drawBlock(opponentCtx, opponentCurrentX + col, opponentGhostY + row, COLORS.GHOST);
                }
            }
        }
        
        // Draw opponent current piece
        for (let row = 0; row < opponentCurrentPiece.length; row++) {
            for (let col = 0; col < opponentCurrentPiece[row].length; col++) {
                if (opponentCurrentPiece[row][col]) {
                    drawBlock(opponentCtx, opponentCurrentX + col, opponentCurrentY + row, COLORS[opponentCurrentType] || '#888');
                }
            }
        }
    }
    
    // Draw grid
    drawGrid(opponentCtx);
}

function checkOpponentCollision(x, y, piece) {
    for (let row = 0; row < piece.length; row++) {
        for (let col = 0; col < piece[row].length; col++) {
            if (piece[row][col]) {
                const newX = x + col;
                const newY = y + row;
                
                if (newX < 0 || newX >= COLS || newY >= ROWS) {
                    return true;
                }
                
                if (newY >= 0 && opponentBoard[newY] && opponentBoard[newY][newX]) {
                    return true;
                }
            }
        }
    }
    return false;
}

function drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let row = 0; row <= ROWS; row++) {
        ctx.beginPath();
        ctx.moveTo(0, row * BLOCK_SIZE);
        ctx.lineTo(COLS * BLOCK_SIZE, row * BLOCK_SIZE);
        ctx.stroke();
    }
    for (let col = 0; col <= COLS; col++) {
        ctx.beginPath();
        ctx.moveTo(col * BLOCK_SIZE, 0);
        ctx.lineTo(col * BLOCK_SIZE, ROWS * BLOCK_SIZE);
        ctx.stroke();
    }
}

function drawBlock(ctx, x, y, color) {
    const pixelX = x * BLOCK_SIZE;
    const pixelY = y * BLOCK_SIZE;
    
    // Main block
    ctx.fillStyle = color;
    ctx.fillRect(pixelX + 1, pixelY + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
    
    // Gradient effect
    const gradient = ctx.createLinearGradient(pixelX, pixelY, pixelX + BLOCK_SIZE, pixelY + BLOCK_SIZE);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = gradient;
    ctx.fillRect(pixelX + 1, pixelY + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
    
    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(pixelX + 2, pixelY + 2, BLOCK_SIZE - 6, 4);
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(pixelX + 2, pixelY + BLOCK_SIZE - 6, BLOCK_SIZE - 6, 4);
    
    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pixelX + 1, pixelY + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
}

function drawNextPiece() {
    playerNextCtx.fillStyle = '#0a0a1a';
    playerNextCtx.fillRect(0, 0, playerNext.width, playerNext.height);
    
    const offsetX = (5 - nextPiece[0].length) / 2;
    const offsetY = (5 - nextPiece.length) / 2;
    
    for (let row = 0; row < nextPiece.length; row++) {
        for (let col = 0; col < nextPiece[row].length; col++) {
            if (nextPiece[row][col]) {
                const x = (offsetX + col) * NEXT_BLOCK_SIZE + 4;
                const y = (offsetY + row) * NEXT_BLOCK_SIZE + 4;
                drawNextBlock(playerNextCtx, x, y, COLORS[nextType]);
            }
        }
    }
}

function drawNextBlock(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, NEXT_BLOCK_SIZE - 2, NEXT_BLOCK_SIZE - 2);
    
    // Highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(x + 1, y + 1, NEXT_BLOCK_SIZE - 4, 2);
    
    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x + 1, y + NEXT_BLOCK_SIZE - 3, NEXT_BLOCK_SIZE - 4, 2);
}

function sendGameUpdate() {
    // Отправляем обновления только если игра запущена и есть соединение
    if (!gameRunning || !socket.connected) return;
    
    try {
        socket.emit('gameUpdate', {
            board: board,
            score: score,
            lines: lines,
            level: level,
            nextPiece: { type: nextType, piece: nextPiece },
            currentPiece: currentPiece,
            currentX: currentX,
            currentY: currentY,
            currentType: currentType
        });
    } catch (e) {
        console.error('Error sending game update:', e);
    }
}

function gameOver() {
    gameRunning = false;
    if (gameInterval) {
        cancelAnimationFrame(gameInterval);
        gameInterval = null;
    }
    soundManager.playGameOver();
    socket.emit('gameOver');
}

// Opponent Updates
socket.on('opponentUpdate', (data) => {
    if (!gameRunning) return;
    
    try {
        // Update UI
        if (data.score !== undefined) {
            document.getElementById('opponent-score').textContent = data.score;
        }
        if (data.lines !== undefined) {
            document.getElementById('opponent-lines').textContent = data.lines;
        }
        if (data.level !== undefined) {
            document.getElementById('opponent-level').textContent = data.level;
        }
        
        // Update opponent board (only if provided)
        if (data.board && Array.isArray(data.board)) {
            opponentBoard = data.board;
        }
        
        // Update opponent current piece
        if (data.currentPiece && Array.isArray(data.currentPiece)) {
            opponentCurrentPiece = data.currentPiece;
            opponentCurrentX = data.currentX || 0;
            opponentCurrentY = data.currentY || 0;
            opponentCurrentType = data.currentType || '';
        }
        
        // Draw opponent next piece
        if (data.nextPiece && data.nextPiece.piece) {
            opponentNextPiece = data.nextPiece.piece;
            opponentNextType = data.nextPiece.type;
            drawOpponentNextPiece(data.nextPiece);
        }
    } catch (e) {
        console.error('Error processing opponent update:', e);
    }
});

function drawOpponentNextPiece(nextPieceData) {
    opponentNextCtx.fillStyle = '#0a0a1a';
    opponentNextCtx.fillRect(0, 0, opponentNext.width, opponentNext.height);
    
    const piece = nextPieceData.piece;
    const type = nextPieceData.type;
    
    if (!piece) return;
    
    const offsetX = (5 - piece[0].length) / 2;
    const offsetY = (5 - piece.length) / 2;
    
    for (let row = 0; row < piece.length; row++) {
        for (let col = 0; col < piece[row].length; col++) {
            if (piece[row][col]) {
                const x = (offsetX + col) * NEXT_BLOCK_SIZE + 4;
                const y = (offsetY + row) * NEXT_BLOCK_SIZE + 4;
                drawNextBlock(opponentNextCtx, x, y, COLORS[type]);
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
        cancelAnimationFrame(gameInterval);
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
    try {
        soundManager.playButton();
    } catch (e) {
        // Ignore sound errors
    }
    socket.emit('requestRestart');
});

document.getElementById('back-to-menu-btn').addEventListener('click', () => {
    try {
        soundManager.playButton();
    } catch (e) {
        // Ignore sound errors
    }
    socket.emit('leaveRoom');
    gameOverModal.classList.add('hidden');
    currentRoom = null;
    isReady = false;
    showScreen(menuScreen);
});

// Keyboard Controls with smooth movement
let keyStates = {};
let lastKeyPress = {};

document.addEventListener('keydown', (e) => {
    if (!gameRunning) return;
    
    const now = Date.now();
    const key = e.code;
    
    // Prevent default for game keys
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(key)) {
        e.preventDefault();
    }
    
    // Handle key repeat with delay
    if (keyStates[key] && now - lastKeyPress[key] < 100) {
        return;
    }
    
    keyStates[key] = true;
    lastKeyPress[key] = now;
    
    switch(key) {
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
            if (movePiece(0, 1)) {
                score += 1;
                lastDrop = Date.now();
            }
            break;
        case 'Space':
            hardDrop();
            break;
    }
    
    draw();
});

document.addEventListener('keyup', (e) => {
    keyStates[e.code] = false;
});

// Initial rooms request
socket.emit('getRooms');
