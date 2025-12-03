import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

const COOLDOWNS = new Set<string>();
const WARNINGS = new Set<string>();

async function mineLogic(userId: string, replyFunc: (content: any) => Promise<any>) {
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
    const configCD = db.prepare('SELECT value FROM config WHERE key = ?').get('cd_mine') as { value: string } | undefined;
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

    // Calculate Realm Multiplier
    const realmLevel = user.realm || 0;
    const multiplier = 1 + (realmLevel * 0.5);

    if (chance < 0.3) {
        // 30% chance to find nothing
        embed.setTitle('⛏️ ĐÀO KHOÁNG THẤT BẠI')
            .setDescription('Bạn hì hục đào nhưng chỉ thấy toàn đất với đá.')
            .setColor(0x8B4513); // SaddleBrown
    } else if (chance < 0.8) {
        // 50% chance to find coins
        const baseAmount = Math.floor(Math.random() * 50) + 10;
        const amount = Math.floor(baseAmount * multiplier);

        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);

        const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
        const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
        const currencyName = configName?.value || 'Xu';
        const currencyEmoji = configEmoji?.value || '🪙';

        embed.setTitle('⛏️ ĐÀO KHOÁNG THÀNH CÔNG')
            .setDescription(`Bạn đã đào được **${formatNumber(amount)} ${currencyEmoji} ${currencyName}**!${multiplier > 1 ? `\n(Bonus Cảnh giới: x${multiplier})` : ''}`)
            .setColor(0xCD853F); // Peru
    } else {
        // 20% chance to find an ore
        const baseAmount = Math.floor(Math.random() * 100) + 50;
        const amount = Math.floor(baseAmount * multiplier);

        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, userId);

        const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
        const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
        const currencyName = configName?.value || 'Xu';
        const currencyEmoji = configEmoji?.value || '🪙';

        embed.setTitle('💎 TRÚNG MÁNH!')
            .setDescription(`**MAY MẮN!** Bạn trúng mánh và đào được **${formatNumber(amount)} ${currencyEmoji} ${currencyName}**!${multiplier > 1 ? `\n(Bonus Cảnh giới: x${multiplier})` : ''}`)
            .setColor(0xFFD700); // Gold
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mine')
        .setDescription('Đi đào khoáng sản'),
    aliases: ['dao', 'daokhoang'],
    async execute(interaction: ChatInputCommandInteraction) {
        await mineLogic(interaction.user.id, async (msg) => await interaction.reply(msg));
    },
    async run(message: Message, args: string[]) {
        await mineLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
