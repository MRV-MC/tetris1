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
const playerHold = document.getElementById('player-hold');
const opponentNext = document.getElementById('opponent-next');
const playerCtx = playerBoard.getContext('2d');
const opponentCtx = opponentBoardCanvas.getContext('2d');
const playerNextCtx = playerNext.getContext('2d');
const playerHoldCtx = playerHold.getContext('2d');
const opponentNextCtx = opponentNext.getContext('2d');

const connectionStatus = document.getElementById('connection-status');
const statusDot = connectionStatus.querySelector('.status-dot');
const statusText = connectionStatus.querySelector('.status-text');

const statsModal = document.getElementById('stats-modal');
const statsBtn = document.getElementById('stats-btn');
const closeStatsBtn = document.getElementById('close-stats-btn');

const settingsScreen = document.getElementById('settings-screen');
const settingsBtn = document.getElementById('settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const cancelSettingsBtn = document.getElementById('cancel-settings-btn');

const achievementsScreen = document.getElementById('achievements-screen');
const achievementsBtn = document.getElementById('achievements-btn');
const closeAchievementsBtn = document.getElementById('close-achievements-btn');

// Settings
let gameSettings = {
    soundVolume: 100,
    blockSize: 'medium',
    theme: 'classic',
    showGhost: true,
    dasSpeed: 100
};

// Load settings from localStorage
function loadSettings() {
    const saved = localStorage.getItem('tetrisSettings');
    if (saved) {
        try {
            gameSettings = { ...gameSettings, ...JSON.parse(saved) };
            applySettings();
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
}

// Save settings to localStorage
function saveSettings() {
    try {
        localStorage.setItem('tetrisSettings', JSON.stringify(gameSettings));
        applySettings();
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

// Apply settings to game
function applySettings() {
    // Sound volume is handled per sound in playTone method
    // No need to check soundManager here as it's created before loadSettings is called
    
    // Apply block size (would require canvas resize, complex)
    // For now, we'll keep current size
    
    // Apply theme (would require CSS changes)
    document.body.className = `theme-${gameSettings.theme}`;
    
    // Apply ghost piece visibility
    // Handled in draw function
    
    // DAS speed is handled in keyboard controls
}

// Game Constants - увеличенные размеры
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const NEXT_BLOCK_SIZE = 24;

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
        
        // Apply volume setting
        const volumeMultiplier = (gameSettings?.soundVolume || 100) / 100;
        volume = volume * volumeMultiplier;
        
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

// Initialize settings after soundManager is created
loadSettings();

// Game State
let currentRoom = null;
let playerName = '';
let isReady = false;
let playerRating = 1000;
let opponentRating = 1000;
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
let holdPiece = null;
let holdType = '';
let canHold = true; // Can hold once per piece placement
let score = 0;
let lines = 0;
let level = 1;
let dropSpeed = 700; // Ускорено с 1000 до 700
let baseDropSpeed = 700;
let lastDrop = 0;
let garbageQueue = 0;
let lastUpdateTime = 0;
let lastSentX = -1;
let lastSentY = -1;
let updateThrottle = 150; // Увеличено с 50 до 150мс для снижения нагрузки
let lastSentBoard = null; // For delta compression
let speedBoostActive = false;
let speedBoostEndTime = 0;

// Statistics
let gameStartTime = 0;
let piecesPlaced = 0;
let totalAttacks = 0; // Lines sent to opponent
let maxCombo = 0;
let currentCombo = 0;
let lastLineClearTime = 0;
let stats = {
    totalGames: 0,
    totalWins: 0,
    totalLines: 0,
    totalScore: 0,
    bestScore: 0,
    bestLPS: 0,
    bestPPM: 0,
    bestAPM: 0,
    bestCombo: 0
};

// Load stats from localStorage
function loadStats() {
    const saved = localStorage.getItem('tetrisStats');
    if (saved) {
        try {
            stats = { ...stats, ...JSON.parse(saved) };
        } catch (e) {
            console.error('Error loading stats:', e);
        }
    }
}

// Save stats to localStorage
function saveStats() {
    try {
        localStorage.setItem('tetrisStats', JSON.stringify(stats));
    } catch (e) {
        console.error('Error saving stats:', e);
    }
}

loadStats();

// Achievement System
class AchievementSystem {
    constructor() {
        this.achievements = [
            { id: 'first_game', name: 'First Game', description: 'Play your first game', unlocked: false, check: () => stats.totalGames >= 1 },
            { id: 'lines_10', name: 'Line Master', description: 'Clear 10 lines', unlocked: false, check: () => stats.totalLines >= 10 },
            { id: 'lines_50', name: 'Line Expert', description: 'Clear 50 lines', unlocked: false, check: () => stats.totalLines >= 50 },
            { id: 'lines_100', name: 'Line Legend', description: 'Clear 100 lines', unlocked: false, check: () => stats.totalLines >= 100 },
            { id: 'score_1000', name: 'Scorer', description: 'Score 1000 points', unlocked: false, check: () => stats.bestScore >= 1000 },
            { id: 'score_5000', name: 'High Scorer', description: 'Score 5000 points', unlocked: false, check: () => stats.bestScore >= 5000 },
            { id: 'score_10000', name: 'Master Scorer', description: 'Score 10000 points', unlocked: false, check: () => stats.bestScore >= 10000 },
            { id: 'combo_5', name: 'Combo Starter', description: 'Get a 5 combo', unlocked: false, check: () => stats.bestCombo >= 5 },
            { id: 'combo_10', name: 'Combo Master', description: 'Get a 10 combo', unlocked: false, check: () => stats.bestCombo >= 10 },
            { id: 'speed_boost', name: 'Speed Demon', description: 'Use speed boost attack', unlocked: false, check: () => false }, // Will be set manually
            { id: 'piece_change', name: 'Shape Shifter', description: 'Use piece change attack', unlocked: false, check: () => false }, // Will be set manually
            { id: 'hold_master', name: 'Hold Master', description: 'Use hold 50 times', unlocked: false, check: () => false } // Will track separately
        ];
        this.loadAchievements();
    }
    
    loadAchievements() {
        const saved = localStorage.getItem('tetrisAchievements');
        if (saved) {
            try {
                const savedAchievements = JSON.parse(saved);
                this.achievements.forEach(ach => {
                    const saved = savedAchievements.find(s => s.id === ach.id);
                    if (saved) {
                        ach.unlocked = saved.unlocked;
                    }
                });
            } catch (e) {
                console.error('Error loading achievements:', e);
            }
        }
    }
    
    saveAchievements() {
        try {
            localStorage.setItem('tetrisAchievements', JSON.stringify(this.achievements));
        } catch (e) {
            console.error('Error saving achievements:', e);
        }
    }
    
    checkAchievements() {
        this.achievements.forEach(ach => {
            if (!ach.unlocked && ach.check()) {
                this.unlockAchievement(ach);
            }
        });
    }
    
    unlockAchievement(achievement) {
        achievement.unlocked = true;
        this.saveAchievements();
        notificationSystem.show(`Achievement Unlocked: ${achievement.name}!`, 'info', 3000);
        console.log('Achievement unlocked:', achievement.name);
    }
    
    unlockById(id) {
        const ach = this.achievements.find(a => a.id === id);
        if (ach && !ach.unlocked) {
            this.unlockAchievement(ach);
        }
    }
    
    getUnlockedCount() {
        return this.achievements.filter(a => a.unlocked).length;
    }
}

const achievementSystem = new AchievementSystem();

// Track hold usage
let holdUsageCount = 0;

// Opponent state
let opponentBoard = [];
let opponentCurrentPiece = null;
let opponentCurrentX = 0;
let opponentCurrentY = 0;
let opponentCurrentType = '';
let opponentNextPiece = null;
let opponentNextType = '';
let opponentBoardNeedsFullUpdate = false; // Flag to ignore delta updates until full board received

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

// Particle System
class ParticleSystem {
    constructor() {
        this.particles = [];
    }
    
    createParticles(x, y, color, count = 20) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + Math.random() * BLOCK_SIZE,
                y: y + Math.random() * BLOCK_SIZE,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8 - 2,
                life: 1.0,
                decay: 0.02 + Math.random() * 0.02,
                color: color,
                size: 3 + Math.random() * 3
            });
        }
    }
    
    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.3; // Gravity
            p.life -= p.decay;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    draw(ctx) {
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
    
    clear() {
        this.particles = [];
    }
}

const particleSystem = new ParticleSystem();

// Notification System
class NotificationSystem {
    constructor() {
        this.container = document.getElementById('notifications-container');
        this.notifications = [];
    }
    
    show(text, type = 'info', duration = 2000) {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = text;
        
        this.container.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, duration);
    }
    
    showCombo(count) {
        if (count >= 2) {
            this.show(`COMBO x${count}!`, 'combo', 1500);
        }
    }
    
    showSpeedBoost() {
        this.show('Speed Boost Activated!', 'warning', 2000);
    }
    
    showPieceChange() {
        this.show('Piece Changed!', 'warning', 2000);
    }
    
    showGarbage() {
        this.show('Garbage Incoming!', 'danger', 2000);
    }
}

const notificationSystem = new NotificationSystem();

// Screen Management
function showScreen(screen) {
    [menuScreen, lobbyScreen, gameScreen, settingsScreen, achievementsScreen].forEach(s => {
        if (s) s.classList.remove('active');
    });
    if (screen) screen.classList.add('active');
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

function getRankInfo(rating) {
    if (rating < 800) return { name: 'Bronze', color: '#cd7f32' };
    if (rating < 1200) return { name: 'Silver', color: '#c0c0c0' };
    if (rating < 1600) return { name: 'Gold', color: '#ffd700' };
    if (rating < 2000) return { name: 'Platinum', color: '#e5e4e2' };
    return { name: 'Diamond', color: '#b9f2ff' };
}

function updateLobby(room) {
    roomIdSpan.textContent = room.id;
    
    // Determine if current player is host or guest by name
    const isHost = room.host && room.host.name === playerName;
    
    if (room.host) {
        const hostDisplayName = room.host.name;
        if (room.host.rating !== undefined && room.host.rating !== null) {
            const rank = getRankInfo(room.host.rating);
            hostNameSpan.innerHTML = `${hostDisplayName} <span style="color: ${rank.color}; font-size: 0.8em;">[${rank.name} ${room.host.rating}]</span>`;
            if (isHost) {
                playerRating = room.host.rating;
            } else if (room.guest && room.guest.name !== playerName) {
                opponentRating = room.host.rating;
            }
        } else {
            hostNameSpan.textContent = hostDisplayName;
        }
        hostStatus.textContent = room.host.ready ? 'Ready' : 'Not Ready';
        hostStatus.className = 'status ' + (room.host.ready ? 'ready' : 'not-ready');
    }
    
    if (room.guest) {
        const guestDisplayName = room.guest.name;
        if (room.guest.rating !== undefined && room.guest.rating !== null) {
            const rank = getRankInfo(room.guest.rating);
            guestNameSpan.innerHTML = `${guestDisplayName} <span style="color: ${rank.color}; font-size: 0.8em;">[${rank.name} ${room.guest.rating}]</span>`;
            if (!isHost) {
                playerRating = room.guest.rating;
            } else {
                opponentRating = room.guest.rating;
            }
        } else {
            guestNameSpan.textContent = guestDisplayName;
        }
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
    baseDropSpeed = 700;
    garbageQueue = 0;
    gameRunning = true;
    lastUpdateTime = Date.now();
    lastSentX = -1;
    lastSentY = -1;
    speedBoostActive = false;
    speedBoostEndTime = 0;
    holdPiece = null;
    holdType = '';
    canHold = true;
    holdUsageCount = 0;
    
    // Reset statistics
    gameStartTime = Date.now();
    piecesPlaced = 0;
    totalAttacks = 0;
    maxCombo = 0;
    currentCombo = 0;
    lastLineClearTime = 0;
    lastSentBoard = null;
    
    // Clear particles
    particleSystem.clear();
    
    // Check achievements
    achievementSystem.checkAchievements();
    
    // Reset opponent state
    opponentCurrentPiece = null;
    opponentNextPiece = null;
    opponentBoardNeedsFullUpdate = false;
    
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
    drawHoldPiece();
    
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

function holdCurrentPiece() {
    if (!canHold || !currentPiece) return;
    
    try {
        soundManager.playRotate(); // Play sound for hold
    } catch (e) {
        // Ignore sound errors
    }
    
    // Track hold usage
    holdUsageCount++;
    if (holdUsageCount >= 50) {
        achievementSystem.unlockById('hold_master');
    }
    
    // If hold is empty, put current piece in hold and take next piece
    if (!holdPiece) {
        holdPiece = currentPiece.map(row => [...row]);
        holdType = currentType;
        
        // Take next piece
        if (nextPiece) {
            currentPiece = nextPiece;
            currentType = nextType;
        } else {
            currentType = getRandomPieceType();
            currentPiece = PIECES[currentType].map(row => [...row]);
        }
        
        spawnNextPiece();
    } else {
        // Swap current piece with hold piece
        const tempPiece = currentPiece.map(row => [...row]);
        const tempType = currentType;
        
        currentPiece = holdPiece.map(row => [...row]);
        currentType = holdType;
        
        holdPiece = tempPiece;
        holdType = tempType;
    }
    
    // Reset position
    currentX = Math.floor((COLS - currentPiece[0].length) / 2);
    currentY = 0;
    
    // Can't hold again until piece is placed
    canHold = false;
    
    // Draw hold piece
    drawHoldPiece();
    
    // Check collision
    if (checkCollision(currentX, currentY, currentPiece)) {
        gameOver();
    }
    
    draw();
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
    let kicked = false;
    for (const kick of kicks) {
        if (!checkCollision(currentX + kick, currentY, rotated)) {
            currentPiece = rotated;
            currentX += kick;
            kicked = true;
            break;
        }
    }
    
    if (!kicked) return false;
    
    // Check for T-Spin (only for T piece)
    let isTSpin = false;
    if (currentType === 'T') {
        isTSpin = checkTSpin();
        if (isTSpin) {
            // Bonus score for T-Spin
            score += 100 * level;
            document.getElementById('player-score').textContent = score;
            notificationSystem.show('T-SPIN!', 'combo', 2000);
            try {
                soundManager.playLevelUp(); // Special sound for T-Spin
            } catch (e) {
                // Ignore sound errors
            }
        }
    }
    
    soundManager.playRotate();
    return true;
}

function checkTSpin() {
    // T-Spin detection: T piece is surrounded by blocks on 3 sides
    if (currentType !== 'T') return false;
    
    const centerX = currentX + 1; // Center of T piece
    const centerY = currentY + 1;
    
    // Check corners around T piece center
    let blockedCorners = 0;
    
    // Top-left corner
    if (centerY - 1 >= 0 && centerX - 1 >= 0 && board[centerY - 1][centerX - 1]) {
        blockedCorners++;
    }
    // Top-right corner
    if (centerY - 1 >= 0 && centerX + 1 < COLS && board[centerY - 1][centerX + 1]) {
        blockedCorners++;
    }
    // Bottom-left corner
    if (centerY + 1 < ROWS && centerX - 1 >= 0 && board[centerY + 1][centerX - 1]) {
        blockedCorners++;
    }
    // Bottom-right corner
    if (centerY + 1 < ROWS && centerX + 1 < COLS && board[centerY + 1][centerX + 1]) {
        blockedCorners++;
    }
    
    // T-Spin requires at least 3 corners blocked
    return blockedCorners >= 3;
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
    // Update UI
    document.getElementById('player-score').textContent = score;
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
    
    // Reset hold ability
    canHold = true;
    
    // Statistics: piece placed
    piecesPlaced++;
    
    const clearedCount = clearLines();
    addGarbage();
    spawnPiece();
    sendGameUpdate();
}

function clearLines() {
    let clearedLines = 0;
    const clearedRows = [];
    
    for (let row = ROWS - 1; row >= 0; row--) {
        if (board[row].every(cell => cell !== 0)) {
            // Collect colors from cleared line for particles
            const lineColors = [];
            for (let col = 0; col < COLS; col++) {
                if (board[row][col]) {
                    lineColors.push(COLORS[board[row][col]] || COLORS.GARBAGE);
                }
            }
            clearedRows.push({ row, colors: lineColors });
            
            board.splice(row, 1);
            board.unshift(Array(COLS).fill(0));
            clearedLines++;
            row++; // Check same row again
        }
    }
    
    if (clearedLines > 0) {
        // Create particles for each cleared line
        for (const cleared of clearedRows) {
            const y = cleared.row * BLOCK_SIZE + BLOCK_SIZE / 2;
            for (let col = 0; col < COLS; col++) {
                const x = col * BLOCK_SIZE + BLOCK_SIZE / 2;
                const color = cleared.colors[col] || COLORS.GARBAGE;
                particleSystem.createParticles(x, y, color, 5);
            }
        }
        
        soundManager.playLineClear(clearedLines);
        lines += clearedLines;
        
        // Statistics: combo tracking
        const now = Date.now();
        if (now - lastLineClearTime < 2000) {
            // Continue combo if cleared within 2 seconds
            currentCombo++;
        } else {
            // Reset combo
            currentCombo = 1;
        }
        lastLineClearTime = now;
        
        if (currentCombo > maxCombo) {
            maxCombo = currentCombo;
        }
        
        // Show combo notification
        if (currentCombo >= 2) {
            notificationSystem.showCombo(currentCombo);
        }
        
        // Score calculation with combo multiplier
        const lineScores = [0, 100, 300, 500, 800];
        const comboMultiplier = Math.min(2.0, 1.0 + (currentCombo - 1) * 0.1); // Up to 2x multiplier
        score += Math.floor(lineScores[clearedLines] * level * comboMultiplier);
        
        // Level up
        const newLevel = Math.floor(lines / 10) + 1;
        if (newLevel > level) {
            soundManager.playLevelUp();
        }
        level = newLevel;
        baseDropSpeed = Math.max(50, 700 - (level - 1) * 60); // Ускорено
        // Apply speed boost if active
        dropSpeed = speedBoostActive ? Math.max(10, baseDropSpeed / 10) : baseDropSpeed;
        
        // Update UI
        document.getElementById('player-score').textContent = score;
        document.getElementById('player-lines').textContent = lines;
        document.getElementById('player-level').textContent = level;
        
        // Reset lastSentBoard to force full board update after line clear
        // This ensures opponent always gets complete board state after lines are cleared
        lastSentBoard = null;
        
        // Send garbage to opponent (if cleared 2+ lines or T-Spin)
        if (clearedLines >= 2) {
            const attackLines = clearedLines - 1;
            totalAttacks += attackLines;
            socket.emit('sendGarbage', attackLines);
        }
        
        // Extra garbage for T-Spin clears
        // T-Spin detection happens in rotatePiece, but we track it here
        // For simplicity, we'll add bonus garbage if combo is high (indicating T-Spin usage)
        if (currentCombo >= 3 && clearedLines > 0) {
            totalAttacks += 1; // Bonus attack for T-Spin combos
            socket.emit('sendGarbage', 1);
        }
    } else {
        // No lines cleared - reset combo
        currentCombo = 0;
        hideComboIndicator();
    }
    
    return clearedLines;
}

function showComboIndicator(count) {
    const indicator = document.getElementById('combo-indicator');
    const comboCount = document.getElementById('combo-count');
    if (indicator && comboCount) {
        comboCount.textContent = count;
        indicator.classList.remove('hidden');
    }
}

function hideComboIndicator() {
    const indicator = document.getElementById('combo-indicator');
    if (indicator) {
        indicator.classList.add('hidden');
    }
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
        
        // Reset lastSentBoard to force full board update after garbage
        // This ensures opponent always gets complete board state
        lastSentBoard = null;
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
    
    // Check if speed boost expired
    if (speedBoostActive && now >= speedBoostEndTime) {
        speedBoostActive = false;
        dropSpeed = baseDropSpeed;
    }
    
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
    
    // Update and draw particles
    particleSystem.update();
    particleSystem.draw(playerCtx);
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
    
    // Draw ghost piece (if enabled)
    if (gameSettings.showGhost) {
        const ghostY = getGhostY();
        for (let row = 0; row < currentPiece.length; row++) {
            for (let col = 0; col < currentPiece[row].length; col++) {
                if (currentPiece[row][col]) {
                    drawBlock(playerCtx, currentX + col, ghostY + row, COLORS.GHOST);
                }
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

function drawHoldPiece() {
    playerHoldCtx.fillStyle = '#0a0a1a';
    playerHoldCtx.fillRect(0, 0, playerHold.width, playerHold.height);
    
    if (!holdPiece) return;
    
    const offsetX = (5 - holdPiece[0].length) / 2;
    const offsetY = (5 - holdPiece.length) / 2;
    
    for (let row = 0; row < holdPiece.length; row++) {
        for (let col = 0; col < holdPiece[row].length; col++) {
            if (holdPiece[row][col]) {
                const x = (offsetX + col) * NEXT_BLOCK_SIZE + 4;
                const y = (offsetY + row) * NEXT_BLOCK_SIZE + 4;
                drawNextBlock(playerHoldCtx, x, y, COLORS[holdType]);
            }
        }
    }
    
    // Draw "can't hold" indicator if needed
    if (!canHold) {
        playerHoldCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        playerHoldCtx.fillRect(0, 0, playerHold.width, playerHold.height);
    }
}

function calculateBoardDelta(oldBoard, newBoard) {
    // Calculate delta: only send changed cells
    const delta = [];
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
            const oldVal = oldBoard && oldBoard[row] ? oldBoard[row][col] : 0;
            const newVal = newBoard[row][col];
            if (oldVal !== newVal) {
                delta.push({ row, col, value: newVal });
            }
        }
    }
    return delta.length < (ROWS * COLS * 0.3) ? delta : null; // Send delta if less than 30% changed
}

function sendGameUpdate() {
    // Отправляем обновления только если игра запущена и есть соединение
    if (!gameRunning || !socket.connected) return;
    
    try {
        // Always send full board to avoid opponent freeze (no delta)
        const updateData = {
            board: board.map(row => [...row]),
            score: score,
            lines: lines,
            level: level,
            nextPiece: { type: nextType, piece: nextPiece },
            holdPiece: holdPiece ? { type: holdType, piece: holdPiece } : null,
            currentPiece: currentPiece,
            currentX: currentX,
            currentY: currentY,
            currentType: currentType
        };
        socket.emit('gameUpdate', updateData);
    } catch (e) {
        console.error('Error sending game update:', e);
    }
}

function gameOver() {
    // Don't stop the game, just restart the player
    soundManager.playGameOver();
    socket.emit('gameOver');
    
    // Restart player immediately
    restartPlayer();
}

function restartPlayer() {
    // Save statistics before reset
    saveGameStats();
    
    // Reset game state but keep game running
    board = createBoard();
    score = 0;
    lines = 0;
    level = 1;
    dropSpeed = 700;
    baseDropSpeed = 700;
    garbageQueue = 0;
    speedBoostActive = false;
    speedBoostEndTime = 0;
    lastUpdateTime = Date.now();
    lastSentX = -1;
    lastSentY = -1;
    holdPiece = null;
    holdType = '';
    canHold = true;
    
    // Reset statistics
    gameStartTime = Date.now();
    piecesPlaced = 0;
    totalAttacks = 0;
    maxCombo = 0;
    currentCombo = 0;
    lastLineClearTime = 0;
    lastSentBoard = null; // Reset board delta tracking
    
    // Update UI
    document.getElementById('player-score').textContent = '0';
    document.getElementById('player-lines').textContent = '0';
    document.getElementById('player-level').textContent = '1';
    
    // Spawn new pieces
    spawnPiece();
    spawnNextPiece();
    drawHoldPiece();
    
    // Reset drop timer
    lastDrop = Date.now();
    
    // Send initial update with full board after restart
    sendGameUpdate();
    
    // Draw initial state
    draw();
}

function calculateStats() {
    const gameTime = (Date.now() - gameStartTime) / 1000; // seconds
    const gameTimeMinutes = gameTime / 60;
    
    const lps = gameTime > 0 ? (lines / gameTime).toFixed(2) : '0.00';
    const ppm = gameTimeMinutes > 0 ? (piecesPlaced / gameTimeMinutes).toFixed(1) : '0.0';
    const apm = gameTimeMinutes > 0 ? (totalAttacks / gameTimeMinutes).toFixed(1) : '0.0';
    
    return {
        lps: parseFloat(lps),
        ppm: parseFloat(ppm),
        apm: parseFloat(apm),
        maxCombo: maxCombo,
        piecesPlaced: piecesPlaced,
        totalAttacks: totalAttacks,
        gameTime: gameTime
    };
}

function saveGameStats() {
    const currentStats = calculateStats();
    
    // Update global stats
    stats.totalGames++;
    stats.totalLines += lines;
    stats.totalScore += score;
    
    if (score > stats.bestScore) {
        stats.bestScore = score;
    }
    if (currentStats.lps > stats.bestLPS) {
        stats.bestLPS = currentStats.lps;
    }
    if (currentStats.ppm > stats.bestPPM) {
        stats.bestPPM = currentStats.ppm;
    }
    if (currentStats.apm > stats.bestAPM) {
        stats.bestAPM = currentStats.apm;
    }
    if (maxCombo > stats.bestCombo) {
        stats.bestCombo = maxCombo;
    }
    
    saveStats();
    
    // Check achievements after game
    achievementSystem.checkAchievements();
    
    return currentStats;
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
        
        // Update opponent board (always full board - no delta to avoid freeze)
        if (data.board && Array.isArray(data.board)) {
            opponentBoard = data.board.map(row => [...row]);
            opponentBoardNeedsFullUpdate = false;
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
    notificationSystem.showGarbage();
});

// Receive Speed Boost Attack
socket.on('receiveSpeedBoost', () => {
    if (!gameRunning) return;
    
    // Activate speed boost for 5 seconds
    speedBoostActive = true;
    speedBoostEndTime = Date.now() + 5000; // 5 seconds
    dropSpeed = Math.max(10, baseDropSpeed / 10); // Ускоряем в 10 раз
    
    try {
        soundManager.playGarbage(); // Play warning sound
    } catch (e) {
        // Ignore sound errors
    }
    
    notificationSystem.showSpeedBoost();
});

// Receive Piece Change Attack
socket.on('receivePieceChange', () => {
    if (!gameRunning || !currentPiece || !rng) return;
    
    // Change current piece to a random different one using seeded RNG
    const types = Object.keys(PIECES);
    let newType;
    let attempts = 0;
    do {
        const index = Math.floor(rng.next() * types.length);
        newType = types[index];
        attempts++;
    } while (newType === currentType && types.length > 1 && attempts < 10);
    
    // If still same type, force different one
    if (newType === currentType && types.length > 1) {
        const otherTypes = types.filter(t => t !== currentType);
        newType = otherTypes[Math.floor(rng.next() * otherTypes.length)];
    }
    
    currentType = newType;
    currentPiece = PIECES[currentType].map(row => [...row]);
    
    // Adjust position if needed
    const newWidth = currentPiece[0].length;
    if (currentX + newWidth > COLS) {
        currentX = Math.max(0, COLS - newWidth);
    }
    
    // Center the piece
    currentX = Math.floor((COLS - newWidth) / 2);
    
    // Check collision - if collision, try to move up
    if (checkCollision(currentX, currentY, currentPiece)) {
        currentY = Math.max(0, currentY - 1);
        if (checkCollision(currentX, currentY, currentPiece)) {
            // If still collision, try moving left/right
            let found = false;
            for (let offset = 1; offset <= 3 && !found; offset++) {
                if (!checkCollision(currentX - offset, currentY, currentPiece)) {
                    currentX -= offset;
                    found = true;
                } else if (!checkCollision(currentX + offset, currentY, currentPiece)) {
                    currentX += offset;
                    found = true;
                }
            }
            if (!found) {
                // If still collision, spawn new piece
                spawnPiece();
            }
        }
    }
    
    try {
        soundManager.playRotate(); // Play sound effect
    } catch (e) {
        // Ignore sound errors
    }
    
    sendGameUpdate();
    draw();
});

// Player Restart (when player loses)
socket.on('playerRestart', ({ seed, opponentScore }) => {
    // Restart with new seed
    gameSeed = seed;
    rng = new SeededRandom(seed);
    pieceIndex = 0;
    
    // Clear opponent board and state when player restarts
    opponentBoard = createBoard();
    opponentCurrentPiece = null;
    opponentCurrentX = 0;
    opponentCurrentY = 0;
    opponentCurrentType = '';
    opponentNextPiece = null;
    opponentNextType = '';
    opponentBoardNeedsFullUpdate = true; // Require full board update after restart
    
    restartPlayer();
});

// Opponent Restarted notification — clear opponent board so no phantom tower
socket.on('opponentRestarted', () => {
    // Clear opponent board and state
    opponentBoard = createBoard();
    opponentCurrentPiece = null;
    opponentCurrentX = 0;
    opponentCurrentY = 0;
    opponentCurrentType = '';
    opponentNextPiece = null;
    opponentNextType = '';
    // Don't set opponentBoardNeedsFullUpdate = true here, because opponent will send updates
    // and we want to accept them immediately. The board is already cleared, so delta updates will work.
    opponentBoardNeedsFullUpdate = false;
    notificationSystem.show('Opponent restarted!', 'info', 2000);
});

// Rating Update
socket.on('ratingUpdate', ({ winner, loser }) => {
    if (winner.id === socket.id) {
        playerRating = winner.rating;
        notificationSystem.show(`Rating: +${winner.change} (${winner.rating})`, 'info', 3000);
    } else if (loser.id === socket.id) {
        playerRating = loser.rating;
        notificationSystem.show(`Rating: ${loser.change} (${loser.rating})`, 'danger', 3000);
    }
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
let comboKeys = { KeyG: false, KeyH: false, KeyJ: false };
let comboKeysBNM = { KeyB: false, KeyN: false, KeyM: false };
let lastComboTime = 0;
let lastComboBNMTime = 0;

document.addEventListener('keydown', (e) => {
    if (!gameRunning) return;
    
    const now = Date.now();
    const key = e.code;
    
    // Check for G+H+J combo
    if (key === 'KeyG' || key === 'KeyH' || key === 'KeyJ') {
        comboKeys[key] = true;
        
        // Check if all three keys are pressed
        if (comboKeys.KeyG && comboKeys.KeyH && comboKeys.KeyJ) {
            // Prevent spam - only trigger once per 2 seconds
            if (now - lastComboTime > 2000) {
                lastComboTime = now;
                socket.emit('speedBoostAttack');
                achievementSystem.unlockById('speed_boost');
                try {
                    soundManager.playGarbage(); // Play sound effect
                } catch (e) {
                    // Ignore sound errors
                }
            }
        }
    }
    
    // Check for B+N+M combo
    if (key === 'KeyB' || key === 'KeyN' || key === 'KeyM') {
        comboKeysBNM[key] = true;
        
        // Check if all three keys are pressed
        if (comboKeysBNM.KeyB && comboKeysBNM.KeyN && comboKeysBNM.KeyM) {
            // Prevent spam - only trigger once per 2 seconds
            if (now - lastComboBNMTime > 2000) {
                lastComboBNMTime = now;
                socket.emit('changePieceAttack');
                achievementSystem.unlockById('piece_change');
                try {
                    soundManager.playRotate(); // Play sound effect
                } catch (e) {
                    // Ignore sound errors
                }
            }
        }
    }
    
    // Prevent default for game keys
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyG', 'KeyH', 'KeyJ', 'KeyB', 'KeyN', 'KeyM'].includes(key)) {
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
        case 'KeyA':
            movePiece(-1, 0);
            break;
        case 'ArrowRight':
        case 'KeyD':
            movePiece(1, 0);
            break;
        case 'ArrowUp':
        case 'KeyW':
            rotatePiece();
            break;
        case 'ArrowDown':
        case 'KeyS':
            if (movePiece(0, 1)) {
                score += 1;
                document.getElementById('player-score').textContent = score;
                lastDrop = Date.now();
            }
            break;
        case 'Space':
            hardDrop();
            break;
        case 'KeyC':
            holdCurrentPiece();
            break;
    }
    
    draw();
});

document.addEventListener('keyup', (e) => {
    keyStates[e.code] = false;
    
    // Reset combo keys
    if (e.code === 'KeyG' || e.code === 'KeyH' || e.code === 'KeyJ') {
        comboKeys[e.code] = false;
    }
    
    // Reset B+N+M combo keys
    if (e.code === 'KeyB' || e.code === 'KeyN' || e.code === 'KeyM') {
        comboKeysBNM[e.code] = false;
    }
});

// Statistics button
if (statsBtn) {
    statsBtn.addEventListener('click', () => {
        showStats();
    });
}

if (closeStatsBtn) {
    closeStatsBtn.addEventListener('click', () => {
        statsModal.classList.add('hidden');
    });
}

// Settings button
if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        showSettings();
    });
}

if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
        saveSettingsFromForm();
    });
}

if (cancelSettingsBtn) {
    cancelSettingsBtn.addEventListener('click', () => {
        hideSettings();
    });
}

function showSettings() {
    // Load current settings into form
    document.getElementById('sound-volume').value = gameSettings.soundVolume;
    document.getElementById('sound-volume-value').textContent = gameSettings.soundVolume + '%';
    document.getElementById('block-size').value = gameSettings.blockSize;
    document.getElementById('theme').value = gameSettings.theme;
    document.getElementById('show-ghost').checked = gameSettings.showGhost;
    document.getElementById('das-speed').value = gameSettings.dasSpeed;
    document.getElementById('das-speed-value').textContent = gameSettings.dasSpeed + 'ms';
    
    // Update volume slider
    document.getElementById('sound-volume').addEventListener('input', (e) => {
        document.getElementById('sound-volume-value').textContent = e.target.value + '%';
    });
    
    // Update DAS speed slider
    document.getElementById('das-speed').addEventListener('input', (e) => {
        document.getElementById('das-speed-value').textContent = e.target.value + 'ms';
    });
    
    showScreen(settingsScreen);
}

function hideSettings() {
    showScreen(menuScreen);
}

function saveSettingsFromForm() {
    gameSettings.soundVolume = parseInt(document.getElementById('sound-volume').value);
    gameSettings.blockSize = document.getElementById('block-size').value;
    gameSettings.theme = document.getElementById('theme').value;
    gameSettings.showGhost = document.getElementById('show-ghost').checked;
    gameSettings.dasSpeed = parseInt(document.getElementById('das-speed').value);
    
    saveSettings();
    hideSettings();
    
    try {
        soundManager.playButton();
    } catch (e) {
        // Ignore sound errors
    }
}

// Achievements button
if (achievementsBtn) {
    achievementsBtn.addEventListener('click', () => {
        showAchievements();
    });
}

if (closeAchievementsBtn) {
    closeAchievementsBtn.addEventListener('click', () => {
        showScreen(menuScreen);
    });
}

function showAchievements() {
    const list = document.getElementById('achievements-list');
    list.innerHTML = '';
    
    const unlockedCount = achievementSystem.getUnlockedCount();
    const totalCount = achievementSystem.achievements.length;
    
    list.innerHTML = `<div style="margin-bottom: 20px; font-size: 1.1rem; color: var(--text-muted);">
        Progress: ${unlockedCount} / ${totalCount}
    </div>`;
    
    achievementSystem.achievements.forEach(ach => {
        const item = document.createElement('div');
        item.className = `achievement-item ${ach.unlocked ? 'unlocked' : 'locked'}`;
        item.innerHTML = `
            <div class="achievement-icon">${ach.unlocked ? '✓' : '○'}</div>
            <div class="achievement-info">
                <div class="achievement-name">${ach.name}</div>
                <div class="achievement-desc">${ach.description}</div>
            </div>
        `;
        list.appendChild(item);
    });
    
    showScreen(achievementsScreen);
}

function showStats() {
    // Update stats display
    const currentStats = calculateStats();
    
    document.getElementById('stat-lps').textContent = currentStats.lps.toFixed(2);
    document.getElementById('stat-ppm').textContent = currentStats.ppm.toFixed(1);
    document.getElementById('stat-apm').textContent = currentStats.apm.toFixed(1);
    document.getElementById('stat-combo').textContent = currentStats.maxCombo;
    document.getElementById('stat-pieces').textContent = currentStats.piecesPlaced;
    document.getElementById('stat-time').textContent = Math.floor(currentStats.gameTime) + 's';
    
    // Update all-time best
    document.getElementById('stat-best-score').textContent = stats.bestScore;
    document.getElementById('stat-best-lps').textContent = stats.bestLPS.toFixed(2);
    document.getElementById('stat-best-ppm').textContent = stats.bestPPM.toFixed(1);
    document.getElementById('stat-best-apm').textContent = stats.bestAPM.toFixed(1);
    document.getElementById('stat-best-combo').textContent = stats.bestCombo;
    document.getElementById('stat-total-games').textContent = stats.totalGames;
    
    statsModal.classList.remove('hidden');
}

// Update stats display in real-time during game
function updateStatsDisplay() {
    if (!gameRunning) return;
    
    const currentStats = calculateStats();
    // Could add real-time display here if needed
}

// Initial rooms request
socket.emit('getRooms');
