// Game variables
let socket = null;
let board = Array(15).fill().map(() => Array(15).fill(null));
let mySymbol = null;
let currentPlayer = 'X';
let gameStarted = false;
let roomId = null;

// Get elements
const boardElement = document.getElementById('board');
const status = document.getElementById('status');
const modeElement = document.getElementById('mode');

// Get player info
const playerName = localStorage.getItem('playerName') || 'Player';
const gameMode = localStorage.getItem('gameMode') || 'PVP';
const roomOption = localStorage.getItem('roomOption') || '';

// Initialize
if (gameMode === 'PVP') {
    roomId = localStorage.getItem('roomId');
    modeElement.textContent = `PVP - Phòng: ${roomId}`;
    
    if (roomOption === 'create') {
        status.textContent = `Đang tạo phòng ${roomId}...`;
    } else if (roomOption === 'join') {
        status.textContent = `Đang tham gia phòng ${roomId}...`;
    }
    
    connectWebSocket();
}

function connectWebSocket() {
    try {
        socket = new WebSocket('ws://localhost:8001');
        
        socket.onopen = function() {
            console.log('Connected to WebSocket server');
            
            if (roomOption === 'create') {
                socket.send(JSON.stringify({
                    action: 'create_room',
                    room_id: roomId,
                    player_name: playerName
                }));
            } else if (roomOption === 'join') {
                socket.send(JSON.stringify({
                    action: 'join_room',
                    room_id: roomId,
                    player_name: playerName
                }));
            }
        };
        
        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            handleMessage(data);
        };
        
        socket.onclose = function() {
            console.log('WebSocket connection closed');
            status.textContent = 'Kết nối bị mất!';
        };
        
        socket.onerror = function(error) {
            console.log('WebSocket error:', error);
            status.textContent = 'Lỗi kết nối!';
        };
        
    } catch (error) {
        console.log('Failed to connect:', error);
        status.textContent = 'Không thể kết nối!';
    }
}

function handleMessage(data) {
    switch (data.type) {
        case 'room_created':
            mySymbol = data.symbol;
            status.textContent = data.message;
            break;
            
        case 'room_joined':
            mySymbol = data.symbol;
            status.textContent = data.message;
            break;
            
        case 'opponent_joined':
            status.textContent = data.message;
            break;
            
        case 'game_start':
            status.textContent = data.message;
            currentPlayer = data.current_player;
            gameStarted = true;
            break;
            
        case 'move_made':
            board[data.row][data.col] = data.symbol;
            updateBoard();
            currentPlayer = data.current_player;
            status.textContent = data.message;
            break;
            
        case 'game_over':
            if (data.row !== undefined && data.col !== undefined) {
                board[data.row][data.col] = data.symbol;
                updateBoard();
            }
            status.textContent = data.message;
            gameStarted = false;
            break;
            
        case 'player_left':
            status.textContent = data.message;
            gameStarted = false;
            break;
            
        case 'error':
            status.textContent = data.message;
            break;
    }
}

function createBoard() {
    boardElement.innerHTML = '';
    for (let i = 0; i < 15; i++) {
        const row = document.createElement('tr');
        for (let j = 0; j < 15; j++) {
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
    
    // Send move
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            action: 'make_move',
            room_id: roomId,
            row: row,
            col: col
        }));
    }
}

function updateBoard() {
    const cells = boardElement.getElementsByTagName('td');
    for (let i = 0; i < 15; i++) {
        for (let j = 0; j < 15; j++) {
            const cell = cells[i * 15 + j];
            cell.textContent = board[i][j] || '';
            cell.className = board[i][j] ? board[i][j].toLowerCase() : '';
        }
    }
}

function replayGame() {
    status.textContent = 'Chức năng chơi lại chưa được hỗ trợ!';
}

// Initialize board
createBoard();