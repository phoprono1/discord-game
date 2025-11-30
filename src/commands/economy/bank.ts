import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

async function bankLogic(
    userId: string,
    subcommand: string,
    amountInput: string | number,
    replyFunc: (content: any) => Promise<any>
) {
    // Ensure user exists
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';
    const currencyEmoji = configEmoji?.value || '🪙';

    const embed = new EmbedBuilder()
        .setTimestamp();

    if (subcommand === 'balance' || subcommand === 'xem') {
        embed.setTitle('🏦 NGÂN HÀNG')
            .setColor(0xFFD700) // Gold
            .addFields(
                { name: '🏦 Số dư ngân hàng', value: `${user.bank.toLocaleString()} ${currencyEmoji}`, inline: true },
                { name: '👛 Tiền mặt', value: `${user.balance.toLocaleString()} ${currencyEmoji}`, inline: true }
            );
        await replyFunc({ embeds: [embed] });
        return;
    }

    let amount = 0;
    if (!amountInput) {
        await replyFunc('❌ Vui lòng nhập số tiền.');
        return;
    }

    if (amountInput === 'all' || amountInput === 'tatca') {
        amount = subcommand === 'deposit' || subcommand === 'gui' ? user.balance : user.bank;
    } else {
        amount = parseInt(amountInput.toString());
    }

    if (isNaN(amount) || amount <= 0) {
        await replyFunc('Số tiền không hợp lệ.');
        return;
    }

    if (subcommand === 'deposit' || subcommand === 'gui') {
        if (user.balance < amount) {
            await replyFunc(`Bạn không đủ tiền mặt! Bạn chỉ có **${user.balance} ${currencyEmoji}**.`);
            return;
        }

        db.prepare('UPDATE users SET balance = balance - ?, bank = bank + ? WHERE id = ?').run(amount, amount, userId);

        embed.setTitle('📥 GỬI TIỀN THÀNH CÔNG')
            .setColor(0x00FF00) // Green
            .setDescription(`Đã gửi **${amount.toLocaleString()} ${currencyEmoji}** vào ngân hàng.`)
            .addFields(
                { name: 'Số dư mới', value: `${(user.bank + amount).toLocaleString()} ${currencyEmoji}`, inline: true }
            );
        await replyFunc({ embeds: [embed] });

    } else if (subcommand === 'withdraw' || subcommand === 'rut') {
        if (user.bank < amount) {
            await replyFunc(`Ngân hàng không đủ tiền! Bạn chỉ có **${user.bank} ${currencyEmoji}**.`);
            return;
        }

        db.prepare('UPDATE users SET balance = balance + ?, bank = bank - ? WHERE id = ?').run(amount, amount, userId);

        embed.setTitle('📤 RÚT TIỀN THÀNH CÔNG')
            .setColor(0xFFA500) // Orange
            .setDescription(`Đã rút **${amount.toLocaleString()} ${currencyEmoji}** về ví.`)
            .addFields(
                { name: 'Số dư ngân hàng còn lại', value: `${(user.bank - amount).toLocaleString()} ${currencyEmoji}`, inline: true }
            );
        await replyFunc({ embeds: [embed] });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bank')
        .setDescription('Hệ thống ngân hàng')
        .addSubcommand(subcommand =>
            subcommand
                .setName('deposit')
                .setDescription('Gửi tiền vào ngân hàng')
                .addStringOption(option => option.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('withdraw')
                .setDescription('Rút tiền từ ngân hàng')
                .addStringOption(option => option.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('balance')
                .setDescription('Xem số dư ngân hàng')
        ),
    aliases: ['nganhang', 'gui', 'rut'],
    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();
        const amount = interaction.options.getString('amount') || '0';
        await bankLogic(interaction.user.id, subcommand, amount, async (msg) => await interaction.reply(msg));
    },
    async run(message: Message, args: string[]) {
        const commandName = message.content.slice(1).split(' ')[0].toLowerCase();
        let subcommand = '';
        let amount = '';

        if (commandName === 'gui') {
            subcommand = 'gui';
            amount = args[0];
        } else if (commandName === 'rut') {
            subcommand = 'rut';
            amount = args[0];
        } else {
            // !nganhang gui 100
            subcommand = args[0];
            amount = args[1];
        }

        if (!subcommand) {
            // Default to balance if no args provided to !nganhang
            subcommand = 'xem';
        }

        await bankLogic(message.author.id, subcommand, amount, async (msg) => await message.reply(msg));
    }
};
