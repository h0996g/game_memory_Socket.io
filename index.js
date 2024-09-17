const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

let rooms = {};

function generateGameState() {
    const numbers = Array.from({ length: 16 }, (_, i) => Math.floor(i / 2) + 1);
    shuffleArray(numbers);
    return {
        numbers: numbers,
        flipped: Array(16).fill(false),
        scorePlayer1: 0,
        scorePlayer2: 0,
        currentPlayer: 1,
        steps: 0
    };
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

io.on('connection', (socket) => {
    console.log('A user connected with ID:', socket.id);

    socket.on('createRoom', (data) => {
        const roomId = Math.random().toString(36).substring(7);
        rooms[roomId] = {
            creator: socket.id,
            players: [socket.id],
            gameState: null
        };
        socket.join(roomId);
        console.log('Room created:', roomId);
        socket.emit('roomCreated', { roomId: roomId });
    });

    socket.on('joinRoom', (data) => {
        const roomId = data.roomId;
        console.log('Attempt to join room:', roomId);
        if (rooms[roomId] && rooms[roomId].players.length < 2) {
            socket.join(roomId);
            rooms[roomId].players.push(socket.id);

            if (rooms[roomId].players.length === 2) {
                const gameState = generateGameState();
                rooms[roomId].gameState = gameState;

                io.to(rooms[roomId].players[0]).emit('gameJoined', {
                    roomId: roomId,
                    opponentId: rooms[roomId].players[1],
                    isFirstPlayer: true,
                    gameState: gameState
                });
                io.to(rooms[roomId].players[1]).emit('gameJoined', {
                    roomId: roomId,
                    opponentId: rooms[roomId].players[0],
                    isFirstPlayer: false,
                    gameState: gameState
                });
                console.log('Game started in room:', roomId);
            } else {
                socket.emit('waitingForOpponent', { roomId: roomId });
            }
        } else {
            socket.emit('roomJoinError', { message: 'Room not found or full' });
        }
    });

    socket.on('flipCard', (data) => {
        console.log('flipCard event received:', data);
        const roomId = data.roomId;
        const index = data.index;

        if (rooms[roomId] && rooms[roomId].gameState) {
            rooms[roomId].gameState.flipped[index] = true;
            io.to(roomId).emit('gameState', rooms[roomId].gameState);
        } else {
            console.log('Error: Room not found or game not started for flipCard event');
        }
    });

    socket.on('updateGameState', (data) => {
        console.log('updateGameState event received:', data);
        const roomId = data.roomId;

        if (rooms[roomId] && rooms[roomId].gameState) {
            const previousState = rooms[roomId].gameState;
            rooms[roomId].gameState = data;

            const newlyFlippedIndices = data.flipped.reduce((acc, flipped, index) => {
                if (flipped && !previousState.flipped[index]) acc.push(index);
                return acc;
            }, []);

            if (newlyFlippedIndices.length === 2) {
                const [index1, index2] = newlyFlippedIndices;
                if (data.numbers[index1] !== data.numbers[index2]) {
                    rooms[roomId].gameState.flipped[index1] = false;
                    rooms[roomId].gameState.flipped[index2] = false;
                    rooms[roomId].gameState.currentPlayer = 3 - rooms[roomId].gameState.currentPlayer;
                }
            }

            io.to(roomId).emit('gameState', rooms[roomId].gameState);
        } else {
            console.error('Error: Room not found or game not started for updateGameState event');
        }
    });

    socket.on('restartGame', (data) => {
        console.log('restartGame event received:', data);
        const roomId = data.roomId;

        if (rooms[roomId]) {
            const gameState = generateGameState();
            rooms[roomId].gameState = gameState;

            io.to(roomId).emit('gameRestarted', {
                gameState: gameState,
                startingPlayer: 1
            });
            console.log('gameRestarted event emitted to room:', roomId);
        } else {
            console.log('Error: Room not found for restartGame event');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);

        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            if (room.players.includes(socket.id)) {
                const opponentId = room.players.find(id => id !== socket.id);
                if (opponentId) {
                    io.to(opponentId).emit('opponentDisconnected');
                }
                delete rooms[roomId];
                console.log('Room', roomId, 'closed due to player disconnect');
            }
        });
    });
});

app.get('/', (req, res) => {
    res.send('Memory Game Server is running');
});

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});