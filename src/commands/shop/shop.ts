import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData, ShopItem } from '../../types';
import { formatNumber } from '../../utils';

async function shopView(replyFunc: (content: any) => Promise<any>) {
    const items = db.prepare('SELECT * FROM shop').all() as ShopItem[];

    if (items.length === 0) {
        await replyFunc('Cửa hàng hiện đang trống.');
        return;
    }

    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';
    const currencyEmoji = configEmoji?.value || '🪙';

    const itemList = items.map(item => `**${item.name}** (ID: \`${item.id}\`) - ${formatNumber(item.price)} ${currencyEmoji} ${currencyName} - *${item.type}*`).join('\n');

    const embed = new EmbedBuilder()
        .setTitle('🛒 CỬA HÀNG')
        .setDescription(itemList)
        .setColor(0x00FF00) // Green
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

async function shopBuy(userId: string, itemId: string, amount: number, replyFunc: (content: any) => Promise<any>) {
    const item = db.prepare('SELECT * FROM shop WHERE id = ?').get(itemId) as ShopItem | undefined;

    if (!item) {
        await replyFunc('Không tìm thấy vật phẩm này.');
        return;
    }

    const totalCost = item.price * amount;

    // Check balance
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';
    const currencyEmoji = configEmoji?.value || '🪙';

    if (user.balance < totalCost) {
        await replyFunc(`Bạn không đủ tiền! Bạn cần **${formatNumber(totalCost)} ${currencyEmoji} ${currencyName}** nhưng chỉ có **${formatNumber(user.balance)} ${currencyEmoji} ${currencyName}**.`);
        return;
    }

    // Transaction
    const updateBalance = db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?');
    const updateInventory = db.prepare(`
    INSERT INTO inventory (user_id, item_id, count) 
    VALUES (?, ?, ?) 
    ON CONFLICT(user_id, item_id) 
    DO UPDATE SET count = count + ?
  `);

    const transaction = db.transaction(() => {
        updateBalance.run(totalCost, userId);
        updateInventory.run(userId, itemId, amount, amount);
    });

    try {
        transaction();
        const embed = new EmbedBuilder()
            .setTitle('🛒 GIAO DỊCH THÀNH CÔNG')
            .setDescription(`Đã mua thành công **${amount}x ${item.name}**\nTổng giá: **${formatNumber(totalCost)} ${currencyEmoji} ${currencyName}**`)
            .setColor(0x00FF00) // Green
            .setTimestamp();
        await replyFunc({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await replyFunc('🚫 Giao dịch thất bại.');
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Xem cửa hàng hoặc mua đồ')
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Xem các mặt hàng')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Mua vật phẩm')
                .addStringOption(option =>
                    option.setName('item_id')
                        .setDescription('ID vật phẩm cần mua')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Số lượng')
                        .setMinValue(1)
                )
        ),
    aliases: ['cuahang', 'mua'],
    async execute(interaction: ChatInputCommandInteraction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            await shopView(async (msg) => await interaction.reply(msg));
        } else if (subcommand === 'buy') {
            const itemId = interaction.options.getString('item_id', true);
            const amount = interaction.options.getInteger('amount') || 1;
            await shopBuy(interaction.user.id, itemId, amount, async (msg) => await interaction.reply(msg));
        }
    },
    async run(message: Message, args: string[]) {
        const subcommand = args[0]?.toLowerCase();

        if (!subcommand || subcommand === 'view' || subcommand === 'xem') {
            await shopView(async (msg) => await message.reply(msg));
        } else if (subcommand === 'buy' || subcommand === 'mua') {
            const itemId = args[1];
            const amount = parseInt(args[2]) || 1;

            if (!itemId) {
                await message.reply('Vui lòng nhập ID vật phẩm. Ví dụ: `!shop mua gold_ore 1`');
                return;
            }

            await shopBuy(message.author.id, itemId, amount, async (msg) => await message.reply(msg));
        } else {
            await message.reply('Lệnh không hợp lệ. Dùng `!shop xem` hoặc `!shop mua <id> [số lượng]`.');
        }
    }
};
