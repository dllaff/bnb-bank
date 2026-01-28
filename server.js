// server.js - SQLite версия (без ограничений размера)
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({limit: '50mb'}));
app.use(express.static(path.join(__dirname, 'public')));

// База данных SQLite
const db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error('Ошибка подключения к БД:', err);
    } else {
        console.log('✅ Подключено к SQLite');
        initDB();
    }
});

function initDB() {
    db.serialize(() => {
        // Таблица пользователей
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            firstName TEXT,
            lastName TEXT,
            username TEXT,
            isAdmin INTEGER DEFAULT 0,
            isBanned INTEGER DEFAULT 0,
            isAssistant INTEGER DEFAULT 0,
            assignedAt INTEGER,
            registeredAt INTEGER,
            lastSeen INTEGER
        )`);
        
        // Таблица чеков
        db.run(`CREATE TABLE IF NOT EXISTS receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            imageData TEXT,
            filename TEXT,
            status TEXT DEFAULT 'pending',
            uploadedAt INTEGER,
            checkedAt INTEGER,
            checkedBy INTEGER,
            comment TEXT
        )`);
        
        // Таблица тикетов
        db.run(`CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            status TEXT DEFAULT 'open',
            createdAt INTEGER,
            messages TEXT,
            unreadByAdmin INTEGER DEFAULT 1,
            unreadByUser INTEGER DEFAULT 0
        )`);
        
        console.log('✅ Таблицы созданы');
    });
}

function sanitizeText(text) {
    if (typeof text !== 'string') return text;
    return text.trim();
}

// ==================== API ENDPOINTS ====================

// Пользователи
app.post('/api/users', (req, res) => {
    const { userId, firstName, lastName, username, isAdmin } = req.body;
    
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        
        if (user) {
            db.run('UPDATE users SET firstName = ?, lastName = ?, username = ?, lastSeen = ? WHERE id = ?',
                [firstName, lastName || '', username, Date.now(), userId],
                (err) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    // Получаем обновленные данные пользователя
                    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, updatedUser) => {
                        if (err) return res.status(500).json({ success: false, error: err.message });
                        res.json({ success: true, user: updatedUser });
                    });
                }
            );
        } else {
            db.run('INSERT INTO users (id, firstName, lastName, username, isAdmin, isBanned, isAssistant, registeredAt, lastSeen) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)',
                [userId, firstName, lastName || '', username, isAdmin ? 1 : 0, Date.now(), Date.now()],
                function(err) {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    res.json({ success: true, user: { id: userId, firstName, lastName, username, isAdmin, isBanned: false, isAssistant: false } });
                }
            );
        }
    });
});

app.get('/api/users', (req, res) => {
    if (req.query.action === 'all') {
        db.all('SELECT * FROM users', (err, users) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, users });
        });
    } else {
        const userId = parseInt(req.query.userId);
        db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, user });
        });
    }
});

app.put('/api/users', (req, res) => {
    const { userId, isBanned } = req.body;
    
    db.run('UPDATE users SET isBanned = ? WHERE id = ?', [isBanned ? 1 : 0, userId], function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (this.changes === 0) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({ success: true });
    });
});

// Чеки
app.post('/api/receipts', (req, res) => {
    const { userId, imageData, filename } = req.body;
    
    db.run('DELETE FROM receipts WHERE userId = ?', [userId], (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        db.run('INSERT INTO receipts (userId, imageData, filename, status, uploadedAt) VALUES (?, ?, ?, "pending", ?)',
            [userId, imageData, filename, Date.now()],
            function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, receipt: { id: this.lastID, userId, status: 'pending' } });
            }
        );
    });
});

app.get('/api/receipts', (req, res) => {
    if (req.query.action === 'all') {
        db.all('SELECT * FROM receipts ORDER BY uploadedAt DESC', (err, receipts) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, receipts });
        });
    } else {
        const userId = parseInt(req.query.userId);
        db.get('SELECT * FROM receipts WHERE userId = ?', [userId], (err, receipt) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, receipt });
        });
    }
});

app.put('/api/receipts', (req, res) => {
    const { userId, status, adminId, comment } = req.body;
    
    db.run('UPDATE receipts SET status = ?, checkedAt = ?, checkedBy = ?, comment = ? WHERE userId = ?',
        [status, Date.now(), adminId, comment || null, userId],
        function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (this.changes === 0) return res.status(404).json({ success: false, error: 'Receipt not found' });
            res.json({ success: true });
        }
    );
});

// Тикеты
app.post('/api/tickets', (req, res) => {
    const { userId, message, ticketId, isAdmin } = req.body;
    
    if (ticketId) {
        db.get('SELECT * FROM tickets WHERE id = ?', [ticketId], (err, ticket) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });
            
            const messages = JSON.parse(ticket.messages || '[]');
            messages.push({
                from: isAdmin ? 'admin' : 'user',
                text: sanitizeText(message),
                time: Date.now()
            });
            
            db.run('UPDATE tickets SET messages = ?, unreadByAdmin = ?, unreadByUser = ? WHERE id = ?',
                [JSON.stringify(messages), isAdmin ? 0 : 1, isAdmin ? 1 : 0, ticketId],
                (err) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    res.json({ success: true, ticket: {...ticket, messages} });
                }
            );
        });
    } else {
        const messages = JSON.stringify([{
            from: 'user',
            text: sanitizeText(message),
            time: Date.now()
        }]);
        
        db.run('INSERT INTO tickets (userId, status, createdAt, messages, unreadByAdmin, unreadByUser) VALUES (?, "open", ?, ?, 1, 0)',
            [userId, Date.now(), messages],
            function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, ticket: { id: this.lastID, userId, status: 'open', messages: JSON.parse(messages) } });
            }
        );
    }
});

app.get('/api/tickets', (req, res) => {
    if (req.query.action === 'all') {
        db.all('SELECT * FROM tickets ORDER BY createdAt DESC', (err, tickets) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            tickets.forEach(t => t.messages = JSON.parse(t.messages || '[]'));
            res.json({ success: true, tickets });
        });
    } else if (req.query.ticketId) {
        const ticketId = parseInt(req.query.ticketId);
        db.get('SELECT * FROM tickets WHERE id = ?', [ticketId], (err, ticket) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (ticket) ticket.messages = JSON.parse(ticket.messages || '[]');
            res.json({ success: true, ticket });
        });
    } else {
        const userId = parseInt(req.query.userId);
        db.all('SELECT * FROM tickets WHERE userId = ? ORDER BY createdAt DESC', [userId], (err, tickets) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            tickets.forEach(t => t.messages = JSON.parse(t.messages || '[]'));
            res.json({ success: true, tickets });
        });
    }
});

app.put('/api/tickets', (req, res) => {
    const { ticketId, status, markRead } = req.body;
    
    let sql = 'UPDATE tickets SET ';
    const params = [];
    
    if (status) {
        sql += 'status = ?';
        params.push(status);
    }
    if (markRead === 'user') {
        sql += (params.length ? ', ' : '') + 'unreadByUser = 0';
    } else if (markRead === 'admin') {
        sql += (params.length ? ', ' : '') + 'unreadByAdmin = 0';
    }
    
    sql += ' WHERE id = ?';
    params.push(ticketId);
    
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (this.changes === 0) return res.status(404).json({ success: false, error: 'Ticket not found' });
        res.json({ success: true });
    });
});

// Статистика
app.get('/api/stats', (req, res) => {
    db.get('SELECT COUNT(*) as totalUsers FROM users', (err, userCount) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        db.get('SELECT COUNT(*) as onlineCount FROM users WHERE lastSeen > ?', [fiveMinutesAgo], (err, onlineCount) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            
            const today = new Date().setHours(0, 0, 0, 0);
            db.get('SELECT COUNT(*) as receiptsToday FROM receipts WHERE uploadedAt > ?', [today], (err, receiptCount) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                
                // Подсчет чеков по статусам
                db.get('SELECT COUNT(*) as pendingReceipts FROM receipts WHERE status = "pending"', (err, pendingCount) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    
                    db.get('SELECT COUNT(*) as approvedReceipts FROM receipts WHERE status = "approved"', (err, approvedCount) => {
                        if (err) return res.status(500).json({ success: false, error: err.message });
                        
                        db.get('SELECT COUNT(*) as rejectedReceipts FROM receipts WHERE status = "rejected"', (err, rejectedCount) => {
                            if (err) return res.status(500).json({ success: false, error: err.message });
                            
                            // Подсчет тикетов
                            db.get('SELECT COUNT(*) as totalTickets FROM tickets', (err, ticketCount) => {
                                if (err) return res.status(500).json({ success: false, error: err.message });
                                
                                db.get('SELECT COUNT(*) as openTickets FROM tickets WHERE status = "open"', (err, openTicketCount) => {
                                    if (err) return res.status(500).json({ success: false, error: err.message });
                                    
                                    db.get('SELECT COUNT(*) as closedTickets FROM tickets WHERE status = "closed"', (err, closedTicketCount) => {
                                        if (err) return res.status(500).json({ success: false, error: err.message });
                                        
                                        res.json({
                                            success: true,
                                            stats: {
                                                totalUsers: userCount.totalUsers,
                                                onlineCount: onlineCount.onlineCount,
                                                receiptsToday: receiptCount.receiptsToday,
                                                pendingReceipts: pendingCount.pendingReceipts,
                                                approvedReceipts: approvedCount.approvedReceipts,
                                                rejectedReceipts: rejectedCount.rejectedReceipts,
                                                totalTickets: ticketCount.totalTickets,
                                                openTickets: openTicketCount.openTickets,
                                                closedTickets: closedTicketCount.closedTickets
                                            }
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ==================== ASSISTANTS API ====================

// GET /api/assistants - Получить список всех помощников
app.get('/api/assistants', (req, res) => {
    console.log('📥 GET /api/assistants - Получение списка помощников');
    
    db.all('SELECT id, firstName, lastName, username, assignedAt FROM users WHERE isAssistant = 1 AND isAdmin = 0 ORDER BY assignedAt DESC', 
        (err, assistants) => {
            if (err) {
                console.error('❌ Ошибка получения помощников:', err);
                return res.status(500).json({ success: false, error: err.message });
            }
            
            console.log(`✅ Найдено помощников: ${assistants.length}`);
            res.json({ success: true, assistants });
        }
    );
});

// POST /api/assistants - Добавить помощника
app.post('/api/assistants', (req, res) => {
    const { userId, adminId } = req.body;
    
    console.log('📥 POST /api/assistants - Добавление помощника:', { userId, adminId });
    
    if (!userId || !adminId) {
        return res.status(400).json({ success: false, error: 'Не указан userId или adminId' });
    }
    
    // Проверяем что запрос от админа
    db.get('SELECT isAdmin FROM users WHERE id = ?', [adminId], (err, admin) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ success: false, error: 'Только админ может назначать помощников' });
        }
        
        // Проверяем существует ли пользователь
        db.get('SELECT id, firstName, lastName, username, isAdmin, isAssistant FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!user) {
                return res.status(404).json({ success: false, error: 'Пользователь не найден. Пользователь должен сначала зайти в приложение.' });
            }
            if (user.isAdmin) {
                return res.status(400).json({ success: false, error: 'Нельзя назначить админа помощником' });
            }
            if (user.isAssistant) {
                return res.status(400).json({ success: false, error: 'Пользователь уже является помощником' });
            }
            
            // Назначаем помощником
            const now = Date.now();
            db.run('UPDATE users SET isAssistant = 1, assignedAt = ? WHERE id = ?', [now, userId], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                
                console.log(`✅ Пользователь ${userId} назначен помощником`);
                
                // Получаем обновленные данные
                db.get('SELECT id, firstName, lastName, username, assignedAt FROM users WHERE id = ?', [userId], (err, assistant) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    res.json({ success: true, message: 'Помощник добавлен', assistant });
                });
            });
        });
    });
});

// DELETE /api/assistants - Удалить помощника
app.delete('/api/assistants', (req, res) => {
    const { userId, adminId } = req.body;
    
    console.log('📥 DELETE /api/assistants - Удаление помощника:', { userId, adminId });
    
    if (!userId || !adminId) {
        return res.status(400).json({ success: false, error: 'Не указан userId или adminId' });
    }
    
    // Проверяем что запрос от админа
    db.get('SELECT isAdmin FROM users WHERE id = ?', [adminId], (err, admin) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ success: false, error: 'Только админ может удалять помощников' });
        }
        
        // Проверяем что пользователь является помощником
        db.get('SELECT isAssistant FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!user) {
                return res.status(404).json({ success: false, error: 'Пользователь не найден' });
            }
            if (!user.isAssistant) {
                return res.status(400).json({ success: false, error: 'Пользователь не является помощником' });
            }
            
            // Удаляем статус помощника
            db.run('UPDATE users SET isAssistant = 0, assignedAt = NULL WHERE id = ?', [userId], function(err) {
                if (err) return res.status(500).json({ success: false, error: err.message });
                
                console.log(`✅ Пользователь ${userId} удален из помощников`);
                res.json({ success: true, message: 'Помощник удален' });
            });
        });
    });
});

// ==================== ОЧИСТКА ДАННЫХ ====================

// Очистка всех чеков
app.delete('/api/receipts/clear', (req, res) => {
    const { adminId } = req.body;
    
    console.log(`🗑️ DELETE /api/receipts/clear - Очистка всех чеков админом ${adminId}`);
    
    // Проверяем что запрос от админа
    db.get('SELECT isAdmin FROM users WHERE id = ?', [adminId], (err, admin) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ success: false, error: 'Только админ может очищать данные' });
        }
        
        // Удаляем все чеки
        db.run('DELETE FROM receipts', function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            
            console.log(`✅ Удалено чеков: ${this.changes}`);
            res.json({ 
                success: true, 
                message: 'Все чеки удалены',
                deleted: this.changes
            });
        });
    });
});

// Очистка всех тикетов
app.delete('/api/tickets/clear', (req, res) => {
    const { adminId } = req.body;
    
    console.log(`🗑️ DELETE /api/tickets/clear - Очистка всех обращений админом ${adminId}`);
    
    // Проверяем что запрос от админа
    db.get('SELECT isAdmin FROM users WHERE id = ?', [adminId], (err, admin) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ success: false, error: 'Только админ может очищать данные' });
        }
        
        // Удаляем все тикеты
        db.run('DELETE FROM tickets', function(err) {
            if (err) return res.status(500).json({ success: false, error: err.message });
            
            console.log(`✅ Удалено обращений: ${this.changes}`);
            res.json({ 
                success: true, 
                message: 'Все обращения удалены',
                deleted: this.changes
            });
        });
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║     🏦 BNB BANK SERVER 4.0 SQLite     ║
╚════════════════════════════════════════╝

✅ Сервер запущен на http://localhost:${PORT}
✅ База данных: SQLite (БЕЗ ЛИМИТОВ!)
✅ Статические файлы: public/
✅ Готов к работе!

💾 База данных: database.db
📊 Без ограничений по размеру!
        `);
});
