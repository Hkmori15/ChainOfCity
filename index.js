require('dotenv').config();
const { Bot } = require('grammy');
const citiesData = require('./cities.json');
const { updateJoinTimer } = require('./join_updater');
const keep_alive = require('./keep_alive');

const bot = new Bot(process.env.BOT_TOKEN, { users: true });

const activePlayers = new Set();
const userInfo = {};
const playerScores = {};
const MAX_SCORE = 15;
const notifiedPlayers = new Set();

let isGameActive = false;
let gameEndMessageSent = false;
let joinPhase = false;
let joinTimer = null;
let currentCity = '';
let usedCities = new Set();

bot.command('help', ctx => {
	const helpMessage = `
	Добро пожаловать в игру "Города" 🌃!

	Доступные команды 🔗:
	/start -- Начать игру
	/join -- Присоединиться к игре
	/help -- Показать это сообщение

	Правила игры ☕️:
	1. Каждый новый город должен начинаться на последнюю букву предыдущего города.
	2. Нельзя повторять города, которые уже были названы.
	3. Игра продолжается до тех пор, пока не будет достигнуто определенное количество очков -- 15 (Когда нибудь сделаю это кастомным).
	4. Называть существующие города.

	Удачи и веселой игры! 🍪`;

	ctx.reply(helpMessage);
});

bot.command('start', async ctx => {
	isGameActive = true;
	gameEndMessageSent = false;
	currentCity = '';
	usedCities.clear();
	activePlayers.clear();
	Object.keys(playerScores).forEach(key => delete playerScores[key]);

	const message =
		'Игра в "Города" начинается! Используйте команду /join, чтобы присоединиться';
	const sentMessage = await ctx.reply(message);
	const endTime = Date.now() + 60000;

	updateJoinTimer(ctx.api, sentMessage, message, endTime);

	joinPhase = true;
	notifiedPlayers.clear();

	joinTimer = setTimeout(() => {
		joinPhase = false;
		isGameActive = activePlayers.size > 0;
		ctx.reply(
			isGameActive
				? 'Время для присоединения истекло. Игра начинается!'
				: 'Никто не присоединился. Игра отменена'
		);
	}, 60000);
});

bot.command('join', ctx => {
	const userId = ctx.from.id;
	const username = ctx.from.username || ctx.from.first_name;

	if (isGameActive && joinTimer) {
		activePlayers.add(userId);
		userInfo[userId] = username;
		playerScores[userId] = 0;
		ctx.reply(`${username}, присоединился к игре!`);
	} else if (!joinTimer) {
		ctx.reply('Время для присоединения истекло');
	} else {
		ctx.reply('Игра еще не началась. Дождитесь команды /start');
	}
});

function cityExists(cityName) {
	return citiesData.city.some(
		cityObj => cityObj.name.toLowerCase() === cityName.toLowerCase()
	);
}

function getLastSignificantLetter(city) {
	const reversedCity = city.split('').reverse();

	for (let letter of reversedCity) {
		if (letter !== 'ь' && letter !== 'ъ') {
			return letter;
		}
	}

	return city[0];
}

function checkGameEnd(ctx) {
	const userId = ctx.from.id;
	const currentScore = Number(playerScores[userId]) || 0;

	if (currentScore >= MAX_SCORE && !gameEndMessageSent) {
		const leaderboard = Object.entries(playerScores)
			.sort(([, a], [, b]) => b - a)
			.map(([id, score], index) => {
				const username = userInfo[id] || 'Аноним';
				return `${index + 1}. ${username}: ${score} очков`;
			})

			.join('\n');

		ctx.reply(`Игра окончена! Результаты:\n${leaderboard}`);

		gameEndMessageSent = true;
		isGameActive = false;

		return true;
	}

	return false;
}

bot.on('message:text', ctx => {
	const userId = ctx.from.id;
	const city = ctx.message.text.trim().toLowerCase();

	if (!isGameActive || !activePlayers.has(userId)) {
		return;
	}

	if (joinPhase) {
		if (!notifiedPlayers.has(userId)) {
			ctx.reply('Пожалуйста, дождитесь окончания фазы присоединения игроков');
			notifiedPlayers.add(userId);
		}
		return;
	}

	if (playerScores[userId === undefined]) {
		playerScores[userId] = 0;
	}

	if (!cityExists(city)) {
		ctx.reply('Такого города не существует. Попробуйте другой');
		return;
	}

	if (currentCity) {
		const lastLetter = getLastSignificantLetter(currentCity);
		if (city[0] !== lastLetter) {
			ctx.reply(
				`Город должен начинаться на букву "${currentCity[
					currentCity.length - 1
				].toUpperCase()}"`
			);
			return;
		}
	}

	if (usedCities.has(city)) {
		ctx.reply('Этот город уже был назван. Попробуйте другой');
		return;
	}

	userInfo[userId] = ctx.from.username || ctx.from.first_name;
	playerScores[userId] = (playerScores[userId] || 0) + 1;
	const currentScore = playerScores[userId];

	if (isGameActive && checkGameEnd(ctx)) {
		return;
	}

	const nextLetter = getLastSignificantLetter(city);
	usedCities.add(city);
	currentCity = city;
	ctx.reply(
		`Отлично! +1 очко. Ваш текущий счет: ${currentScore}. Теперь назовите город на букву "${nextLetter.toUpperCase()}"`
	);
});

bot.start();
keep_alive();
