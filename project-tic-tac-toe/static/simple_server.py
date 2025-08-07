#!/usr/bin/env python3
import asyncio
import websockets
import json
import random
import string
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import os

# Game rooms storage
rooms = {}

def generate_room_id():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

def create_board():
    return [[None for _ in range(15)] for _ in range(15)]

def check_winner(board, row, col, symbol):
    directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        # Check positive direction
        r, c = row + dr, col + dc
        while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == symbol:
            count += 1
            r, c = r + dr, c + dc
        # Check negative direction
        r, c = row - dr, col - dc
        while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == symbol:
            count += 1
            r, c = r - dr, c - dc
        if count >= 5:
            return True
    return False

async def handle_websocket(websocket, path):
    print(f"Client connected: {websocket.remote_address}")
    
    try:
        async for message in websocket:
            data = json.loads(message)
            action = data.get('action')
            
            if action == 'create_room':
                room_id = data.get('room_id')
                player_name = data.get('player_name', 'Player')
                
                if room_id in rooms:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': f'Phòng {room_id} đã tồn tại!'
                    }))
                    continue
                
                rooms[room_id] = {
                    'players': [{'ws': websocket, 'name': player_name, 'symbol': 'X'}],
                    'board': create_board(),
                    'current_turn': 0,
                    'game_started': False
                }
                
                await websocket.send(json.dumps({
                    'type': 'room_created',
                    'room_id': room_id,
                    'symbol': 'X',
                    'message': f'🏠 Phòng {room_id} đã được tạo! Đang chờ đối thủ...'
                }))
                print(f"Room {room_id} created by {player_name}")
            
            elif action == 'join_room':
                room_id = data.get('room_id')
                player_name = data.get('player_name', 'Player')
                
                if room_id not in rooms:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': f'Không tìm thấy phòng {room_id}!'
                    }))
                    continue
                
                room = rooms[room_id]
                if len(room['players']) >= 2:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': f'Phòng {room_id} đã đầy!'
                    }))
                    continue
                
                # Add second player
                room['players'].append({'ws': websocket, 'name': player_name, 'symbol': 'O'})
                room['game_started'] = True
                
                # Notify joining player
                await websocket.send(json.dumps({
                    'type': 'room_joined',
                    'room_id': room_id,
                    'symbol': 'O',
                    'message': f'🚪 Đã tham gia phòng {room_id}!'
                }))
                
                # Notify first player
                creator = room['players'][0]
                await creator['ws'].send(json.dumps({
                    'type': 'opponent_joined',
                    'message': f'🎉 {player_name} đã tham gia! Trận đấu sắp bắt đầu...'
                }))
                
                # Start game
                await asyncio.sleep(1)
                for player in room['players']:
                    await player['ws'].send(json.dumps({
                        'type': 'game_start',
                        'message': f'🎮 Trận đấu bắt đầu! {creator["name"]} (X) đi trước',
                        'current_player': 'X'
                    }))
                
                print(f"Game started in room {room_id}: {creator['name']} vs {player_name}")
            
            elif action == 'make_move':
                room_id = data.get('room_id')
                row = data.get('row')
                col = data.get('col')
                
                if room_id not in rooms:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': 'Không tìm thấy phòng!'
                    }))
                    continue
                
                room = rooms[room_id]
                
                # Find player
                player_index = None
                for i, player in enumerate(room['players']):
                    if player['ws'] == websocket:
                        player_index = i
                        break
                
                if player_index is None:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': 'Không tìm thấy người chơi!'
                    }))
                    continue
                
                if not room['game_started']:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': 'Game chưa bắt đầu!'
                    }))
                    continue
                
                if player_index != room['current_turn']:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': 'Chưa đến lượt bạn!'
                    }))
                    continue
                
                if room['board'][row][col] is not None:
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'message': 'Ô đã được chọn!'
                    }))
                    continue
                
                # Make move
                player = room['players'][player_index]
                symbol = player['symbol']
                room['board'][row][col] = symbol
                
                # Check winner
                if check_winner(room['board'], row, col, symbol):
                    # Game over
                    for p in room['players']:
                        await p['ws'].send(json.dumps({
                            'type': 'game_over',
                            'winner': player['name'],
                            'symbol': symbol,
                            'row': row,
                            'col': col,
                            'message': f'🎉 {player["name"]} ({symbol}) thắng!'
                        }))
                    room['game_started'] = False
                else:
                    # Continue game
                    room['current_turn'] = 1 - room['current_turn']
                    next_player = room['players'][room['current_turn']]
                    
                    for p in room['players']:
                        await p['ws'].send(json.dumps({
                            'type': 'move_made',
                            'row': row,
                            'col': col,
                            'symbol': symbol,
                            'current_player': next_player['symbol'],
                            'message': f'{next_player["name"]} ({next_player["symbol"]}) lượt đi'
                        }))
                
                print(f"Move in room {room_id}: ({row}, {col}) by {player['name']}")
    
    except websockets.exceptions.ConnectionClosed:
        print(f"Client disconnected: {websocket.remote_address}")
        # Remove player from rooms
        for room_id, room in list(rooms.items()):
            for i, player in enumerate(room['players']):
                if player['ws'] == websocket:
                    room['players'].pop(i)
                    if not room['players']:
                        del rooms[room_id]
                        print(f"Removed empty room {room_id}")
                    else:
                        # Notify remaining player
                        for p in room['players']:
                            await p['ws'].send(json.dumps({
                                'type': 'player_left',
                                'message': 'Đối thủ đã rời khỏi phòng!'
                            }))
                    break

def start_http_server():
    os.chdir('/workspace/project-tic-tac-toe/static')
    httpd = HTTPServer(('localhost', 8000), SimpleHTTPRequestHandler)
    print("HTTP Server running on http://localhost:8000")
    httpd.serve_forever()

async def start_websocket_server():
    print("WebSocket Server starting on ws://localhost:8001")
    await websockets.serve(handle_websocket, 'localhost', 8001)

def main():
    # Start HTTP server in a separate thread
    http_thread = threading.Thread(target=start_http_server, daemon=True)
    http_thread.start()
    
    # Start WebSocket server
    asyncio.get_event_loop().run_until_complete(start_websocket_server())
    asyncio.get_event_loop().run_forever()

if __name__ == '__main__':
    main()