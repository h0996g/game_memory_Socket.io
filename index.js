const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

let waitingPlayer = null;
let games = {};

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

    socket.on('joinGame', (data) => {
        console.log('joinGame event received from', socket.id, 'with data:', data);
        const playerId = data.playerId;

        if (waitingPlayer) {
            console.log('Matching', socket.id, 'with waiting player', waitingPlayer.id);
            const gameId = Math.random().toString(36).substring(7);
            socket.join(gameId);
            waitingPlayer.join(gameId);

            const gameState = generateGameState();
            games[gameId] = {
                players: [waitingPlayer.id, socket.id],
                gameState: gameState,
                currentPlayer: 1
            };

            console.log('Emitting gameJoined event to', waitingPlayer.id);
            io.to(waitingPlayer.id).emit('gameJoined', {
                gameId: gameId,
                opponentId: socket.id,
                isFirstPlayer: true,
                gameState: gameState
            });
            console.log('Emitting gameJoined event to', socket.id);
            io.to(socket.id).emit('gameJoined', {
                gameId: gameId,
                opponentId: waitingPlayer.id,
                isFirstPlayer: false,
                gameState: gameState
            });

            waitingPlayer = null;
        } else {
            console.log('No waiting player. ', socket.id, 'is now waiting.');
            waitingPlayer = socket;
            socket.emit('waiting');
        }
    });

    socket.on('flipCard', (data) => {
        console.log('flipCard event received:', data);
        const gameId = data.gameId;
        const index = data.index;

        if (games[gameId]) {
            games[gameId].gameState.flipped[index] = true;

            // Broadcast the updated game state to both players
            io.to(gameId).emit('gameState', games[gameId].gameState);
        } else {
            console.log('Error: Game not found for flipCard event');
        }
    });


    socket.on('updateGameState', (data) => {
        console.log('updateGameState event received:', data);
        const gameId = data.gameId;

        if (games[gameId]) {
            const previousState = games[gameId].gameState;
            games[gameId].gameState = data;

            // Check for newly flipped cards
            const newlyFlippedIndices = data.flipped.reduce((acc, flipped, index) => {
                if (flipped && !previousState.flipped[index]) acc.push(index);
                return acc;
            }, []);

            if (newlyFlippedIndices.length === 2) {
                const [index1, index2] = newlyFlippedIndices;
                if (data.numbers[index1] !== data.numbers[index2]) {
                    // Non-matching pair found
                    games[gameId].gameState.flipped[index1] = false;
                    games[gameId].gameState.flipped[index2] = false;
                    games[gameId].gameState.currentPlayer = 3 - games[gameId].gameState.currentPlayer; // Switch player
                }
                // If it's a matching pair, we don't need to do anything special here
            }

            // Broadcast the updated game state to both players
            io.to(gameId).emit('gameState', games[gameId].gameState);
        } else {
            console.error('Error: Game not found for updateGameState event');
        }
    });

    socket.on('restartGame', (data) => {
        console.log('restartGame event received:', data);
        const gameId = data.gameId;

        if (games[gameId]) {
            const gameState = generateGameState();
            games[gameId].gameState = gameState;
            games[gameId].currentPlayer = 1;

            io.to(gameId).emit('gameRestarted', {
                gameState: gameState,
                startingPlayer: games[gameId].currentPlayer
            });
            console.log('gameRestarted event emitted to game:', gameId);
        } else {
            console.log('Error: Game not found for restartGame event');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }

        Object.keys(games).forEach(gameId => {
            const game = games[gameId];
            if (game.players.includes(socket.id)) {
                const opponentId = game.players.find(id => id !== socket.id);
                io.to(opponentId).emit('opponentDisconnected');
                delete games[gameId];
                console.log('Game', gameId, 'ended due to player disconnect');
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