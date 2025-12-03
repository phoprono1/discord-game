import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];

async function removeResourcesLogic(
    executorId: string,
    targetId: string,
    type: 'money' | 'exp',
    amount: number,
    replyFunc: (content: any) => Promise<any>
) {
    // 1. Check Admin Permission
    if (!ADMIN_IDS.includes(executorId)) {
        await replyFunc('🚫 **Quyền lực chưa đủ!** Chỉ có Thiên Đạo (Admin) mới được dùng lệnh này.');
        return;
    }

    // 2. Get Target User
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as UserData;
    if (!user) {
        await replyFunc('❌ Người chơi chưa tồn tại trong hệ thống.');
        return;
    }

    // 3. Update DB
    if (type === 'money') {
        // Deduct from balance first, then bank? Or just balance?
        // User asked for "remove money", usually implies balance (wallet).
        // Let's stick to Balance for simplicity, or check if balance < amount then deduct bank?
        // For "admin remove", usually we just want to adjust a specific value. Let's adjust Balance.
        // Ensure it doesn't go below 0.
        db.prepare('UPDATE users SET balance = MAX(0, balance - ?) WHERE id = ?').run(amount, targetId);
    } else {
        // Deduct EXP
        db.prepare('UPDATE users SET exp = MAX(0, exp - ?) WHERE id = ?').run(amount, targetId);
    }

    // 4. Response
    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';

    const embed = new EmbedBuilder()
        .setTitle('📉 THIÊN ĐẠO THU HỒI 📉')
        .setDescription(`Thiên Đạo đã thu hồi tài nguyên của <@${targetId}>.`)
        .setColor(0xFFA500) // Orange
        .addFields(
            { name: 'Loại', value: type === 'money' ? `Tiền (${currencyName})` : 'Tu Vi (EXP)', inline: true },
            { name: 'Số lượng', value: `-${formatNumber(amount)}`, inline: true }
        )
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Giảm tài nguyên của người chơi (Admin only)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Loại tài nguyên')
                .setRequired(true)
                .addChoices(
                    { name: 'Tiền (Xu)', value: 'money' },
                    { name: 'Tu Vi (EXP)', value: 'exp' }
                )
        )
        .addIntegerOption(option => option.setName('amount').setDescription('Số lượng').setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('Người bị trừ').setRequired(true)),
    aliases: ['giam', 'tru', 'remove'],
    async execute(interaction: ChatInputCommandInteraction) {
        const type = interaction.options.getString('type', true) as 'money' | 'exp';
        const amount = interaction.options.getInteger('amount', true);
        const targetUser = interaction.options.getUser('user', true);

        await interaction.deferReply();
        await removeResourcesLogic(interaction.user.id, targetUser.id, type, amount, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        // !giam xu 1000 @user
        // !giam exp 1000 @user

        if (args.length < 3) {
            await message.reply('❌ Sai cú pháp! Dùng: `!giam <xu/exp> <so_luong> @user`');
            return;
        }

        const typeArg = args[0].toLowerCase();
        const amount = parseInt(args[1]);
        const targetUser = message.mentions.users.first();

        if (isNaN(amount)) {
            await message.reply('❌ Số lượng phải là số nguyên.');
            return;
        }

        if (!targetUser) {
            await message.reply('❌ Vui lòng tag người bị trừ.');
            return;
        }

        let type: 'money' | 'exp';
        if (['xu', 'tien', 'money', 'gold'].includes(typeArg)) {
            type = 'money';
        } else if (['exp', 'tuvi', 'kn'].includes(typeArg)) {
            type = 'exp';
        } else {
            await message.reply('❌ Loại tài nguyên không hợp lệ. Dùng `xu` hoặc `exp`.');
            return;
        }

        await removeResourcesLogic(message.author.id, targetUser.id, type, amount, async (msg) => await message.reply(msg));
    }
};
