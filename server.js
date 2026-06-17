const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===== СОСТОЯНИЕ =====
const STATE_FILE = path.join(__dirname, 'state.json');

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Ошибка загрузки состояния:', e);
    }
    return {
        timers: {
            work: { settingMin: 25, currentSec: 1500, isRunning: false, isFinished: false, startTimestamp: null },
            break: { settingMin: 5, currentSec: 300, isRunning: false, isFinished: false, startTimestamp: null }
        },
        kanban: {
            todo: ['Изучить Tridactyl', 'Настроить хинты', 'Добавить примеры', 'Проверить синхронизацию'],
            doing: ['Настроить сервер'],
            done: ['Создать страницу']
        }
    };
}

function saveState(state) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

let state = loadState();

// ===== ОБНОВЛЕНИЕ ТАЙМЕРОВ =====
function updateTimers() {
    const now = Date.now();
    let changed = false;
    
    for (const [type, timer] of Object.entries(state.timers)) {
        if (timer.isRunning && timer.startTimestamp) {
            const elapsed = (now - timer.startTimestamp) / 1000;
            const total = timer.settingMin * 60;
            const remaining = total - elapsed;
            
            if (remaining <= 0) {
                timer.currentSec = 0;
                timer.isRunning = false;
                timer.isFinished = true;
                timer.startTimestamp = null;
                changed = true;
                
                const otherType = type === 'work' ? 'break' : 'work';
                const other = state.timers[otherType];
                if (!other.isRunning && !other.isFinished) {
                    other.isRunning = true;
                    other.startTimestamp = Date.now();
                    other.isFinished = false;
                    changed = true;
                }
            } else {
                timer.currentSec = Math.ceil(remaining);
            }
        }
    }
    
    if (changed) {
        saveState(state);
        broadcastState();
    }
}

setInterval(updateTimers, 1000);

// ===== BROADCAST =====
function broadcastState() {
    const message = JSON.stringify({ type: 'state', data: state });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ===== WEBSOCKET =====
wss.on('connection', (ws) => {
    console.log('🔗 Клиент подключился');
    ws.send(JSON.stringify({ type: 'state', data: state }));
    
    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message);
            
            switch (parsed.type) {
                case 'update-timer':
                    const timer = state.timers[parsed.data.timerType];
                    if (timer) {
                        Object.assign(timer, parsed.data);
                        if (timer.isRunning) {
                            timer.startTimestamp = Date.now() - (timer.settingMin * 60 - timer.currentSec) * 1000;
                        } else {
                            timer.startTimestamp = null;
                        }
                        saveState(state);
                        broadcastState();
                    }
                    break;
                    
                case 'toggle-timer':
                    const t = state.timers[parsed.timerType];
                    if (t) {
                        t.isRunning = !t.isRunning;
                        if (t.isRunning) {
                            t.startTimestamp = Date.now() - (t.settingMin * 60 - t.currentSec) * 1000;
                            t.isFinished = false;
                        } else {
                            t.startTimestamp = null;
                        }
                        saveState(state);
                        broadcastState();
                    }
                    break;
                    
                case 'reset-timer':
                    const r = state.timers[parsed.timerType];
                    if (r) {
                        r.currentSec = r.settingMin * 60;
                        r.isRunning = false;
                        r.isFinished = false;
                        r.startTimestamp = null;
                        saveState(state);
                        broadcastState();
                    }
                    break;
                    
                case 'update-kanban':
                    state.kanban = parsed.data;
                    saveState(state);
                    broadcastState();
                    break;
            }
        } catch (e) {
            console.error('Ошибка:', e);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 Клиент отключился');
    });
});

// ===== СТАТИКА =====
app.use(express.static('public'));

// ===== ЗАПУСК =====
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Сервер запущен!`);
    console.log(`📍 Локально: http://localhost:${PORT}`);
    console.log(`📍 По сети: http://0.0.0.0:${PORT}\n`);
});
