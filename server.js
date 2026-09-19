const express = require('express');
const Database = require('better-sqlite3');
const app = express();
const db = new Database('keys.db');

const SECRET_TOKEN = 'k4v3k4_s3cr3t_9x2m';

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

    db.prepare('UPDATE keys SET used = 1, usedBy = ? WHERE key = ?')
      .run(req.query.hwid || 'unknown', key);

    res.json({ valid: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));