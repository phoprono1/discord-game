import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

async function balanceLogic(userId: string, replyFunc: (content: any) => Promise<any>) {
    // Get user data or create if not exists
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;

    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank) VALUES (?, ?, ?)').run(userId, 0, 0);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    // Get currency info from config
    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;

    const currencyName = configName?.value || 'Xu';
    const currencyEmoji = configEmoji?.value || '🪙';

    const total = user.balance + user.bank;

    const embed = new EmbedBuilder()
        .setTitle('💰 TÀI SẢN CÁ NHÂN')
        .setColor(0xFFD700) // Gold
        .addFields(
            { name: '👛 Ví', value: `${user.balance.toLocaleString()} ${currencyEmoji}`, inline: true },
            { name: '🏦 Ngân hàng', value: `${user.bank.toLocaleString()} ${currencyEmoji}`, inline: true },
            { name: '📊 Tổng tài sản', value: `${total.toLocaleString()} ${currencyEmoji} ${currencyName}`, inline: false }
        )
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Kiểm tra tài sản'),
    aliases: ['tien', 'vi', 'bal', 'taisan'],
    async execute(interaction: ChatInputCommandInteraction) {
        await balanceLogic(interaction.user.id, async (msg) => await interaction.reply(msg));
    },
    async run(message: Message, args: string[]) {
        await balanceLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
