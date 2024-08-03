function updateJoinTimer(api, message, text, endTime) {
	const remainingTime = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
	const updatedText = `${text}\nОсталось времени: ${remainingTime} сек.`;

	if (updatedText.trim() !== '') {
		editMessageWithRetry(api, message.chat.id, message.message_id, updatedText);
	}

	if (remainingTime > 0) {
		setTimeout(() => updateJoinTimer(api, message, text, endTime), 3000);
	}
}

async function editMessageWithRetry(
	api,
	chatId,
	messageId,
	text,
	retryCount = 0
) {
	try {
		await api.editMessageText(chatId, messageId, text);
	} catch (error) {
		if (error.error_code === 429 && retryCount < 5) {
			const delay = Math.pow(2, retryCount) * 1000;
			await new Promise(resolve => setTimeout(resolve, delay));
			await editMessageWithRetry(api, chatId, messageId, text, retryCount + 1);
		} else {
			console.error('Failed to edit message:', error);
		}
	}
}

module.exports = { updateJoinTimer };
