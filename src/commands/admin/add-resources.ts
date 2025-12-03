import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];

async function addResourcesLogic(
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
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(targetId);
        user = { id: targetId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    // 3. Update DB
    if (type === 'money') {
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, targetId);
    } else {
        db.prepare('UPDATE users SET exp = exp + ? WHERE id = ?').run(amount, targetId);
    }

    // 4. Response
    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';

    const embed = new EmbedBuilder()
        .setTitle('✨ THIÊN ĐẠO BAN PHƯỚC ✨')
        .setDescription(`Thiên Đạo đã ban tặng tài nguyên cho <@${targetId}>!`)
        .setColor(0x00FF00) // Green
        .addFields(
            { name: 'Loại', value: type === 'money' ? `Tiền (${currencyName})` : 'Tu Vi (EXP)', inline: true },
            { name: 'Số lượng', value: `+${amount.toLocaleString()}`, inline: true }
        )
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('add')
        .setDescription('Thêm tài nguyên cho người chơi (Admin only)')
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
        .addUserOption(option => option.setName('user').setDescription('Người nhận').setRequired(true)),
    aliases: ['them', 'add'],
    async execute(interaction: ChatInputCommandInteraction) {
        const type = interaction.options.getString('type', true) as 'money' | 'exp';
        const amount = interaction.options.getInteger('amount', true);
        const targetUser = interaction.options.getUser('user', true);

        await interaction.deferReply();
        await addResourcesLogic(interaction.user.id, targetUser.id, type, amount, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        // !them xu 1000 @user
        // !them exp 1000 @user

        if (args.length < 3) {
            await message.reply('❌ Sai cú pháp! Dùng: `!them <xu/exp> <so_luong> @user`');
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
            await message.reply('❌ Vui lòng tag người nhận.');
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

        await addResourcesLogic(message.author.id, targetUser.id, type, amount, async (msg) => await message.reply(msg));
    }
};
