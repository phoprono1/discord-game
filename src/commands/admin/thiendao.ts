import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import dotenv from 'dotenv';

dotenv.config();

const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];

async function thiendaoLogic(
    source: ChatInputCommandInteraction | Message,
    replyFunc: (content: any) => Promise<any>
) {
    const userId = source instanceof ChatInputCommandInteraction ? source.user.id : source.author.id;

    // 1. Check Admin Permission
    if (!ADMIN_IDS.includes(userId)) {
        await replyFunc('🚫 **THIÊN CƠ BẤT KHẢ LỘ!** Bạn không đủ quyền năng để thao túng Thiên Đạo.');
        return;
    }

    // 2. Fetch All Users
    const users = db.prepare('SELECT * FROM users').all() as UserData[];
    if (users.length === 0) {
        await replyFunc('Thế gian hoang vắng, không có ai để tác động.');
        return;
    }

    // 3. Select Victims (Random 1 to All)
    // Shuffle users array
    const shuffled = users.sort(() => Math.random() - 0.5);
    // Random number of targets (at least 1, up to 5 for now to avoid spam, or maybe 20% of population?)
    // Let's make it random: 1 to 5 people.
    const targetCount = Math.floor(Math.random() * 5) + 1;
    const targets = shuffled.slice(0, targetCount);

    const results: string[] = [];

    for (const target of targets) {
        const totalWealth = target.balance + target.bank;
        if (totalWealth <= 0) continue; // Skip poor souls

        // 50/50 Chance: Buff or Nerf
        const isBuff = Math.random() < 0.5;
        // Magnitude: 1% to 20%
        const percent = (Math.floor(Math.random() * 20) + 1) / 100;
        const amount = Math.floor(totalWealth * percent);

        if (amount <= 0) continue;

        let username = target.id;
        try {
            const discordUser = await source.client.users.fetch(target.id);
            username = discordUser.username;
        } catch (e) {
            username = `User ${target.id}`;
        }

        if (isBuff) {
            // Buff: Add to Balance
            db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, target.id);
            results.push(`😇 **${username}**: **+${amount.toLocaleString()}** (Phúc Trạch)`);
        } else {
            // Nerf: Deduct (Balance first, then Bank)
            let remaining = amount;
            let newBalance = target.balance;
            let newBank = target.bank;

            if (newBalance >= remaining) {
                newBalance -= remaining;
                remaining = 0;
            } else {
                remaining -= newBalance;
                newBalance = 0;
            }

            if (remaining > 0) {
                newBank = Math.max(0, newBank - remaining);
            }

            db.prepare('UPDATE users SET balance = ?, bank = ? WHERE id = ?').run(newBalance, newBank, target.id);
            results.push(`🌩️ **${username}**: **-${amount.toLocaleString()}** (Kiếp Nạn)`);
        }
    }

    if (results.length === 0) {
        await replyFunc('Thiên Đạo tĩnh lặng, không có gì xảy ra.');
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('⚡ THIÊN ĐẠO ĐẠI BIẾN ⚡')
        .setDescription(`Thiên ý khó lường! Một luồng năng lượng bí ẩn vừa quét qua thế gian...\n\n${results.join('\n')}`)
        .setColor(0x9900FF) // Purple
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('thiendao')
        .setDescription('Kích hoạt sự kiện Thiên Đạo (Admin Only)'),
    aliases: ['daibien', 'td'],
    async execute(interaction: ChatInputCommandInteraction) {
        await thiendaoLogic(interaction, async (msg) => await interaction.reply(msg));
    },
    async run(message: Message, args: string[]) {
        await thiendaoLogic(message, async (msg) => await message.reply(msg));
    }
};
