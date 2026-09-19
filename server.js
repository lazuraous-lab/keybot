const express = require('express');
const Database = require('better-sqlite3');
const app = express();
const db = new Database('keys.db');

const SECRET_TOKEN = 'k4v3k4_s3cr3t_9x2m';

// ============================================================
// TABLES
// ============================================================
db.exec(`
CREATE TABLE IF NOT EXISTS keys (
    key TEXT PRIMARY KEY,
    expiresAt INTEGER,
    used INTEGER DEFAULT 0,
    usedBy TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    hwid TEXT PRIMARY KEY,
    key TEXT,
    startedAt INTEGER,
    expiresAt INTEGER,
    killed INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS globalstate (
    key TEXT PRIMARY KEY,
    value TEXT
);
`);

// ============================================================
// KEY VALIDATION (client calls this once)
// ============================================================
app.get('/checkkey', (req, res) => {
    if (req.query.token !== SECRET_TOKEN) {
        return res.status(403).json({ valid: false, reason: 'Forbidden' });
    }

    const key = (req.query.key || '').toUpperCase();
    if (!key) return res.json({ valid: false, reason: 'No key provided' });

    const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(key);
    if (!row) return res.json({ valid: false, reason: 'Key not found' });
    if (Date.now() > row.expiresAt) return res.json({ valid: false, reason: 'Key expired' });
    if (row.used) return res.json({ valid: false, reason: 'Key already used' });

    const hwid = req.query.hwid || 'unknown';

    // Burn the key
    db.prepare('UPDATE keys SET used = 1, usedBy = ? WHERE key = ?').run(hwid, key);

    // Register a session with a 60-min expiry
    db.prepare(`
        INSERT OR REPLACE INTO sessions (hwid, key, startedAt, expiresAt, killed)
        VALUES (?, ?, ?, ?, 0)
    `).run(hwid, key, Date.now(), Date.now() + 60 * 60 * 1000);

    res.json({ valid: true });
});

// ============================================================
// SESSION CHECK (client polls this every ~20s)
// ============================================================
app.get('/session', (req, res) => {
    if (req.query.token !== SECRET_TOKEN) {
        return res.status(403).json({ alive: false, reason: 'Forbidden' });
    }

    const hwid = req.query.hwid || '';
    if (!hwid) return res.json({ alive: false, reason: 'No hwid' });

    // Global kill switch?
    const g = db.prepare('SELECT value FROM globalstate WHERE key = ?').get('killall');
    if (g && g.value === '1') {
        return res.json({ alive: false, reason: 'Ended by owner' });
    }

    const session = db.prepare('SELECT * FROM sessions WHERE hwid = ?').get(hwid);
    if (!session)                       return res.json({ alive: false, reason: 'Session not found' });
    if (session.killed)                 return res.json({ alive: false, reason: 'Ended by owner' });
    if (Date.now() > session.expiresAt) return res.json({ alive: false, reason: 'Time expired' });

    res.json({ alive: true });
});

// ============================================================
// DEREGISTER (client tells us it's done)
// ============================================================
app.get('/deregister', (req, res) => {
    if (req.query.token !== SECRET_TOKEN) return res.status(403).json({ ok: false });
    const hwid = req.query.hwid;
    if (!hwid) return res.json({ ok: false });
    db.prepare('DELETE FROM sessions WHERE hwid = ?').run(hwid);
    res.json({ ok: true });
});

// ============================================================
// OWNER KILL CONTROLS (browser-accessible alternatives)
// ============================================================
app.get('/killall', (req, res) => {
    if (req.query.token !== SECRET_TOKEN) return res.status(403).json({ ok: false });
    db.prepare('INSERT OR REPLACE INTO globalstate (key, value) VALUES (?, ?)').run('killall', '1');
    res.json({ ok: true });
});

app.get('/unkillall', (req, res) => {
    if (req.query.token !== SECRET_TOKEN) return res.status(403).json({ ok: false });
    db.prepare('INSERT OR REPLACE INTO globalstate (key, value) VALUES (?, ?)').run('killall', '0');
    res.json({ ok: true });
});

app.get('/kill', (req, res) => {
    if (req.query.token !== SECRET_TOKEN) return res.status(403).json({ ok: false });
    const hwid = req.query.hwid;
    if (!hwid) return res.json({ ok: false, reason: 'No hwid' });
    db.prepare('UPDATE sessions SET killed = 1 WHERE hwid = ?').run(hwid);
    res.json({ ok: true });
});

// ============================================================
// START
// ============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
