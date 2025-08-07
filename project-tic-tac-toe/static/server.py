import socketio
from aiohttp import web
import asyncio

sio = socketio.AsyncServer(cors_allowed_origins="*")
app = web.Application()
sio.attach(app)

games = {}  # {room_id: {players: {sid: symbol}, board, current_player, roles, player_names}}

async def check_winner(board, row, col, player):
    print(f"Checking winner for {player} at ({row}, {col})")
    directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        start = [row, col]
        end = [row, col]
        for i in range(1, 5):
            r, c = row + dr * i, col + dc * i
            if 0 <= r < 15 and 0 <= c < 15 and board[r][c] == player:
                count += 1
                end = [r, c]
            else:
                break
        for i in range(1, 5):
            r, c = row - dr * i, col - dc * i
            if 0 <= r < 15 and 0 <= c < 15 and board[r][c] == player:
                count += 1
                start = [r, c]
            else:
                break
        if count >= 5:
            print(f"Winner found: {player}, direction: {dr, dc}, start: {start}, end: {end}")
            return {"direction": [dr, dc], "start": start, "end": end}
    return None

async def is_board_full(board):
    full = all(cell is not None for row in board for cell in row)
    print(f"Board full: {full}")
    return full

@sio.event
async def connect(sid, environ):
    print(f"Client {sid} connected")

@sio.event
async def disconnect(sid):
    print(f"Client {sid} disconnected")
    for room_id, game in list(games.items()):
        if sid in game["players"]:
            del game["players"][sid]
            del game["roles"][sid]
            await sio.emit("opponent_disconnect", room=room_id)
            if not game["players"]:
                print(f"Room {room_id} empty, removing")
                del games[room_id]

@sio.event
async def join_room(sid, data):
    room_id = data["room_id"]
    player_name = data["player_name"]
    print(f"Client {sid} joining room {room_id} as {player_name}")
    if room_id not in games:
        games[room_id] = {
            "players": {sid: "X"},
            "board": [[None] * 15 for _ in range(15)],
            "current_player": "X",
            "roles": {sid: "X"},
            "player_names": {sid: player_name}
        }
        await sio.emit("joined", {"symbol": "X", "message": f"{player_name} (X) chờ đối thủ..."}, to=sid)
    elif len(games[room_id]["players"]) == 1:
        games[room_id]["players"][sid] = "O"
        games[room_id]["roles"][sid] = "O"
        games[room_id]["player_names"][sid] = player_name
        player1_sid = next(sid_ for sid_ in games[room_id]["players"] if sid_ != sid)
        player1_name = games[room_id]["player_names"][player1_sid]
        await sio.emit("joined", {"symbol": "O", "message": f"{player_name} (O) tham gia!"}, to=sid)
        await sio.emit("start_game", {
            "message": f"Bắt đầu! {player1_name} (X) đi trước",
            "current_player": "X"
        }, room=room_id)
        print(f"Game started in room {room_id}: {player1_name} (X) vs {player_name} (O)")
    else:
        await sio.emit("error", {"message": "Phòng đã đầy!"}, to=sid)
        print(f"Room {room_id} full, rejecting {sid}")

@sio.event
async def make_move(sid, data):
    room_id = data["room_id"]
    row = data["row"]
    col = data["col"]
    print(f"Move from {sid} in room {room_id}: ({row}, {col})")
    if room_id not in games or sid not in games[room_id]["players"]:
        await sio.emit("error", {"message": "Không tìm thấy phòng hoặc người chơi!"}, to=sid)
        print(f"Invalid room or player: {sid}, {room_id}")
        return
    game = games[room_id]
    symbol = game["players"][sid]
    if game["current_player"] != symbol:
        await sio.emit("error", {"message": "Chưa đến lượt bạn!"}, to=sid)
        print(f"Not {sid}'s turn: current_player is {game['current_player']}, player is {symbol}")
        return
    if game["board"][row][col] is not None:
        await sio.emit("error", {"message": "Ô đã được chọn!"}, to=sid)
        print(f"Cell ({row}, {col}) already taken")
        return

    game["board"][row][col] = symbol
    win_info = await check_winner(game["board"], row, col, symbol)
    player_name = game["player_names"].get(sid, "Người chơi")
    if win_info:
        await sio.emit("game_over", {
            "winner": player_name,
            "symbol": symbol,
            "win_info": win_info,
            "row": row,
            "col": col
        }, room=room_id)
        print(f"Game over in room {room_id}: {player_name} ({symbol}) wins")
    elif await is_board_full(game["board"]):
        await sio.emit("game_over", {
            "winner": None,
            "message": "Hòa!",
            "row": row,
            "col": col,
            "symbol": symbol
        }, room=room_id)
        print(f"Game over in room {room_id}: Draw")
    else:
        game["current_player"] = "O" if symbol == "X" else "X"
        opponent_sid = next(sid_ for sid_ in game["players"] if sid_ != sid)
        opponent_name = game["player_names"].get(opponent_sid, "Đối thủ")
        await sio.emit("update_board", {
            "row": row,
            "col": col,
            "symbol": symbol,
            "current_player": game["current_player"],
            "message": f"{opponent_name} ({game['current_player']}) lượt đi"
        }, room=room_id)
        print(f"Updated board in room {room_id}: {opponent_name} ({game['current_player']})'s turn")

@sio.event
async def replay_game(sid, data):
    room_id = data["room_id"]
    print(f"Replay requested by {sid} in room {room_id}")
    if room_id not in games or sid not in games[room_id]["players"]:
        await sio.emit("error", {"message": "Không tìm thấy phòng hoặc người chơi!"}, to=sid)
        print(f"Invalid replay request: {sid}, {room_id}")
        return
    game = games[room_id]
    if len(game["players"]) != 2:
        await sio.emit("error", {"message": "Chờ đối thủ tham gia lại!"}, to=sid)
        print(f"Cannot replay: only {len(game['players'])} players in room {room_id}")
        return
    for player_sid in game["players"]:
        game["players"][player_sid] = "O" if game["players"][player_sid] == "X" else "X"
        game["roles"][player_sid] = game["players"][player_sid]
    game["board"] = [[None] * 15 for _ in range(15)]
    game["current_player"] = "X"
    x_player = next(sid_ for sid_, symbol in game["players"].items() if symbol == "X")
    x_player_name = game["player_names"].get(x_player, "Người chơi")
    await sio.emit("replay", {
        "players": game["players"],
        "message": f"Chơi lại! {x_player_name} (X) đi trước"
    }, room=room_id)
    print(f"Replayed in room {room_id}: {x_player_name} (X) goes first")

if __name__ == "__main__":
    web.run_app(app, host="192.168.2.13", port=3000)