import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

async function transferLogic(senderId: string, targetId: string, amount: number, replyFunc: (content: any) => Promise<any>) {
    // 1. Validation
    if (senderId === targetId) {
        await replyFunc('❌ Bạn không thể tự chuyển tiền cho chính mình.');
        return;
    }

    if (amount <= 0) {
        await replyFunc('❌ Số tiền chuyển phải lớn hơn 0.');
        return;
    }

    // 2. Check Sender Balance
    let sender = db.prepare('SELECT * FROM users WHERE id = ?').get(senderId) as UserData;
    if (!sender) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(senderId);
        sender = { id: senderId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    if (sender.balance < amount) {
        await replyFunc(`❌ Bạn không đủ tiền! Cần **${formatNumber(amount)}** nhưng chỉ có **${formatNumber(sender.balance)}**.`);
        return;
    }

    // 3. Check Target Existence
    let target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as UserData;
    if (!target) {
        // Create target if not exists (passive receipt)
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(targetId);
    }

    // 4. Transaction
    const transfer = db.transaction(() => {
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, senderId);
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, targetId);
    });

    try {
        transfer();

        const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
        const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
        const currencyName = configName?.value || 'Xu';
        const currencyEmoji = configEmoji?.value || '🪙';

        const embed = new EmbedBuilder()
            .setTitle('💸 CHUYỂN TIỀN THÀNH CÔNG')
            .setDescription(`**<@${senderId}>** đã chuyển **${formatNumber(amount)} ${currencyEmoji} ${currencyName}** cho **<@${targetId}>**.`)
            .setColor(0x00FF00) // Green
            .setTimestamp();

        await replyFunc({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await replyFunc('❌ Giao dịch thất bại. Vui lòng thử lại.');
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Chuyển tiền cho người khác')
        .addUserOption(option => option.setName('user').setDescription('Người nhận').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Số tiền').setMinValue(1).setRequired(true)),
    aliases: ['chuyen', 'give', 'tang'],
    async execute(interaction: ChatInputCommandInteraction) {
        const targetUser = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        await interaction.deferReply();
        await transferLogic(interaction.user.id, targetUser.id, amount, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        const targetUser = message.mentions.users.first();
        const amountStr = args[1]; // !chuyen @user 100

        if (!targetUser) {
            await message.reply('❌ Vui lòng tag người nhận. Ví dụ: `!chuyen @user 100`');
            return;
        }

        const amount = parseInt(amountStr);
        if (isNaN(amount)) {
            await message.reply('❌ Vui lòng nhập số tiền hợp lệ.');
            return;
        }

        await transferLogic(message.author.id, targetUser.id, amount, async (msg) => await message.reply(msg));
    }
};
