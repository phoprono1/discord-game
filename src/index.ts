import { Client, GatewayIntentBits, Collection, REST, Routes, Events, Message, MessageFlags } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Command } from './types';
import { checkCaptcha, isJailed } from './captcha';

dotenv.config();

// Extend Client to include commands
class ExtendedClient extends Client {
    commands: Collection<string, Command> = new Collection();
}

const extendedClient = new ExtendedClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

const commands: any[] = [];
const foldersPath = path.join(__dirname, 'commands');

// Ensure commands directory exists
if (!fs.existsSync(foldersPath)) {
    fs.mkdirSync(foldersPath);
}

// Helper to load commands recursively or from flat structure
function loadCommands(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            loadCommands(filePath);
        } else if (file.endsWith('.ts') || file.endsWith('.js')) {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                extendedClient.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }
}

loadCommands(foldersPath);

extendedClient.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${extendedClient.user?.tag}`);

    // Register Slash Commands
    const rest = new REST().setToken(process.env.DISCORD_TOKEN!);
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID!),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

extendedClient.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = extendedClient.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        // Anti-Cheat Check
        const jailStatus = isJailed(interaction.user.id);
        if (jailStatus.jailed) {
            await interaction.reply({ content: `🚫 **Bạn đang ở trong tù!**\nThời gian được thả: <t:${Math.floor(jailStatus.until / 1000)}:R>`, flags: MessageFlags.Ephemeral });
            return;
        }

        // Only check captcha for farming commands (mine, fish, hunt, cultivate...)
        const farmingCommands = ['mine', 'fish', 'hunt', 'cultivate', 'breakthrough', 'explore'];
        if (farmingCommands.includes(interaction.commandName)) {
            const passed = await checkCaptcha(interaction.user.id, async (data) => {
                // For interaction, we need to reply regular (public) for captcha so they see it
                // But wait, if we reply, we can't execute command reply.
                // Actually, we should return the response object.
                // Since we haven't replied yet, we can use interaction.reply
                // Captcha needs to be blocking.
                return await interaction.reply({ ...data, fetchReply: true });
            }, extendedClient);

            if (!passed) return; // Stop if failed/timeout/jailed

            // If passed, we need to handle the fact that we already replied "Captcha Success".
            // The original command might try to reply again, which throws error.
            // We need to tell the command to use followUp or editReply?
            // Or, simpler: Just return and ask user to re-run command?
            // "Verification Success! Please run the command again." - Safest way to avoid "Interaction already acknowledged" errors.
            if (interaction.replied) {
                await interaction.followUp({ content: '✅ Đã xác thực! Hãy nhập lại lệnh.', flags: MessageFlags.Ephemeral });
                return;
            }
        }

        await command.execute(interaction);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'Có lỗi xảy ra khi thực hiện lệnh này!', flags: MessageFlags.Ephemeral });
        }
    }
});

const EXP_COOLDOWNS = new Set<string>();
import db from './db';
import { UserData } from './types';

extendedClient.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return;

    // --- Chat EXP Logic ---
    if (!EXP_COOLDOWNS.has(message.author.id)) {
        const userId = message.author.id;

        // Ensure user exists
        let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
        if (!user) {
            db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        }

        // Grant EXP (1)
        const expGain = 1;
        db.prepare('UPDATE users SET exp = exp + ? WHERE id = ?').run(expGain, userId);

        // Get Cooldown from DB
        const configCD = db.prepare('SELECT value FROM config WHERE key = ?').get('cd_chat') as { value: string } | undefined;
        const cooldownTime = configCD ? parseInt(configCD.value) * 1000 : 5000; // Default 5s

        // Set Cooldown
        EXP_COOLDOWNS.add(userId);
        setTimeout(() => EXP_COOLDOWNS.delete(userId), cooldownTime);
    }
    // ----------------------

    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    const command = extendedClient.commands.get(commandName) ||
        extendedClient.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command || !command.run) return;

    try {
        const jailStatus = isJailed(message.author.id);
        if (jailStatus.jailed) {
            await message.reply(`🚫 **Bạn đang ở trong tù!**\nThời gian được thả: <t:${Math.floor(jailStatus.until / 1000)}:R>`);
            return;
        }

        // Only check captcha for farming commands
        // We can check command name or aliases
        const farmingCommands = ['mine', 'daokhoang', 'fish', 'cauca', 'san', 'hunt', 'tu', 'cultivate', 'dp', 'dotpha', 'kp', 'khampha'];
        if (farmingCommands.includes(commandName) || (command.aliases && command.aliases.some(a => farmingCommands.includes(a)))) {
            const passed = await checkCaptcha(message.author.id, async (data) => await message.reply(data), extendedClient);
            if (!passed) return;
            // If passed, message flow is continuous, we can just run the command?
            // Captcha function edits its own message to say "Success".
            // We can proceed.
        }

        await command.run(message, args);
    } catch (error) {
        console.error(error);
        await message.reply('Có lỗi xảy ra khi thực hiện lệnh này!');
    }
});

extendedClient.login(process.env.DISCORD_TOKEN);
