require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

const db = new Database('keys.db');
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

const EXPIRY_MINUTES = 60;

// Your Discord user ID — put this in your .env
const OWNER_ID = process.env.OWNER_ID;

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ---------- Public command ----------
    if (message.content === '!getkey') {
        const key = crypto.randomBytes(8).toString('hex').toUpperCase();
        const expiresAt = Date.now() + (EXPIRY_MINUTES * 60 * 1000);

        db.prepare('INSERT INTO keys (key, expiresAt) VALUES (?, ?)').run(key, expiresAt);

        try {
            await message.author.send(`Your key: **${key}**\nExpires in ${EXPIRY_MINUTES} minutes.`);
            if (message.guild) await message.reply('Sent you a key in DMs!');
        } catch (err) {
            console.error('DM failed:', err.message);
            if (message.guild) await message.reply('Could not DM you. Enable DMs from server members.');
        }
        return;
    }

    // ---------- Owner-only commands ----------
    if (message.author.id !== OWNER_ID) return;

    if (message.content === '!killall') {
        db.prepare('INSERT OR REPLACE INTO globalstate (key, value) VALUES (?, ?)').run('killall', '1');
        return message.reply('🛑 Killed ALL active sessions.');
    }

    if (message.content === '!unkillall') {
        db.prepare('INSERT OR REPLACE INTO globalstate (key, value) VALUES (?, ?)').run('killall', '0');
        return message.reply('✅ Kill switch reset. New validations will run.');
    }

    if (message.content.startsWith('!kill ')) {
        const hwid = message.content.split(' ')[1];
        if (!hwid) return message.reply('Usage: `!kill <hwid>`');
        db.prepare('UPDATE sessions SET killed = 1 WHERE hwid = ?').run(hwid);
        return message.reply(`🛑 Killed session \`${hwid}\`.`);
    }

    if (message.content.startsWith('!unkill ')) {
        const hwid = message.content.split(' ')[1];
        if (!hwid) return message.reply('Usage: `!unkill <hwid>`');
        db.prepare('UPDATE sessions SET killed = 0 WHERE hwid = ?').run(hwid);
        return message.reply(`✅ Resurrected session \`${hwid}\`.`);
    }

    if (message.content === '!sessions') {
        const rows = db.prepare('SELECT * FROM sessions ORDER BY startedAt DESC').all();
        if (rows.length === 0) return message.reply('No active sessions.');

        const lines = rows.map(r => {
            const started = new Date(r.startedAt).toLocaleTimeString();
            const status  = r.killed ? '🛑 killed' : '✅ alive';
            return `\`${r.hwid}\` — ${status} — started ${started}`;
        });
        return message.reply('**Sessions:**\n' + lines.join('\n'));
    }

    if (message.content === '!help') {
        return message.reply(
            '**Owner Commands**\n' +
            '`!killall` — kill everyone\n' +
            '`!unkillall` — reset kill switch\n' +
            '`!kill <hwid>` — kill one user\n' +
            '`!unkill <hwid>` — unkill one user\n' +
            '`!sessions` — list active sessions\n' +
            '**Public**\n' +
            '`!getkey` — DM a key'
        );
    }
});

client.login(process.env.DISCORD_TOKEN);
