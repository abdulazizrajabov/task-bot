// programmer.js

const dbModule = require('./database');
const { getPriorityIcon } = require('./admin');
const config = require('./config');


// Помощники для удаления/отправки сообщений.
// Храним в userStates идентификатор последнего сообщения, чтобы удалить его.
function sendMessageAndRemember(bot, chatId, text, options, userStates, userId) {
    // Сначала удалим предыдущие сообщения бота, если есть
    if (userStates[userId].lastBotMessageId) {
        try {
            bot.deleteMessage(chatId, userStates[userId].lastBotMessageId);
        } catch (e) {
            // Игнорируем ошибки (например, если сообщение уже удалено)
        }
    }
    return bot.sendMessage(chatId, text, options).then((sentMsg) => {
        userStates[userId].lastBotMessageId = sentMsg.message_id;
    });
}

function showProgrammerMainMenu(bot, chatId, userStates, userId) {
    userStates[userId] = userStates[userId] || {};
    userStates[userId].state = 'PROGRAMMER_MAIN_MENU';

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Мои задачи', callback_data: 'programmer_view_tasks' }],
            ],
        },
    };
    sendMessageAndRemember(bot, chatId, 'Главное меню (Программист):', options, userStates, userId);
}

// Меню выбора приоритета (шаг 1)
function showProgrammerTaskFilters(bot, chatId, userStates, userId) {
    userStates[userId].state = 'PROGRAMMER_FILTER';

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Все мои задачи', callback_data: 'programmer_filter_ALL' }],
                [
                    { text: '🔴 Красный',   callback_data: 'programmer_filter_Красный' },
                    { text: '🟠 Оранжевый', callback_data: 'programmer_filter_Оранжевый' },
                ],
                [
                    { text: '🟡 Желтый', callback_data: 'programmer_filter_Желтый' },
                    { text: '🟢 Зеленый', callback_data: 'programmer_filter_Зеленый' },
                    { text: '🔵 Синий',   callback_data: 'programmer_filter_Синий' },
                ],
                [
                    { text: 'Назад', callback_data: 'programmer_back_to_main' },
                ],
            ],
        },
    };
    sendMessageAndRemember(bot, chatId, 'Выберите приоритет (фильтрация ваших задач):', options, userStates, userId);
}

// Список задач (шаг 2)
function filterTasksForProgrammer(bot, chatId, userStates, userId, priority) {
    userStates[userId].state = 'PROGRAMMER_TASK_LIST';

    let filters = { assigned_to: userId, archived: 0 };
    if (priority !== 'ALL') filters.priority = priority;

    dbModule.getTasks(filters, (err, tasks) => {
        if (err) {
            sendMessageAndRemember(bot, chatId, 'Ошибка при получении задач.', {}, userStates, userId);
            return;
        }
        if (!tasks || tasks.length === 0) {
            sendMessageAndRemember(bot, chatId, 'Нет задач по выбранному фильтру.', {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Назад', callback_data: 'programmer_back_to_filter' }],
                    ],
                },
            }, userStates, userId);
            return;
        }

        let msgText = 'Ваши задачи:\n\n';
        const inlineKeyboard = [];

        tasks.forEach((task) => {
            const icon = getPriorityIcon(task.priority);
            msgText += `#${task.id}\n`;
            msgText += `Название: ${task.title}\n`;
            msgText += `Описание: ${task.description}\n`;
            msgText += `Приоритет: ${icon} ${task.priority}\n`;
            msgText += `Статус: ${task.status}\n`;
            msgText += `\n`;

            // Кнопка закрыть, если «Не выполнено»
            if (task.status === 'Не выполнено') {
                inlineKeyboard.push([
                    { text: `Закрыть #${task.id}`, callback_data: `programmer_close_${task.id}` },
                ]);
            }
        });

        // Добавим кнопку назад
        inlineKeyboard.push([{ text: 'Назад', callback_data: 'programmer_back_to_filter' }]);

        sendMessageAndRemember(
            bot,
            chatId,
            msgText,
            { reply_markup: { inline_keyboard: inlineKeyboard } },
            userStates,
            userId
        );
    });
}

// Закрыть задачу
function closeTask(bot, chatId, userStates, userId, taskId) {
    dbModule.updateTask(taskId, { status: 'Выполнено', archived: 1 }, (err) => {
        if (err) {
            sendMessageAndRemember(bot, chatId, 'Ошибка при закрытии задачи.', {}, userStates, userId);
            return;
        }
        // Сообщаем программисту
        sendMessageAndRemember(bot, chatId, `Задача #${taskId} закрыта и отправлена в архив.`, {}, userStates, userId);

        // Отправляем сообщение в канал архива
        dbModule.getTaskById(taskId, (errTask, task) => {
            if (errTask || !task) return;
            dbModule.getUserById(task.assigned_to, (errUser, user) => {
                const assignedName = (user && user.name) ? user.name : '—';
                const icon = getPriorityIcon(task.priority);
                const archiveText =
                    `Задача #${task.id} завершена:\n` +
                    `Название: ${task.title}\n` +
                    `Описание: ${task.description}\n` +
                    `Приоритет: ${icon} ${task.priority}\n` +
                    `Исполнитель: ${assignedName}\n` +
                    `Время закрытия: ${new Date().toLocaleString()}\n`;

                // Кнопка «Отменить действие»
                const opts = {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: 'Отменить действие', callback_data: `unarchive_${task.id}` },
                            ],
                        ],
                    },
                };
                bot.sendMessage(process.env.ARCHIVE_CHANNEL_ID || config.ARCHIVE_CHANNEL_ID, archiveText, opts);
            });
        });
    });
}

module.exports = {
    showProgrammerMainMenu,
    showProgrammerTaskFilters,
    filterTasksForProgrammer,
    closeTask,
    sendMessageAndRemember,
};
