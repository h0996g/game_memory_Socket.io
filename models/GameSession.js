const mongoose = require('mongoose');

const GameSessionSchema = new mongoose.Schema({
    roomId: { type: String, required: true },
    players: [{ type: String }], // Array of player IDs
    gameState: { type: Object }, // Store the current game state
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('GameSession', GameSessionSchema);