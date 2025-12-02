import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

async function useLogic(userId: string, itemId: string, replyFunc: (content: any) => Promise<any>) {
    // 1. Check Inventory
    const inventoryItem = db.prepare('SELECT * FROM inventory WHERE user_id = ? AND item_id = ?').get(userId, itemId) as { count: number } | undefined;

    if (!inventoryItem || inventoryItem.count <= 0) {
        await replyFunc('❌ Bạn không có vật phẩm này trong túi.');
        return;
    }

    // 2. Item Logic
    const embed = new EmbedBuilder().setTimestamp();
    let consumed = false;

    if (itemId === 'exp_pill') {
        // Tụ Khí Đan: +1000 EXP
        const expAmount = 1000;
        db.prepare('UPDATE users SET exp = exp + ? WHERE id = ?').run(expAmount, userId);

        embed.setTitle('💊 SỬ DỤNG VẬT PHẨM')
            .setDescription(`Bạn đã sử dụng **Tụ Khí Đan**.\nHiệu quả: Tăng **${expAmount} EXP**!`)
            .setColor(0x00FF00);
        consumed = true;

    } else if (itemId === 'breakthrough_pill') {
        // Trúc Cơ Đan
        // Just inform the user, as it's used automatically in breakthrough
        embed.setTitle('💊 SỬ DỤNG VẬT PHẨM')
            .setDescription(`**Trúc Cơ Đan** sẽ tự động được sử dụng khi bạn thực hiện **!dotpha** (Breakthrough) để tăng tỷ lệ thành công.\nKhông cần sử dụng thủ công.`)
            .setColor(0xFFFF00);
        consumed = false; // Don't consume here

    } else {
        await replyFunc('❌ Vật phẩm này không thể sử dụng trực tiếp.');
        return;
    }

    // 3. Consume Item if used
    if (consumed) {
        if (inventoryItem.count === 1) {
            db.prepare('DELETE FROM inventory WHERE user_id = ? AND item_id = ?').run(userId, itemId);
        } else {
            db.prepare('UPDATE inventory SET count = count - 1 WHERE user_id = ? AND item_id = ?').run(userId, itemId);
        }
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('Sử dụng vật phẩm')
        .addStringOption(option => option.setName('item').setDescription('ID vật phẩm').setRequired(true)),
    aliases: ['dung', 'u'],
    async execute(interaction: ChatInputCommandInteraction) {
        const itemId = interaction.options.getString('item', true);
        await interaction.deferReply();
        await useLogic(interaction.user.id, itemId, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        const itemId = args[0];
        if (!itemId) {
            await message.reply('❌ Vui lòng nhập ID vật phẩm. Ví dụ: `!dung exp_pill`');
            return;
        }
        await useLogic(message.author.id, itemId, async (msg) => await message.reply(msg));
    }
};
