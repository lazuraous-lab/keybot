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
db.exec(`CREATE TABLE IF NOT EXISTS keys (
    key TEXT PRIMARY KEY,
    expiresAt INTEGER,
    used INTEGER DEFAULT 0,
    usedBy TEXT
)`);

const EXPIRY_MINUTES = 60;

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
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
    }
});

client.login(process.env.DISCORD_TOKEN);