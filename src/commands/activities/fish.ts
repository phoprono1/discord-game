import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

const COOLDOWNS = new Set<string>();
const WARNINGS = new Set<string>();

async function fishLogic(userId: string, replyFunc: (content: any) => Promise<any>) {
    if (COOLDOWNS.has(userId)) {
        if (WARNINGS.has(userId)) {
            db.prepare('UPDATE users SET balance = balance - 50 WHERE id = ?').run(userId);
            await replyFunc('🚫 **PHẠT!** Bạn vẫn cố tình spam! Trừ **50 xu**.');
        } else {
            WARNINGS.add(userId);
            await replyFunc('⚠️ **CẢNH BÁO!** Bạn đang thao tác quá nhanh. Nếu tiếp tục sẽ bị trừ tiền!');
        }
        return;
    }

    // Clear warning on success
    if (WARNINGS.has(userId)) {
        WARNINGS.delete(userId);
    }

    // Get Cooldown from DB
    const configCD = db.prepare('SELECT value FROM config WHERE key = ?').get('cd_fish') as { value: string } | undefined;
    const cooldownTime = configCD ? parseInt(configCD.value) * 1000 : 5000; // Default 5s

    // Add cooldown
    COOLDOWNS.add(userId);
    setTimeout(() => COOLDOWNS.delete(userId), cooldownTime);

    // Ensure user exists
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    // RNG Logic
    const chance = Math.random();
    const embed = new EmbedBuilder()
        .setTimestamp();

    if (chance < 0.4) {
        embed.setTitle('🎣 CÂU CÁ THẤT BẠI')
            .setDescription('Bạn ngồi cả buổi nhưng chẳng câu được con nào.')
            .setColor(0x808080); // Gray
    } else {
        // Calculate Realm Multiplier
        const realmLevel = user.realm || 0;
        const multiplier = 1 + (realmLevel * 0.5);

        const baseAmount = Math.floor(Math.random() * 30) + 5;
        const amount = Math.floor(baseAmount * multiplier);

        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);

        const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
        const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
        const currencyName = configName?.value || 'Xu';
        const currencyEmoji = configEmoji?.value || '🪙';

        const fishNames = ['Cá Chép', 'Cá Ngừ', 'Cá Hồi', 'Cá Vàng'];
        const fish = fishNames[Math.floor(Math.random() * fishNames.length)];

        embed.setTitle('🎣 CÂU CÁ THÀNH CÔNG')
            .setDescription(`Bạn đã câu được một con **${fish}**!\nBán được **${formatNumber(amount)} ${currencyEmoji} ${currencyName}**.${multiplier > 1 ? `\n(Bonus Cảnh giới: x${multiplier})` : ''}`)
            .setColor(0x1E90FF); // DodgerBlue
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Đi câu cá'),
    aliases: ['cau', 'cauca'],
    async execute(interaction: ChatInputCommandInteraction) {
        await fishLogic(interaction.user.id, async (msg) => await interaction.reply(msg));
    },
    async run(message: Message, args: string[]) {
        await fishLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
