import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { ShopItem } from '../../types';

async function inventoryLogic(userId: string, replyFunc: (content: any) => Promise<any>) {
    // 1. Get Inventory
    const inventory = db.prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId) as { item_id: string, count: number }[];

    if (inventory.length === 0) {
        await replyFunc('🎒 **Túi đồ trống rỗng!** Bạn chưa sở hữu vật phẩm nào.');
        return;
    }

    // 2. Get Item Details from Shop (or define local map if items are not in shop DB)
    // Assuming all items are in shop table for now. If not, we might need a separate items table or map.
    // Let's fetch all shop items to map names.
    const shopItems = db.prepare('SELECT * FROM shop').all() as ShopItem[];
    const itemMap = new Map<string, ShopItem>();
    shopItems.forEach(item => itemMap.set(item.id, item));

    // 3. Build Description
    let description = '';
    for (const slot of inventory) {
        const item = itemMap.get(slot.item_id);
        const itemName = item ? item.name : slot.item_id; // Fallback to ID if name not found
        // We don't have emoji in ShopItem interface in types.ts, but user mentioned it in shop.ts logic?
        // Checking shop.ts, it doesn't seem to use emoji from DB, but hardcoded or just name.
        // Wait, shop.ts uses `item.type` in display.
        // Let's just list Name x Count.

        description += `**${itemName}** (x${slot.count})\n`;
    }

    const embed = new EmbedBuilder()
        .setTitle('🎒 TÚI ĐỒ CÁ NHÂN')
        .setDescription(description)
        .setColor(0xFFA500) // Orange
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Xem túi đồ cá nhân'),
    aliases: ['kho', 'tui', 'inv'],
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        await inventoryLogic(interaction.user.id, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        await inventoryLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
