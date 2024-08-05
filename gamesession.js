function createGameSession() {
	return {
		players: [],
		scores: {},
		lastCity: null,
		usedCities: new Set(),
		joinTimer: null,
		gameStarted: false,
		joinStartTime: null,
		joinDuration: 30000,
		updateInterval: null,
		inactivityTimer: null,
		inactivityDuration: 300000,
	};
}

module.exports = { createGameSession };
