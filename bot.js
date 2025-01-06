// bot.js

const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');

const config = require('./config');
const dbModule = require('./database');

// Подключаем модули логики
const admin = require('./admin');
const programmer = require('./programmer');

// Состояния пользователей
const userStates = {};

// Инициализация бота
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });


bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // 1) Сначала проверяем, пустая ли таблица users
    dbModule.getAllUsers((err, users) => {
        if (err) {
            bot.sendMessage(chatId, 'Ошибка при чтении из БД.');
            return;
        }

        // Если таблица пустая (нет ни одного пользователя)
        if (users.length === 0) {
            // И если userId есть в списке config.ADMINS, добавляем его в базу как админа
            if (config.ADMINS.includes(userId)) {
                dbModule.addUser(userId, msg.from.first_name || 'Admin', 'admin', (errAdd) => {
                    if (errAdd) {
                        bot.sendMessage(chatId, 'Ошибка при добавлении первого админа.');
                    } else {
                        bot.sendMessage(chatId, 'Вы успешно добавлены как первый администратор!');
                        // После этого продолжаем обычную логику
                        showMenuOrSomething(chatId, userId);
                    }
                });
            } else {
                // Если база пуста, а пользователь не в списке config.ADMINS —
                // можно либо отказать, либо просто сказать: «У нас нет администраторов».
                bot.sendMessage(chatId, 'База пуста, но вы не являетесь администратором. Обратитесь к тому, кто прописан в конфиге.');
            }
        } else {
            // Если база не пуста — продолжаем обычную логику
            showMenuOrSomething(chatId, userId);
        }
    });
});

// Далее обычная логика
function showMenuOrSomething(chatId, userId) {
    // Получаем пользователя из БД (он уже там должен быть, если не первый старт)
    dbModule.getUserById(userId, (err, user) => {
        if (err || !user) {
            // Пользователя нет в БД → выводим сообщение
            // (например, «Вы не зарегистрированы в системе» или «Обратитесь к администратору»)
            return bot.sendMessage(chatId, 'Вы не зарегистрированы в системе. Обратитесь к администратору.');
        }

        // Если нашли пользователя
        if (user.role === 'admin') {
            admin.showAdminMainMenu(bot, chatId);
        } else {
            programmer.showProgrammerMainMenu(bot, chatId, userStates, userId);
        }
    });
}


// ----------- Обработчик всех callback_query -----------
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    dbModule.getUserById(userId, (err, user) => {
        if (err || !user) {
            bot.sendMessage(chatId, 'Ошибка: пользователь не найден в БД.');
            return;
        }

        // Общее: unarchive (только админ)
        if (data.startsWith('unarchive_')) {
            if (!admin.isAdmin(userId)) {
                bot.sendMessage(chatId, 'Недостаточно прав для отмены действия.');
                return;
            }
            const taskId = data.replace('unarchive_', '');
            admin.unarchiveTask(bot, chatId, taskId);
            return;
        }

        // ----- ЛОГИКА АДМИНИСТРАТОРА -----
        if (admin.isAdmin(userId)) {
            switch (data) {
                case 'add_task':
                    userStates[userId] = { state: 'admin_adding_title' };
                    bot.sendMessage(chatId, 'Введите название задачи:');
                    return;

                case 'view_tasks_admin':
                    admin.showAdminTaskFilters(bot, chatId);
                    return;

                case 'manage_users':
                    admin.showUserManagementMenu(bot, chatId);
                    return;

                case 'add_programmer':
                    userStates[userId] = { state: 'admin_adding_programmer' };
                    bot.sendMessage(chatId, 'Отправьте строку: TelegramID Имя\nНапример: 12345 Иван');
                    return;

                case 'list_users':
                    dbModule.getAllUsers((errUsers, users) => {
                        if (errUsers) {
                            bot.sendMessage(chatId, 'Ошибка при получении пользователей.');
                            return;
                        }
                        if (!users || users.length === 0) {
                            bot.sendMessage(chatId, 'Пользователи не найдены.');
                            return;
                        }
                        let text = 'Список пользователей:\n\n';
                        users.forEach(u => {
                            text += `ID: ${u.id}, Имя: ${u.name}, Роль: ${u.role}\n`;
                        });
                        bot.sendMessage(chatId, text);
                    });
                    return;

                default:
                    // Фильтр задач для админа
                    if (data.startsWith('filter_priority_')) {
                        const priority = data.replace('filter_priority_', '');
                        admin.filterTasksForAdmin(bot, chatId, priority);
                        return;
                    }
            }
        }

        // ----- ЛОГИКА ПРОГРАММИСТА (и админа в роли исполнителя) -----
        if (user.role === 'programmer' || user.role === 'admin') {
            if (data === 'programmer_view_tasks') {
                programmer.showProgrammerTaskFilters(bot, chatId, userStates, userId);
                return;
            }
            if (data === 'programmer_back_to_main') {
                programmer.showProgrammerMainMenu(bot, chatId, userStates, userId);
                return;
            }
            if (data === 'programmer_back_to_filter') {
                programmer.showProgrammerTaskFilters(bot, chatId, userStates, userId);
                return;
            }
            // Фильтр задач
            if (data.startsWith('programmer_filter_')) {
                const priority = data.replace('programmer_filter_', '');
                if (priority === 'ALL') {
                    programmer.filterTasksForProgrammer(bot, chatId, userStates, userId, 'ALL');
                } else {
                    programmer.filterTasksForProgrammer(bot, chatId, userStates, userId, priority);
                }
                return;
            }
            // Закрытие задачи
            if (data.startsWith('programmer_close_')) {
                const taskId = data.replace('programmer_close_', '');
                programmer.closeTask(bot, chatId, userStates, userId, taskId);
                return;
            }
        }
    });
});

// ----------- Обработчик текстовых сообщений -----------
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    dbModule.getUserById(userId, (err, user) => {
        if (err || !user) {
            bot.sendMessage(chatId, 'Ошибка: вы не найдены в БД.');
            return;
        }

        // Если нет userStates[userId], значит не ждём ничего конкретного → нежданный сценарий
        if (!userStates[userId]) {
            // Возвращаем в главное меню
            if (admin.isAdmin(userId)) {
                admin.showAdminMainMenu(bot, chatId);
            } else {
                programmer.showProgrammerMainMenu(bot, chatId, userStates, userId);
            }
            return;
        }

        // --------- Состояния АДМИНА ---------
        const state = userStates[userId].state;
        if (state === 'admin_adding_title') {
            userStates[userId].title = text;
            userStates[userId].state = 'admin_adding_description';
            bot.sendMessage(chatId, 'Введите описание задачи:');
            return;
        }
        if (state === 'admin_adding_description') {
            userStates[userId].description = text;
            userStates[userId].state = 'admin_adding_priority';
            const options = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '🔴 Красный',   callback_data: 'admin_priority_Красный' },
                            { text: '🟠 Оранжевый', callback_data: 'admin_priority_Оранжевый' },
                            { text: '🟡 Желтый',   callback_data: 'admin_priority_Желтый' },
                        ],
                        [
                            { text: '🟢 Зеленый', callback_data: 'admin_priority_Зеленый' },
                            { text: '🔵 Синий',   callback_data: 'admin_priority_Синий' },
                        ],
                    ],
                },
            };
            bot.sendMessage(chatId, 'Выберите приоритет задачи:', options);
            return;
        }
        if (state === 'admin_adding_programmer') {
            const parts = text.split(' ');
            if (parts.length < 2) {
                bot.sendMessage(chatId, 'Нужно ввести: ID Имя\nНапример: 12345 Иван');
                return;
            }
            const newUserId = parts[0];
            const newUserName = parts.slice(1).join(' ');
            dbModule.addUser(newUserId, newUserName, 'programmer', (errAdd) => {
                if (errAdd) {
                    bot.sendMessage(chatId, 'Ошибка при добавлении. Возможно, ID уже занят.');
                    return;
                }
                bot.sendMessage(chatId, `Добавлен программист: ${newUserName} (ID: ${newUserId}).`);
            });
            delete userStates[userId];
            return;
        }

        // -------- Если ничего не подошло, «нежданный сценарий» -----
        if (!state.startsWith('admin_adding_')) {
            // Возвращаем на главное меню
            if (admin.isAdmin(userId)) {
                admin.showAdminMainMenu(bot, chatId);
            } else {
                programmer.showProgrammerMainMenu(bot, chatId, userStates, userId);
            }
        }
    });
});

// ----- Обработчик callback_query для приоритета (админ добавляет задачу) -----
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (userStates[userId] && userStates[userId].state === 'admin_adding_priority') {
        if (data.startsWith('admin_priority_')) {
            const priority = data.replace('admin_priority_', '');
            userStates[userId].priority = priority;
            userStates[userId].state = 'admin_adding_assignee';

            // Получаем список исполнителей
            dbModule.getAllUsers((err, users) => {
                if (err || !users) {
                    bot.sendMessage(chatId, 'Ошибка при получении пользователей.');
                    return;
                }
                // Предлагаем выбрать кому назначить
                const inlineKeyboard = users.map(u => ([
                    { text: `${u.name} (${u.role})`, callback_data: `admin_assign_${u.id}` }
                ]));
                bot.sendMessage(chatId, 'Выберите исполнителя задачи:', {
                    reply_markup: { inline_keyboard: inlineKeyboard },
                });
            });
        }
    } else if (userStates[userId] && userStates[userId].state === 'admin_adding_assignee') {
        if (data.startsWith('admin_assign_')) {
            const assignedId = data.replace('admin_assign_', '');
            const { title, description, priority } = userStates[userId];
            admin.addTaskToDB(bot, chatId, title, description, priority, assignedId, () => {
                delete userStates[userId]; // Сброс
            });
        }
    }
});

// -------------------- Ежедневные напоминания (9:00 и 18:00) --------------------
schedule.scheduleJob('0 9 * * *', () => {
    sendDailyReminders();
});
schedule.scheduleJob('0 18 * * *', () => {
    sendDailyReminders();
});

function sendDailyReminders() {
    dbModule.getAllUsers((err, users) => {
        if (err || !users) return;
        users.forEach(user => {
            if (user.role === 'programmer' || user.role === 'admin') {
                dbModule.getTasks({ assigned_to: user.id, archived: 0 }, (errT, tasks) => {
                    if (errT || !tasks || tasks.length === 0) return;
                    let txt = `Напоминание! У вас ${tasks.length} невыполненных задач:\n\n`;
                    tasks.forEach(t => {
                        txt += `- [#${t.id}] ${t.title} (${t.priority})\n`;
                    });
                    bot.sendMessage(user.id, txt);
                });
            }
        });
    });
}



console.log('Бот запущен. Ожидаю сообщения...');
