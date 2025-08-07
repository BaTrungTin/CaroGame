const boardElement = document.getElementById('board');
const status = document.getElementById('status');
const modeElement = document.getElementById('mode');
const canvas = document.getElementById('win-line-canvas');
const ctx = canvas.getContext('2d');
const BOARD_SIZE = 15;
const PLAYER_X = 'X';
const PLAYER_O = 'O';
let currentPlayer = PLAYER_X;
let botIsX = false; // Người chơi là X ban đầu
const playerName = localStorage.getItem('playerName') || 'Người chơi';
let board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));

modeElement.textContent = 'PVE';

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
    // Điều chỉnh kích thước canvas để khớp với bàn cờ
    const tableRect = boardElement.getBoundingClientRect();
    canvas.width = tableRect.width;
    canvas.height = tableRect.height;
    canvas.style.left = `${tableRect.left}px`;
    canvas.style.top = `${tableRect.top}px`;
}

function handleCellClick(e) {
    const playerSymbol = botIsX ? PLAYER_O : PLAYER_X;
    if (currentPlayer !== playerSymbol) {
        status.textContent = 'Chưa đến lượt bạn!';
        return;
    }
    const row = parseInt(e.target.dataset.row);
    const col = parseInt(e.target.dataset.col);
    if (board[row][col]) {
        console.log('Ô đã được chọn:', row, col);
        return;
    }

    makeMove(row, col, playerSymbol);
    if (!checkWinner(board, row, col, playerSymbol) && !isBoardFull()) {
        console.log('Người chơi đã đi, đến lượt bot');
        setTimeout(() => aiMove(), 500);
    } else {
        console.log('Trò chơi kết thúc sau nước đi của người chơi');
    }
}

function makeMove(row, col, player) {
    board[row][col] = player;
    updateBoard();
    const winInfo = checkWinner(board, row, col, player);
    if (winInfo) {
        status.textContent = `${player === (botIsX ? PLAYER_O : PLAYER_X) ? playerName : 'Máy'} (${player}) thắng!`;
        highlightWinningLine(winInfo);
        disableBoard();
    } else if (isBoardFull()) {
        status.textContent = 'Hòa!';
        disableBoard();
    } else {
        currentPlayer = currentPlayer === PLAYER_X ? PLAYER_O : PLAYER_X;
        status.textContent = `${playerName} (Lượt của ${currentPlayer === (botIsX ? PLAYER_O : PLAYER_X) ? `bạn (${botIsX ? PLAYER_O : PLAYER_X})` : `máy (${botIsX ? PLAYER_X : PLAYER_O})`})`;
    }
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

function checkWinner(board, row, col, player) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let [dr, dc] of directions) {
        let count = 1;
        let start = [row, col];
        let end = [row, col];
        for (let i = 1; i < 5; i++) {
            let r = row + dr * i, c = col + dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
                count++;
                end = [r, c];
            } else {
                break;
            }
        }
        for (let i = 1; i < 5; i++) {
            let r = row - dr * i, c = col - dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
                count++;
                start = [r, c];
            } else {
                break;
            }
        }
        if (count >= 5) {
            return { direction: [dr, dc], start, end };
        }
    }
    return null;
}

function isBoardFull() {
    return board.every(row => row.every(cell => cell !== null));
}

function countConsecutive(board, row, col, player) {
    let maxCount = 0;
    let bestOpenEnds = 0;
    let bestMove = null;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let [dr, dc] of directions) {
        let count = 1;
        let openEnds = 0;
        let move = null;
        for (let i = 1; i < 5; i++) {
            let r = row + dr * i, c = col + dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
                count++;
            } else if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
                openEnds++;
                move = move || [r, c];
                break;
            } else {
                break;
            }
        }
        for (let i = 1; i < 5; i++) {
            let r = row - dr * i, c = col - dc * i;
            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === player) {
                count++;
            } else if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === null) {
                openEnds++;
                move = move || [r, c];
                break;
            } else {
                break;
            }
        }
        if (openEnds > 0 && count > maxCount) {
            maxCount = count;
            bestOpenEnds = openEnds;
            bestMove = move;
        }
    }
    return { count: maxCount, move: bestMove, openEnds: bestOpenEnds };
}

function hasPlayerSequence(count) {
    const playerSymbol = botIsX ? PLAYER_O : PLAYER_X;
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (!board[i][j]) {
                board[i][j] = playerSymbol;
                let result = countConsecutive(board, i, j, playerSymbol);
                board[i][j] = null;
                if (result.count >= count && result.openEnds > 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

function hasBotSequence(count) {
    const botSymbol = botIsX ? PLAYER_X : PLAYER_O;
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (!board[i][j]) {
                board[i][j] = botSymbol;
                let result = countConsecutive(board, i, j, botSymbol);
                board[i][j] = null;
                if (result.count >= count && result.openEnds > 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

function aiMove() {
    console.log('Bot đang chọn nước đi...');
    const botSymbol = botIsX ? PLAYER_X : PLAYER_O;
    const playerSymbol = botIsX ? PLAYER_O : PLAYER_X;

    // 1. Chặn người chơi nếu họ có 4 ký hiệu liên tiếp
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (!board[i][j]) {
                board[i][j] = playerSymbol;
                let result = countConsecutive(board, i, j, playerSymbol);
                board[i][j] = null;
                if (result.count >= 4 && result.openEnds > 0) {
                    console.log(`Bot chặn 4 ${playerSymbol} liên tiếp:`, i, j);
                    makeMove(i, j, botSymbol);
                    return;
                }
            }
        }
    }

    // 2. Thắng ngay nếu có thể (5 ký hiệu liên tiếp)
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (!board[i][j]) {
                board[i][j] = botSymbol;
                if (checkWinner(board, i, j, botSymbol)) {
                    board[i][j] = null;
                    console.log('Bot thắng ngay:', i, j);
                    makeMove(i, j, botSymbol);
                    return;
                }
                board[i][j] = null;
            }
        }
    }

    // 3. Tạo 4 hoặc 5 ký hiệu từ chuỗi 3 ký hiệu trở lên nếu bot có 3 trước hoặc người chơi chỉ có 2
    const botHas3 = hasBotSequence(3);
    const playerHas3 = hasPlayerSequence(3);
    const playerHas2 = hasPlayerSequence(2);
    if (botHas3 && (!playerHas3 || !playerHas2)) {
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (!board[i][j]) {
                    board[i][j] = botSymbol;
                    let result = countConsecutive(board, i, j, botSymbol);
                    board[i][j] = null;
                    if (result.count >= 3 && result.openEnds > 0) {
                        console.log(`Bot tạo ${result.count + 1} ${botSymbol} liên tiếp:`, i, j);
                        makeMove(i, j, botSymbol);
                        return;
                    }
                }
            }
        }
    }

    // 4. Chặn người chơi nếu họ có 3 ký hiệu liên tiếp và bot không có 3
    if (!botHas3 && playerHas3) {
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (!board[i][j]) {
                    board[i][j] = playerSymbol;
                    let result = countConsecutive(board, i, j, playerSymbol);
                    board[i][j] = null;
                    if (result.count === 3 && result.openEnds > 0) {
                        console.log(`Bot chặn 3 ${playerSymbol} liên tiếp:`, i, j);
                        makeMove(i, j, botSymbol);
                        return;
                    }
                }
            }
        }
    }

    // 5. Tìm nước đi gần các ô đã đánh để tăng cơ hội tạo chuỗi
    const nearbyCells = [];
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    for (let i = 0; i < BOARD_SIZE; i++) {
        for (let j = 0; j < BOARD_SIZE; j++) {
            if (board[i][j]) {
                for (let [dr, dc] of directions) {
                    let r = i + dr, c = j + dc;
                    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && !board[r][c]) {
                        nearbyCells.push([r, c]);
                    }
                }
            }
        }
    }

    // 6. Chọn ngẫu nhiên từ các ô gần hoặc toàn bộ ô trống
    let move;
    if (nearbyCells.length > 0) {
        const randomIndex = Math.floor(Math.random() * nearbyCells.length);
        move = nearbyCells[randomIndex];
    } else {
        const emptyCells = [];
        for (let i = 0; i < BOARD_SIZE; i++) {
            for (let j = 0; j < BOARD_SIZE; j++) {
                if (!board[i][j]) {
                    emptyCells.push([i, j]);
                }
            }
        }
        if (emptyCells.length > 0) {
            const randomIndex = Math.floor(Math.random() * emptyCells.length);
            move = emptyCells[randomIndex];
        }
    }

    if (move) {
        console.log('Bot chọn nước đi:', move);
        makeMove(move[0], move[1], botSymbol);
    } else {
        console.error('Không còn ô trống để bot đi!');
    }
}

function highlightWinningLine(winInfo) {
    const { direction, start, end } = winInfo;
    const [dr, dc] = direction;
    const cellWidth = canvas.width / BOARD_SIZE;
    const cellHeight = canvas.height / BOARD_SIZE;

    // Tính tọa độ trung tâm của ô bắt đầu và kết thúc
    const startX = start[1] * cellWidth + cellWidth / 2;
    const startY = start[0] * cellHeight + cellHeight / 2;
    const endX = end[1] * cellWidth + cellWidth / 2;
    const endY = end[0] * cellHeight + cellHeight / 2;

    // Vẽ đường thắng
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 5;
    ctx.stroke();
}

function replayGame() {
    botIsX = !botIsX; // Đảo vai trò X/O
    const botSymbol = botIsX ? PLAYER_X : PLAYER_O;
    const playerSymbol = botIsX ? PLAYER_O : PLAYER_X;
    board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
    currentPlayer = PLAYER_X; // X luôn đi trước
    ctx.clearRect(0, 0, canvas.width, canvas.height); // Xóa đường thắng
    createBoard();
    status.textContent = `${playerName} (Bạn là ${playerSymbol}, ${botIsX ? 'Máy (X)' : 'Bạn (X)'} đi trước)`;
    if (botIsX) {
        setTimeout(() => aiMove(), 500); // Bot đi trước nếu là X
    }
}

// Khởi tạo trò chơi, người chơi (X) đi trước
status.textContent = `${playerName} (Bạn là ${PLAYER_X}, Bạn (X) đi trước)`;
createBoard();