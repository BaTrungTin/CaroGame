const socket = io('http://localhost:3000');
const boardElement = document.getElementById('board');
const status = document.getElementById('status');
const modeElement = document.getElementById('mode');
const BOARD_SIZE = 15;
const PLAYER_X = 'X';
const PLAYER_O = 'O';

// Game state
let board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
let mySymbol = null;
let currentPlayer = PLAYER_X;
let gameStarted = false;
let roomId = null;

// Get player info from localStorage
const playerName = localStorage.getItem('playerName') || 'Người chơi';
const gameMode = localStorage.getItem('gameMode') || 'PVP';
const roomOption = localStorage.getItem('roomOption') || '';

// Initialize based on game mode
if (gameMode === 'PVP') {
    roomId = localStorage.getItem('roomId');
    modeElement.textContent = `PVP - Phòng: ${roomId}`;
    
    if (roomOption === 'create') {
        status.textContent = `Đang tạo phòng ${roomId}...`;
    } else if (roomOption === 'join') {
        status.textContent = `Đang tham gia phòng ${roomId}...`;
    } else {
        status.textContent = 'Đang kết nối...';
    }
} else {
    modeElement.textContent = 'PVE';
    status.textContent = 'Đang khởi tạo...';
}

function createBoard() {
    boardElement.innerHTML = '';
    for (let i = 0; i < BOARD_SIZE; i++) {
        const row = document.createElement('tr');
        for (let j = 0; j < BOARD_SIZE; j++) {
            const cell = document.createElement('td');
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.addEventListener('click', handleCellClick);
            row.appendChild(cell);
        }
        boardElement.appendChild(row);
    }
}

function handleCellClick(e) {
    if (!gameStarted) {
        status.textContent = 'Game chưa bắt đầu!';
        return;
    }
    
    if (!mySymbol) {
        status.textContent = 'Chưa được gán ký hiệu!';
        return;
    }
    
    if (mySymbol !== currentPlayer) {
        status.textContent = 'Chưa đến lượt bạn!';
        return;
    }
    
    const row = parseInt(e.target.dataset.row);
    const col = parseInt(e.target.dataset.col);
    
    if (board[row][col]) {
        status.textContent = 'Ô đã được chọn!';
        return;
    }
    
    // Send move to server
    socket.emit('make_move', {
        room_id: roomId,
        row: row,
        col: col
    });
}

function updateBoard() {
    const cells = boardElement.getElementsByTagName('td');
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            const cell = cells[i * BOARD_SIZE + j];
            cell.textContent = board[i][j] || '';
            cell.className = board[i][j] ? board[i][j].toLowerCase() : '';
        }
    }
}

function disableBoard() {
    gameStarted = false;
    const cells = boardElement.getElementsByTagName('td');
    for (let cell of cells) {
        cell.style.pointerEvents = 'none';
    }
}

function enableBoard() {
    gameStarted = true;
    const cells = boardElement.getElementsByTagName('td');
    for (let cell of cells) {
        cell.style.pointerEvents = 'auto';
    }
}

function resetBoard() {
    board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
    updateBoard();
    enableBoard();
}

function replayGame() {
    if (!roomId) {
        status.textContent = 'Không có thông tin phòng để chơi lại!';
        return;
    }
    
    socket.emit('restart_game', { room_id: roomId });
}

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
    
    if (gameMode === 'PVP' && roomId) {
        if (roomOption === 'create') {
            // Create room
            socket.emit('create_room', {
                room_id: roomId,
                player_name: playerName
            });
        } else if (roomOption === 'join') {
            // Join existing room
            socket.emit('join_room', {
                room_id: roomId,
                player_name: playerName
            });
        }
    }
});

socket.on('connect_error', (err) => {
    console.log('Connection error:', err);
    status.textContent = 'Không thể kết nối đến server!';
});

socket.on('room_created', (data) => {
    mySymbol = data.symbol;
    status.textContent = data.message;
    console.log(`Room created: ${data.room_id}, symbol: ${data.symbol}`);
});

socket.on('room_joined', (data) => {
    mySymbol = data.symbol;
    status.textContent = data.message;
    console.log(`Room joined: ${data.room_id}, symbol: ${data.symbol}`);
});

socket.on('opponent_joined', (data) => {
    status.textContent = data.message;
    console.log(`Opponent joined: ${data.message}`);
});

socket.on('game_start', (data) => {
    status.textContent = data.message;
    currentPlayer = data.current_player;
    gameStarted = true;
    enableBoard();
    console.log(`Game started: ${data.message}`);
});

socket.on('move_made', (data) => {
    // Update board with the move
    board[data.row][data.col] = data.symbol;
    updateBoard();
    
    // Update current player
    currentPlayer = data.current_player;
    status.textContent = data.message;
    
    console.log(`Move made: (${data.row}, ${data.col}) = ${data.symbol}`);
});

socket.on('game_over', (data) => {
    // Update board with final move
    if (data.row !== undefined && data.col !== undefined) {
        board[data.row][data.col] = data.symbol;
        updateBoard();
    }
    
    status.textContent = data.message;
    disableBoard();
    
    console.log(`Game over: ${data.message}`);
});

socket.on('game_restarted', (data) => {
    status.textContent = data.message;
    currentPlayer = data.current_player;
    resetBoard();
    
    // Update symbols if they were swapped
    const players = data.players;
    for (let symbol in players) {
        if (players[symbol] === playerName) {
            mySymbol = symbol;
            break;
        }
    }
    
    console.log(`Game restarted: ${data.message}`);
});

socket.on('player_left', (data) => {
    status.textContent = data.message;
    disableBoard();
    console.log(`Player left: ${data.message}`);
});

socket.on('error', (data) => {
    status.textContent = data.message;
    console.log('Error:', data.message);
});

// Initialize the board
createBoard();