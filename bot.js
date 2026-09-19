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
const OWNER_ID = process.env.OWNER_ID;

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // ============================================================
    // PUBLIC COMMAND
    // ============================================================
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

    // ============================================================
    // OWNER-ONLY COMMANDS
    // ============================================================
    if (message.author.id !== OWNER_ID) return;

    // ----- Generate a key to hand out manually -----
    if (message.content === '!genkey') {
        const key = crypto.randomBytes(8).toString('hex').toUpperCase();
        const expiresAt = Date.now() + (EXPIRY_MINUTES * 60 * 1000);

        db.prepare('INSERT INTO keys (key, expiresAt) VALUES (?, ?)').run(key, expiresAt);

        return message.reply(
            `Here's a fresh key:\n\`\`\`\n${key}\n\`\`\`\n` +
            `Expires in ${EXPIRY_MINUTES} minutes. Send it to whoever you want.`
        );
    }

    // ----- End one session now -----
    if (message.content.startsWith('!end ')) {
        const hwid = message.content.split(' ')[1];
        if (!hwid) return message.reply('Usage: `!end <hwid>`');
        db.prepare('UPDATE sessions SET killed = 1 WHERE hwid = ?').run(hwid);
        return message.reply(`🛑 Ended session \`${hwid}\` immediately.`);
    }

    // ----- End every session now -----
    if (message.content === '!endall') {
        db.prepare('INSERT OR REPLACE INTO globalstate (key, value) VALUES (?, ?)').run('killall', '1');
        return message.reply('🛑 Ended ALL active sessions immediately.');
    }

    // ----- Active sessions -----
    if (message.content === '!sessions') {
        const rows = db.prepare('SELECT * FROM sessions WHERE killed = 0 ORDER BY startedAt DESC').all();
        if (rows.length === 0) return message.reply('No active sessions.');

        const lines = rows.map(r => {
            const started = new Date(r.startedAt).toLocaleTimeString();
            const msLeft  = r.expiresAt - Date.now();
            const minLeft = Math.max(0, Math.floor(msLeft / 60000));
            return `\`${r.hwid}\` — started ${started} — ends in ~${minLeft} min`;
        });
        return message.reply('**Active sessions:**\n' + lines.join('\n'));
    }

    // ----- Ended sessions -----
    if (message.content === '!ended') {
        const rows = db.prepare('SELECT * FROM sessions WHERE killed = 1 ORDER BY startedAt DESC').all();
        if (rows.length === 0) return message.reply('No ended sessions.');

        const lines = rows.map(r => {
            const started = new Date(r.startedAt).toLocaleTimeString();
            return `\`${r.hwid}\` — started ${started}`;
        });
        return message.reply('**Ended sessions:**\n' + lines.join('\n'));
    }

    // ----- Help -----
    if (message.content === '!help') {
        return message.reply(
            '**Public**\n' +
            '`!getkey` — DM a key to anyone in the server\n' +
            '\n' +
            '**Owner**\n' +
            '`!genkey` — generate a key to share manually\n' +
            '`!end <hwid>` — end one session now\n' +
            '`!endall` — end every session now\n' +
            '`!sessions` — list active sessions\n' +
            '`!ended` — list ended sessions'
        );
    }
});

client.login(process.env.DISCORD_TOKEN);
