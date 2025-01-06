// database.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'tasks.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Ошибка при подключении к базе данных:', err);
    } else {
        console.log('Подключено к SQLite базе данных.');
    }
});

db.serialize(() => {
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT,
      status TEXT,
      archived INTEGER DEFAULT 0,
      assigned_to INTEGER,
      created_at TEXT,
      updated_at TEXT
    )
  `);
});

module.exports = {
    getDB: function () {
        return db;
    },

    // --- USER METHODS ---

    addUser: function (telegramId, name, role, callback) {
        const stmt = db.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)');
        stmt.run(telegramId, name, role, function (err) {
            if (callback) callback(err);
        });
        stmt.finalize();
    },

    getUserById: function (telegramId, callback) {
        db.get('SELECT * FROM users WHERE id = ?', [telegramId], (err, row) => {
            callback(err, row);
        });
    },

    getAllUsers: function (callback) {
        db.all('SELECT * FROM users', [], (err, rows) => {
            callback(err, rows);
        });
    },

    // --- TASK METHODS ---

    addTask: function (title, description, priority, assignedTo, callback) {
        const now = new Date().toLocaleString();
        const stmt = db.prepare(`
      INSERT INTO tasks (title, description, priority, status, assigned_to, created_at, updated_at)
      VALUES (?, ?, ?, 'Не выполнено', ?, ?, ?)
    `);
        stmt.run(title, description, priority, assignedTo, now, now, function (err) {
            if (callback) callback(err, this?.lastID);
        });
        stmt.finalize();
    },

    updateTask: function (taskId, fields, callback) {
        let updates = [];
        let values = [];
        for (let key in fields) {
            updates.push(`${key} = ?`);
            values.push(fields[key]);
        }
        const now = new Date().toLocaleString();
        updates.push(`updated_at = ?`);
        values.push(now);

        const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
        values.push(taskId);

        const stmt = db.prepare(sql);
        stmt.run(values, function (err) {
            if (callback) callback(err);
        });
        stmt.finalize();
    },

    getTaskById: function (taskId, callback) {
        db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, row) => {
            callback(err, row);
        });
    },

    getTasks: function (filters, callback) {
        let whereClauses = [];
        let values = [];

        if (filters.priority) {
            whereClauses.push('priority = ?');
            values.push(filters.priority);
        }
        if (typeof filters.assigned_to !== 'undefined') {
            whereClauses.push('assigned_to = ?');
            values.push(filters.assigned_to);
        }
        if (typeof filters.archived !== 'undefined') {
            whereClauses.push('archived = ?');
            values.push(filters.archived);
        }
        if (filters.status) {
            whereClauses.push('status = ?');
            values.push(filters.status);
        }

        let sql = 'SELECT * FROM tasks';
        if (whereClauses.length > 0) {
            sql += ' WHERE ' + whereClauses.join(' AND ');
        }

        db.all(sql, values, (err, rows) => {
            callback(err, rows);
        });
    },
};
