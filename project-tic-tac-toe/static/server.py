import socketio
from aiohttp import web
import asyncio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create socket.io server
sio = socketio.AsyncServer(cors_allowed_origins="*", logger=True, engineio_logger=True)
app = web.Application()
sio.attach(app)

# Game state storage
rooms = {}  # {room_id: {players: [], board: [], current_turn: 0, game_started: False}}

def create_empty_board():
    """Create a 15x15 empty board"""
    return [[None for _ in range(15)] for _ in range(15)]

def check_winner(board, row, col, symbol):
    """Check if the last move resulted in a win"""
    directions = [(0, 1), (1, 0), (1, 1), (1, -1)]  # horizontal, vertical, diagonal
    
    for dr, dc in directions:
        count = 1
        
        # Check in positive direction
        r, c = row + dr, col + dc
        while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == symbol:
            count += 1
            r, c = r + dr, c + dc
        
        # Check in negative direction
        r, c = row - dr, col - dc
        while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == symbol:
            count += 1
            r, c = r - dr, c - dc
        
        if count >= 5:
            return True
    
    return False

def is_board_full(board):
    """Check if board is full"""
    return all(cell is not None for row in board for cell in row)

@sio.event
async def connect(sid, environ):
    logger.info(f"Client {sid} connected")
    await sio.emit('connected', {'message': 'Connected to server'}, to=sid)

@sio.event
async def disconnect(sid):
    logger.info(f"Client {sid} disconnected")
    
    # Remove player from all rooms
    for room_id, room in list(rooms.items()):
        for i, player in enumerate(room['players']):
            if player['id'] == sid:
                # Remove player
                room['players'].pop(i)
                
                # Notify remaining players
                if room['players']:
                    await sio.emit('player_left', {
                        'message': f"Đối thủ đã rời khỏi phòng {room_id}",
                        'room_id': room_id
                    }, room=room_id)
                
                # Clean up empty rooms
                if not room['players']:
                    del rooms[room_id]
                    logger.info(f"Removed empty room {room_id}")
                
                break

@sio.event
async def create_room(sid, data):
    """Create a new room"""
    try:
        player_name = data.get('player_name', 'Player')
        room_id = data.get('room_id')
        
        if not room_id:
            await sio.emit('error', {'message': 'Room ID is required'}, to=sid)
            return
        
        if room_id in rooms:
            await sio.emit('error', {'message': f'Room {room_id} already exists'}, to=sid)
            return
        
        # Create new room
        rooms[room_id] = {
            'players': [{
                'id': sid,
                'name': player_name,
                'symbol': 'X'
            }],
            'board': create_empty_board(),
            'current_turn': 0,
            'game_started': False
        }
        
        await sio.enter_room(sid, room_id)
        
        await sio.emit('room_created', {
            'room_id': room_id,
            'message': f'🏠 Phòng {room_id} đã được tạo! Đang chờ đối thủ...',
            'symbol': 'X'
        }, to=sid)
        
        logger.info(f"Room {room_id} created by {player_name}")
        
    except Exception as e:
        logger.error(f"Error creating room: {e}")
        await sio.emit('error', {'message': 'Failed to create room'}, to=sid)

@sio.event
async def join_room(sid, data):
    """Join an existing room"""
    try:
        player_name = data.get('player_name', 'Player')
        room_id = data.get('room_id')
        
        if not room_id:
            await sio.emit('error', {'message': 'Room ID is required'}, to=sid)
            return
        
        if room_id not in rooms:
            await sio.emit('error', {'message': f'Room {room_id} does not exist'}, to=sid)
            return
        
        room = rooms[room_id]
        
        if len(room['players']) >= 2:
            await sio.emit('error', {'message': f'Room {room_id} is full'}, to=sid)
            return
        
        # Add player to room
        room['players'].append({
            'id': sid,
            'name': player_name,
            'symbol': 'O'
        })
        
        await sio.enter_room(sid, room_id)
        
        # Notify the joining player
        await sio.emit('room_joined', {
            'room_id': room_id,
            'message': f'🚪 Đã tham gia phòng {room_id}!',
            'symbol': 'O'
        }, to=sid)
        
        # Notify the room creator
        creator = room['players'][0]
        await sio.emit('opponent_joined', {
            'message': f'🎉 {player_name} đã tham gia! Trận đấu sắp bắt đầu...'
        }, to=creator['id'])
        
        # Start the game
        room['game_started'] = True
        
        await asyncio.sleep(1)  # Small delay for better UX
        
        await sio.emit('game_start', {
            'message': f'🎮 Trận đấu bắt đầu! {creator["name"]} (X) đi trước',
            'current_player': 'X',
            'players': {
                'X': creator['name'],
                'O': player_name
            }
        }, room=room_id)
        
        logger.info(f"Game started in room {room_id}: {creator['name']} vs {player_name}")
        
    except Exception as e:
        logger.error(f"Error joining room: {e}")
        await sio.emit('error', {'message': 'Failed to join room'}, to=sid)

@sio.event
async def make_move(sid, data):
    """Make a move in the game"""
    try:
        room_id = data.get('room_id')
        row = data.get('row')
        col = data.get('col')
        
        if room_id not in rooms:
            await sio.emit('error', {'message': 'Room not found'}, to=sid)
            return
        
        room = rooms[room_id]
        
        # Find player
        player = None
        player_index = None
        for i, p in enumerate(room['players']):
            if p['id'] == sid:
                player = p
                player_index = i
                break
        
        if not player:
            await sio.emit('error', {'message': 'Player not found in room'}, to=sid)
            return
        
        if not room['game_started']:
            await sio.emit('error', {'message': 'Game has not started yet'}, to=sid)
            return
        
        if len(room['players']) < 2:
            await sio.emit('error', {'message': 'Waiting for another player'}, to=sid)
            return
        
        # Check if it's player's turn
        if player_index != room['current_turn']:
            await sio.emit('error', {'message': 'Not your turn'}, to=sid)
            return
        
        # Check if move is valid
        if row < 0 or row >= 15 or col < 0 or col >= 15:
            await sio.emit('error', {'message': 'Invalid move position'}, to=sid)
            return
        
        if room['board'][row][col] is not None:
            await sio.emit('error', {'message': 'Position already taken'}, to=sid)
            return
        
        # Make the move
        symbol = player['symbol']
        room['board'][row][col] = symbol
        
        # Check for winner
        if check_winner(room['board'], row, col, symbol):
            # Game over - someone won
            await sio.emit('game_over', {
                'winner': player['name'],
                'symbol': symbol,
                'message': f'🎉 {player["name"]} ({symbol}) thắng!',
                'row': row,
                'col': col
            }, room=room_id)
            
            # Reset game state
            room['game_started'] = False
            
        elif is_board_full(room['board']):
            # Game over - draw
            await sio.emit('game_over', {
                'winner': None,
                'message': '🤝 Hòa!',
                'row': row,
                'col': col,
                'symbol': symbol
            }, room=room_id)
            
            # Reset game state
            room['game_started'] = False
            
        else:
            # Continue game - switch turns
            room['current_turn'] = 1 - room['current_turn']
            next_player = room['players'][room['current_turn']]
            
            await sio.emit('move_made', {
                'row': row,
                'col': col,
                'symbol': symbol,
                'current_player': next_player['symbol'],
                'message': f'{next_player["name"]} ({next_player["symbol"]}) lượt đi'
            }, room=room_id)
        
        logger.info(f"Move made in room {room_id}: ({row}, {col}) by {player['name']}")
        
    except Exception as e:
        logger.error(f"Error making move: {e}")
        await sio.emit('error', {'message': 'Failed to make move'}, to=sid)

@sio.event
async def restart_game(sid, data):
    """Restart the game in a room"""
    try:
        room_id = data.get('room_id')
        
        if room_id not in rooms:
            await sio.emit('error', {'message': 'Room not found'}, to=sid)
            return
        
        room = rooms[room_id]
        
        if len(room['players']) < 2:
            await sio.emit('error', {'message': 'Need 2 players to restart'}, to=sid)
            return
        
        # Reset game state
        room['board'] = create_empty_board()
        room['current_turn'] = 0
        room['game_started'] = True
        
        # Swap symbols
        for player in room['players']:
            player['symbol'] = 'O' if player['symbol'] == 'X' else 'X'
        
        first_player = room['players'][0]
        
        await sio.emit('game_restarted', {
            'message': f'🔄 Chơi lại! {first_player["name"]} ({first_player["symbol"]}) đi trước',
            'current_player': first_player['symbol'],
            'players': {p['symbol']: p['name'] for p in room['players']}
        }, room=room_id)
        
        logger.info(f"Game restarted in room {room_id}")
        
    except Exception as e:
        logger.error(f"Error restarting game: {e}")
        await sio.emit('error', {'message': 'Failed to restart game'}, to=sid)

async def init_app():
    """Initialize the web application"""
    app.router.add_static('/', path='.')
    return app

if __name__ == '__main__':
    web.run_app(init_app(), host='localhost', port=3000)