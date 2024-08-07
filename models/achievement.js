const mongoose = require('../src/mongodb');

const achievementSchema = new mongoose.Schema({
	userId: String,
	citiesNamed: { type: Number, default: 0 },
	consecutiveWins: { type: Number, default: 0 },
	wins: { type: Number, default: 0 },
	favoriteCities: [{ city: String, count: Number }],
	totalGamesPlayed: { type: Number, default: 0 },
});

module.exports = mongoose.model('Achievement', achievementSchema);
