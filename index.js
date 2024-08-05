require('dotenv').config();
const { Bot, session } = require('grammy');
const DataCities = require('./cities.json').city;
const { createGameSession } = require('./gamesession');
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

bot.command('help', ctx => {
	const helpMessage = `
	Добро пожаловать в игру "Города" 🌃!

	Доступные команды 🔗:
	/start -- Начать игру.
	/join -- Присоединиться к игре.
	/help -- Показать это сообщение.
	/leave -- Покинуть игру во время фазы присоединения.

	Правила игры ☕️:
	1. Каждый новый город должен начинаться на последнюю букву предыдущего города.
	2. Нельзя повторять города, которые уже были названы.
	3. Игра продолжается до тех пор, пока не будет достигнуто определенное количество очков -- 999 (Когда нибудь сделаю это кастомным).
	4. Называть существующие города.

	Удачи и веселой игры! 🍪`;

	ctx.reply(helpMessage);
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

bot.on('message', ctx => {
	const game = ctx.session.gameSession;

	if (!game || !game.gameStarted) return;

	const playerName = ctx.from.first_name;

	if (!game.players.includes(playerName)) return;

	const city = ctx.message.text.trim().toLowerCase();

	if (!isValidCity(city, game)) {
		return ctx.reply(
			'Неверный город или этот город уже называли. Попробуйте снова.'
		);
	}

	resetInactivityTimer(ctx);

	game.usedCities.add(city);
	game.lastCity = city;
	game.scores[playerName]++;

	if (game.scores[playerName] >= 999) {
		return endGame(ctx);
	}

	ctx.reply(
		`Отлично, ${playerName} +1 очко.\nТекущий счет: ${
			game.scores[playerName]
		}! Следующий город на букву "${getLastLetter(city).toUpperCase()}".`
	);
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

function endGame(ctx, inactivity = false) {
	const game = ctx.session.gameSession;
	if (game.inactivityTimer) clearTimeout(game.inactivityTimer);

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
