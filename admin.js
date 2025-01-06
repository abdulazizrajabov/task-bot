// admin.js

const dbModule = require('./database');
const config = require('./config');

function isAdmin(userId) {
    return config.ADMINS.includes(userId);
}

function getPriorityIcon(priority) {
    switch (priority) {
        case 'Красный': return '🔴';
        case 'Оранжевый': return '🟠';
        case 'Желтый':   return '🟡';
        case 'Зеленый':  return '🟢';
        case 'Синий':    return '🔵';
        default:         return '';
    }
}

// Показать меню администратора
function showAdminMainMenu(bot, chatId) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: 'Добавить задачу', callback_data: 'add_task' },
                    { text: 'Просмотреть задачи', callback_data: 'view_tasks_admin' },
                ],
                [
                    { text: 'Управление пользователями', callback_data: 'manage_users' },
                ],
            ],
        },
    };
    bot.sendMessage(chatId, 'Выберите действие (Администратор):', options);
}

// Показать фильтры для задач
function showAdminTaskFilters(bot, chatId) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Все задачи', callback_data: 'filter_priority_ALL' }],
                [
                    { text: '🔴 Красный', callback_data: 'filter_priority_Красный' },
                    { text: '🟠 Оранжевый', callback_data: 'filter_priority_Оранжевый' },
                ],
                [
                    { text: '🟡 Желтый', callback_data: 'filter_priority_Желтый' },
                    { text: '🟢 Зеленый', callback_data: 'filter_priority_Зеленый' },
                    { text: '🔵 Синий', callback_data: 'filter_priority_Синий' },
                ],
            ],
        },
    };
    bot.sendMessage(chatId, 'Выберите приоритет (отображаем только НЕархивные задачи):', options);
}

// Отобразить список задач для админа
function filterTasksForAdmin(bot, chatId, priority) {
    let filters = { archived: 0 };
    if (priority !== 'ALL') filters.priority = priority;

    dbModule.getTasks(filters, (err, tasks) => {
        if (err) {
            bot.sendMessage(chatId, 'Ошибка при получении задач (admin).');
            return;
        }
        if (!tasks || tasks.length === 0) {
            bot.sendMessage(chatId, 'Нет задач по выбранному фильтру.');
            return;
        }
        dbModule.getAllUsers((errUsers, users) => {
            if (errUsers || !users) {
                bot.sendMessage(chatId, 'Ошибка при получении пользователей.');
                return;
            }
            const userMap = {};
            users.forEach(u => { userMap[u.id] = u.name; });

            let msgText = 'Список задач:\n\n';
            tasks.forEach(task => {
                const assignedName = userMap[task.assigned_to] || '—';
                msgText += `ID: ${task.id}\n`;
                msgText += `Название: ${task.title}\n`;
                msgText += `Описание: ${task.description}\n`;
                msgText += `Приоритет: ${getPriorityIcon(task.priority)} ${task.priority}\n`;
                msgText += `Статус: ${task.status}\n`;
                msgText += `Исполнитель: ${assignedName}\n`;
                msgText += `Создана: ${task.created_at}\n`;
                msgText += `---\n`;
            });
            bot.sendMessage(chatId, msgText);
        });
    });
}

// Добавить задачу в БД
function addTaskToDB(bot, chatId, title, description, priority, assignedTo, callback) {
    dbModule.addTask(title, description, priority, assignedTo, (err, taskId) => {
        if (err) {
            bot.sendMessage(chatId, 'Ошибка при добавлении задачи.');
            if (callback) callback(err);
        } else {
            bot.sendMessage(chatId, `Задача #${taskId} успешно добавлена!`);

            // Уведомляем исполнителя
            const icon = getPriorityIcon(priority);
            const text =
                `⚠️ Sizga yangi vazifa biriktirildi!\n` +
                `👉 Vazifaning nomi: ${title}\n` +
                `👉 Tavsif: ${description}\n` +
                `👉 Ustuvorlik: ${icon} ${priority}`;

            dbModule.getUserById(assignedTo, (errUser, user) => {
                if (!errUser && user) {
                    bot.sendMessage(assignedTo, text);
                }
            });

            if (callback) callback(null, taskId);
        }
    });
}

// Разархивировать (вернуть задачу на доработку)
function unarchiveTask(bot, chatId, taskId) {
    dbModule.getTaskById(taskId, (errTask, task) => {
        if (errTask || !task) {
            bot.sendMessage(chatId, 'Задача не найдена или ошибка БД при unarchive.');
            return;
        }
        dbModule.updateTask(taskId, { status: 'Не выполнено', archived: 0 }, (errUpdate) => {
            if (errUpdate) {
                bot.sendMessage(chatId, 'Ошибка при возвращении задачи из архива.');
                return;
            }
            bot.sendMessage(chatId, `Задача #${taskId} возвращена из архива в список активных.`);

            // Отправляем уведомление исполнителю
            if (task.assigned_to) {
                bot.sendMessage(
                    task.assigned_to,
                    `💩 №${taskId} topshirigʻi qayta koʻrib chiqish uchun qaytarildi. Ushbu topshiriqni "Mening topshiriqlarim" bo'limidan topasiz`
                );
            }
        });
    });
}

function showUserManagementMenu(bot, chatId) {
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Добавить программиста', callback_data: 'add_programmer' }],
                [{ text: 'Просмотреть всех пользователей', callback_data: 'list_users' }],
            ],
        },
    };
    bot.sendMessage(chatId, 'Управление пользователями:', options);
}

module.exports = {
    isAdmin,
    getPriorityIcon,
    showAdminMainMenu,
    showAdminTaskFilters,
    filterTasksForAdmin,
    addTaskToDB,
    unarchiveTask,
    showUserManagementMenu,
};
