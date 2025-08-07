const socket = io('http://localhost:3000');
const boardElement = document.getElementById('board');
const status = document.getElementById('status');
const modeElement = document.getElementById('mode');
const canvas = document.getElementById('win-line-canvas');
const ctx = canvas.getContext('2d');
const BOARD_SIZE = 15;
const PLAYER_X = 'X';
const PLAYER_O = 'O';
let board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
let mySymbol = null;
let currentPlayer = PLAYER_X;
const playerName = localStorage.getItem('playerName') || 'Người chơi';
const roomId = localStorage.getItem('roomId') || 'default';
const roomOption = localStorage.getItem('roomOption') || '';

// Display room information for PvP
if (localStorage.getItem('gameMode') === 'PVP') {
    modeElement.textContent = `PVP - Phòng: ${roomId}`;
    if (roomOption === 'create') {
        status.textContent = `Phòng đã tạo! Chia sẻ ID "${roomId}" với bạn bè để họ tham gia...`;
    } else if (roomOption === 'join') {
        status.textContent = `Đang tham gia phòng "${roomId}"...`;
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
    const tableRect = boardElement.getBoundingClientRect();
    canvas.width = tableRect.width;
    canvas.height = tableRect.height;
    canvas.style.left = `${tableRect.left}px`;
    canvas.style.top = `${tableRect.top}px`;
}

function handleCellClick(e) {
    if (!mySymbol) {
        status.textContent = 'Chưa được gán ký hiệu!';
        console.log('No symbol assigned yet');
        return;
    }
    if (mySymbol !== currentPlayer) {
        status.textContent = 'Chưa đến lượt bạn!';
        console.log(`Not your turn: mySymbol=${mySymbol}, currentPlayer=${currentPlayer}`);
        return;
    }
    const row = parseInt(e.target.dataset.row);
    const col = parseInt(e.target.dataset.col);
    if (board[row][col]) {
        console.log('Ô đã được chọn:', row, col);
        return;
    }
    console.log(`Sending move: (${row}, ${col})`);
    socket.emit('make_move', { room_id: roomId, row, col });
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
    const cells = boardElement.getElementsByTagName('td');
    for (let cell of cells) {
        cell.removeEventListener('click', handleCellClick);
    }
}

function highlightWinningLine(winInfo) {
    console.log('Highlighting winning line:', winInfo);
    const { direction, start, end } = winInfo;
    const [dr, dc] = direction;
    const cellWidth = canvas.width / BOARD_SIZE;
    const cellHeight = canvas.height / BOARD_SIZE;
    const startX = start[1] * cellWidth + cellWidth / 2;
    const startY = start[0] * cellHeight + cellHeight / 2;
    const endX = end[1] * cellWidth + cellWidth / 2;
    const endY = end[0] * cellHeight + cellHeight / 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 5;
    ctx.stroke();
}

function replayGame() {
    console.log('Requesting replay');
    socket.emit('replay_game', { room_id: roomId });
}

socket.on('connect', () => {
    console.log('Connected to server');
    socket.emit('join_room', { room_id: roomId, player_name: playerName });
});

socket.on('connect_error', (err) => {
    console.log('Connection error:', err);
    status.textContent = 'Không thể kết nối đến server!';
});

socket.on('joined', (data) => {
    mySymbol = data.symbol;
    status.textContent = data.message;
    console.log(`Joined: symbol=${mySymbol}, message=${data.message}`);
});

socket.on('opponent_joined', (data) => {
    status.textContent = data.message;
    console.log(`Opponent joined: ${data.message}`);
});

socket.on('start_game', (data) => {
    status.textContent = data.message;
    currentPlayer = data.current_player;
    console.log(`Game started: currentPlayer=${currentPlayer}, message=${data.message}`);
});

socket.on('update_board', (data) => {
    console.log('Update board:', data);
    board[data.row][data.col] = data.symbol;
    updateBoard();
    currentPlayer = data.current_player;
    status.textContent = data.message;
});

socket.on('game_over', (data) => {
    console.log('Game over:', data);
    board[data.row][data.col] = data.symbol;
    updateBoard();
    status.textContent = data.winner ? `${data.winner} (${data.symbol}) thắng!` : data.message;
    if (data.win_info) {
        highlightWinningLine(data.win_info);
    }
    disableBoard();
});

socket.on('opponent_disconnect', () => {
    status.textContent = 'Đối thủ đã ngắt kết nối!';
    console.log('Opponent disconnected');
    disableBoard();
});

socket.on('replay', (data) => {
    mySymbol = data.players[socket.id];
    board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
    currentPlayer = PLAYER_X;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    createBoard();
    status.textContent = data.message;
    console.log(`Replay: mySymbol=${mySymbol}, message=${data.message}`);
});

socket.on('error', (data) => {
    status.textContent = data.message;
    console.log('Error:', data.message);
});

createBoard();