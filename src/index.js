require('dotenv').config();
const { Bot, session } = require('grammy');
const DataCities = require('./cities.json').city;
const { createGameSession } = require('./gamesession');
const Achievement = require('../models/achievement');
const keep_alive = require('./keep_alive');

const bot = new Bot(process.env.BOT_TOKEN);

const gameStore = new Map();
const cityNames = new Set(DataCities.map(city => city.name.toLowerCase()));

bot.use(
	session({
		initial: () => ({ gameSession: null }),
		getSessionKey: ctx => ctx.chat?.id.toString(),
	})
);

const ACHIEVEMENTS = {
	CITIES_100: {
		name: 'Географ',
		description: 'Назвал 100 городов.',
		threshold: 100,
	},
	CITIES_500: {
		name: 'Геополитик',
		description: 'Назвал 500 городов.',
		threshold: 500,
	},
	WINS_10: { name: 'Чемпион', description: 'Победил 10 раз.', threshold: 10 },
};

async function checkAchievements(ctx, playerName) {
	const userId = ctx.from.id.toString();
	let achievement = await Achievement.findOne({ userId });

	if (!achievement) {
		achievement = new Achievement({ userId });
	}

	if (achievement) {
		achievement.citiesNamed++;
	}

	if (achievement.citiesNamed === ACHIEVEMENTS.CITIES_100.threshold) {
		ctx.reply(
			`🎉 ${playerName} получает достижение "${ACHIEVEMENTS.CITIES_100.name}"!`
		);
	}

	if (achievement.citiesNamed === ACHIEVEMENTS.CITIES_500.threshold) {
		ctx.reply(
			`🎉 ${playerName} получает достижение "${ACHIEVEMENTS.CITIES_500.name}"!`
		);
	}

	if (ctx.session.gameSession.scores[playerName] >= 15) {
		achievement.consecutiveWins++;

		if (achievement.consecutiveWins === ACHIEVEMENTS.WINS_10.threshold) {
			ctx.reply(
				`🎉 ${playerName} получает достижение "${ACHIEVEMENTS.WINS_10.name}"!`
			);
		} else {
			achievement.consecutiveWins = 0;
		}
	}

	await achievement.save();
}

async function updateWinnerAchievement(ctx, winnerName, hasScore) {
	const userId = ctx.from.id.toString();
	let achievement = await Achievement.findOne({ userId });

	if (!achievement) {
		achievement = new Achievement({ userId });
	}

	if (hasScore) {
		achievement.wins++;
		achievement.consecutiveWins++;
	} else {
		achievement.consecutiveWins = 0;
	}

	await achievement.save();

	if (achievement.wins % 10 === 0) {
		ctx.reply(`🎉 ${winnerName} достиг ${achievement.wins} побед!`);
	}

	if (achievement.wins % 50 === 0) {
		ctx.reply(`🎉 ${winnerName} достиг ${achievement.wins} побед!`);
	}

	if (achievement.wins % 100 === 0) {
		ctx.reply(`🎉 ${winnerName} достиг ${achievement.wins} побед!`);
	}

	if (achievement.wins % 500 === 0) {
		ctx.reply(`🎉 ${winnerName} достиг ${achievement.wins} побед!`);
	}
}

bot.command('help', ctx => {
	const helpMessage = `
	Добро пожаловать в игру "Города" 🌃!

	Доступные команды 🔗:
	/start -- Начать игру.
	/join -- Присоединиться к игре.
	/help -- Показать это сообщение.
	/leave -- Покинуть игру во время фазы присоединения.
	/mystats -- Показать статистику игрока.
	/showachievements -- Показать список достижений.

	Правила игры ☕️:
	1. Каждый новый город должен начинаться на последнюю букву предыдущего города.
	2. Нельзя повторять города, которые уже были названы.
	3. Игра продолжается до тех пор, пока не будет достигнуто определенное количество очков -- 999 (Когда нибудь сделаю это кастомным).
	4. Называть существующие города.

	Удачи и веселой игры! 🍪`;

	ctx.reply(helpMessage);
});

bot.command('showachievements', ctx => {
	let message = 'Достижения:\n\n';

	for (const [key, value] of Object.entries(ACHIEVEMENTS)) {
		message += `${value.name}: ${value.description}\n`;
		message += `Необходимо: ${value.threshold}\n\n`;
	}

	ctx.reply(message);
});

bot.command('mystats', async ctx => {
	const userId = ctx.from.id.toString();
	const achievement = await Achievement.findOne({ userId });

	if (!achievement) {
		return ctx.reply('У вас еще нет статистики. Сыграйте пару игр.');
	}

	const topCities = achievement.favoriteCities
		.sort((a, b) => b.count - a.count)
		.slice(0, 3)
		.map(c => `${c.city} (${c.count} раз)`)
		.join(', ');

	const message =
		`Статистика игрока: ${ctx.from.first_name}:\n\n` +
		`Названо городов: ${achievement.citiesNamed}\n` +
		`Побед: ${achievement.wins}\n` +
		`Побед подряд: ${achievement.consecutiveWins}\n` +
		`Всего игр: ${achievement.totalGamesPlayed}\n\n` +
		`Любимые города: ${topCities}`;

	ctx.reply(message);
});

bot.command('start', ctx => {
	ctx.reply(
		'Добро пожаловать в игру "Города"! Используйте /join для присоединения к игре.'
	);
});

function startGame(ctx) {
	const game = ctx.session.gameSession;
	if (game.updateInterval) clearInterval(game.updateInterval);
	game.gameStarted = true;
	ctx.reply('Игра началась! Удачи!');
	resetInactivityTimer(ctx);
}

bot.command('join', ctx => {
	const chatId = ctx.chat.id;

	if (!ctx.session.gameSession) {
		ctx.session.gameSession = createGameSession();
	}

	const game = ctx.session.gameSession;

	if (game.gameStarted) {
		return ctx.reply('Игра уже началась. Дождитесь следующей игры.');
	}

	const playerName = ctx.from.first_name;

	if (!game.players.includes(playerName)) {
		game.players.push(playerName);
		game.scores[playerName] = 0;
	}

	if (!game.joinTimer) {
		game.joinStartTime = Date.now();
		game.joinTimer = setTimeout(() => startGame(ctx), game.joinDuration);
		updateJoinMessage(ctx);
	}
});

bot.command('leave', ctx => {
	const game = ctx.session.gameSession;

	if (!game || game.gameStarted) {
		return ctx.reply(
			'Нет активной фазы вступления в игру, из которой можно выйти.'
		);
	}

	const playerName = ctx.from.first_name;
	const playerIndex = game.players.indexOf(playerName);

	if (playerIndex === -1) {
		return ctx.reply('Вы не присоединились к игре.');
	}

	game.players.splice(playerIndex, 1);
	delete game.scores[playerName];

	ctx.reply(`${playerName} вышел из игры.`);

	if (game.players.length === 0) {
		clearTimeout(game.joinTimer);
		ctx.session.gameSession = null;
		return ctx.reply('Все игроки покинули игру. Игра отменена.');
	}

	updateJoinMessage(ctx);
});

function updateJoinMessage(ctx) {
	const game = ctx.session.gameSession;
	const elapsedTime = Date.now() - game.joinStartTime;
	const remainingTime = Math.max(
		0,
		Math.ceil((game.joinDuration - elapsedTime) / 1000)
	);

	ctx
		.reply(
			`Игроки: ${game.players.join(
				', '
			)}\nИгра начнется через ${remainingTime} сек.`
		)
		.then(message => {
			if (game.updateInterval) clearInterval(game.updateInterval);
			game.updateInterval = setInterval(() => {
				const newElapsedTime = Date.now() - game.joinStartTime;
				const newRemainingTime = Math.max(
					0,
					Math.ceil((game.joinDuration - newElapsedTime) / 1000)
				);

				if (newRemainingTime <= 0) {
					clearInterval(game.updateInterval);
					return;
				}

				ctx.api.editMessageText(
					ctx.chat.id,
					message.message_id,
					`Игроки: ${game.players.join(
						', '
					)}\nИгра начнется через ${newRemainingTime} сек.`
				);
			}, 3000);
		});
}

bot.on('message', async ctx => {
	const game = ctx.session.gameSession;
	const city = ctx.message.text.trim().toLowerCase();
	const playerName = ctx.from.first_name;

	if (!ctx.message.text) return;

	if (!game || !game.gameStarted) return;

	if (!game.players.includes(playerName)) return;

	if (isValidCity(city, game)) {
		game.usedCities.add(city);
		game.lastCity = city;
		game.scores[playerName] = (game.scores[playerName] || 0) + 1;

		const userId = ctx.from.id.toString();
		let achievement = await Achievement.findOne({ userId });

		if (!achievement) {
			achievement = new Achievement({ userId });
		}

		achievement.citiesNamed++;

		const cityIndex = achievement.favoriteCities.findIndex(
			c => c.city === city
		);

		if (cityIndex > -1) {
			achievement.favoriteCities[cityIndex].count++;
		} else {
			achievement.favoriteCities.push({ city, count: 1 });
		}

		await achievement.save();

		if (game.scores[playerName] >= 999) {
			return endGame(ctx);
		} else {
			ctx.reply(
				`Отлично, ${playerName} +1 очко.\nТекущий счет: ${
					game.scores[playerName]
				}! Следующий город на букву "${getLastLetter(city).toUpperCase()}".`
			);

			resetInactivityTimer(ctx);
		}

		await checkAchievements(ctx, playerName);

		if (game.inactivityTimer) {
			clearTimeout(game.inactivityTimer);
		}

		game.inactivityTimer = setTimeout(
			() => endGame(ctx, true),
			game.inactivityDuration
		);
	} else {
		ctx.reply('Неверный город или этот город уже называли. Попробуйте снова.');
	}
});

function resetInactivityTimer(ctx) {
	const game = ctx.session.gameSession;

	if (game.inactivityTimer) clearTimeout(game.inactivityTimer);

	game.inactivityTimer = setTimeout(
		() => endGame(ctx, true),
		game.inactivityDuration
	);
}

function isValidCity(city, game) {
	if (game.usedCities.has(city)) return false;
	if (game.lastCity && getLastLetter(game.lastCity) !== city[0]) return false;

	return cityNames.has(city);
}

function getLastLetter(city) {
	const lastChar = city.slice(-1);

	return ['ь', 'ъ', 'ы'].includes(lastChar) ? city[city.length - 2] : lastChar;
}

function getPointsWord(points) {
	if (points === 1) return 'очко';
	if (points >= 2 && points <= 4) return 'очка';
	return 'очков';
}

async function endGame(ctx, inactivity = false) {
	const game = ctx.session.gameSession;
	if (game.inactivityTimer) clearTimeout(game.inactivityTimer);

	const sortedPlayers = Object.entries(game.scores).sort(
		([, a], [, b]) => b - a
	);
	const winner = sortedPlayers[0][0];
	const winnerScore = sortedPlayers[0][1];

	if (inactivity && winnerScore > 0) {
		const userId = ctx.from.id.toString();
		let achievement = await Achievement.findOne({ userId });

		if (!achievement) {
			achievement = new Achievement({ userId });
		}

		achievement.consecutiveWins++;
		await achievement.save();
	}

	updateWinnerAchievement(ctx, winner, winnerScore > 0);

	const leaderboard = Object.entries(game.scores)
		.sort(([, a], [, b]) => b - a)
		.map(
			([name, score], index) =>
				`${index + 1}. ${name}: ${score} ${getPointsWord(score)}`
		)
		.join('\n');

	const endMessage = inactivity
		? 'Игра завершена из-за отсуствия активности.\n'
		: 'Игра окончена!\n';

	ctx.reply(`${endMessage} Результаты:\n${leaderboard}`);
	ctx.session.gameSession = null;
}

bot.start();
