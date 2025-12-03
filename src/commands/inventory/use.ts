import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

async function useLogic(userId: string, itemId: string, amount: number, replyFunc: (content: any) => Promise<any>) {
    // 1. Check Inventory
    const inventoryItem = db.prepare('SELECT * FROM inventory WHERE user_id = ? AND item_id = ?').get(userId, itemId) as { count: number } | undefined;

    if (!inventoryItem || inventoryItem.count < amount) {
        await replyFunc(`❌ Bạn không đủ vật phẩm! Bạn có **${inventoryItem?.count || 0}**, cần **${amount}**.`);
        return;
    }

    // 2. Item Logic
    const embed = new EmbedBuilder().setTimestamp();
    let consumed = false;

    // --- Dynamic EXP Pill Logic ---
    const pillMap: { [key: string]: number } = {
        // Normal
        'pill_normal_1': 1000, 'pill_normal_2': 5000, 'pill_normal_3': 20000,
        'pill_normal_4': 50000, 'pill_normal_5': 100000, 'pill_normal_6': 500000,
        'pill_normal_7': 2000000, 'pill_normal_8': 10000000, 'pill_normal_9': 50000000,
        // Immortal
        'pill_immortal_1': 100000000, 'pill_immortal_2': 500000000, 'pill_immortal_3': 2000000000,
        'pill_immortal_4': 10000000000, 'pill_immortal_5': 50000000000, 'pill_immortal_6': 200000000000,
        'pill_immortal_7': 1000000000000, 'pill_immortal_8': 5000000000000, 'pill_immortal_9': 20000000000000,
        // Eternal
        'pill_eternal_1': 100000000000000, 'pill_eternal_2': 500000000000000, 'pill_eternal_3': 2000000000000000,
        'pill_eternal_4': 10000000000000000, 'pill_eternal_5': 50000000000000000, 'pill_eternal_6': 200000000000000000,
        'pill_eternal_7': 1000000000000000000, 'pill_eternal_8': 5000000000000000000, 'pill_eternal_9': 20000000000000000000,
        // Chaos
        'pill_chaos_1': 100000000000000000000, 'pill_chaos_2': 500000000000000000000, 'pill_chaos_3': 2000000000000000000000,
        'pill_chaos_4': 10000000000000000000000, 'pill_chaos_5': 50000000000000000000000, 'pill_chaos_6': 200000000000000000000000,
        'pill_chaos_7': 1000000000000000000000000, 'pill_chaos_8': 5000000000000000000000000, 'pill_chaos_9': 20000000000000000000000000,
        // Legacy
        'exp_pill': 1000
    };

    if (pillMap[itemId]) {
        const expPerPill = pillMap[itemId];
        const totalExp = expPerPill * amount;
        db.prepare('UPDATE users SET exp = exp + ? WHERE id = ?').run(totalExp, userId);

        // Get pill name for display
        const shopItem = db.prepare('SELECT name FROM shop WHERE id = ?').get(itemId) as { name: string } | undefined;
        const pillName = shopItem?.name || 'Đan Dược';

        embed.setTitle('💊 SỬ DỤNG VẬT PHẨM')
            .setDescription(`Bạn đã sử dụng **${amount}x ${pillName}**.\nHiệu quả: Tăng **${formatNumber(totalExp)} EXP**!`)
            .setColor(0x00FF00);
        consumed = true;

    } else if (itemId.startsWith('breakthrough_pill')) {
        // Breakthrough Pills
        embed.setTitle('💊 SỬ DỤNG VẬT PHẨM')
            .setDescription(`Vật phẩm hỗ trợ đột phá sẽ **tự động được sử dụng** khi bạn thực hiện **!dotpha**.\nKhông cần sử dụng thủ công.`)
            .setColor(0xFFFF00);
        consumed = false;

    } else {
        await replyFunc('❌ Vật phẩm này không thể sử dụng trực tiếp.');
        return;
    }

    // 3. Consume Item if used
    if (consumed) {
        if (inventoryItem.count === amount) {
            db.prepare('DELETE FROM inventory WHERE user_id = ? AND item_id = ?').run(userId, itemId);
        } else {
            db.prepare('UPDATE inventory SET count = count - ? WHERE user_id = ? AND item_id = ?').run(amount, userId, itemId);
        }
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Sử dụng vật phẩm')
        .addStringOption(option => option.setName('item').setDescription('ID vật phẩm').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Số lượng (mặc định 1)').setMinValue(1)),
    aliases: ['dung', 'u'],
    async execute(interaction: ChatInputCommandInteraction) {
        const itemId = interaction.options.getString('item', true);
        const amount = interaction.options.getInteger('amount') || 1;
        await interaction.deferReply();
        await useLogic(interaction.user.id, itemId, amount, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        const itemId = args[0];
        const amount = parseInt(args[1]) || 1;

        if (!itemId) {
            await message.reply('❌ Vui lòng nhập ID vật phẩm. Ví dụ: `!dung exp_pill 10`');
            return;
        }
        await useLogic(message.author.id, itemId, amount, async (msg) => await message.reply(msg));
    }
};
