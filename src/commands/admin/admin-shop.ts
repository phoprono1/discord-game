import { SlashCommandBuilder, ChatInputCommandInteraction, Message } from 'discord.js';
import db from '../../db';

async function adminShopAdd(id: string, name: string, price: number, type: string, replyFunc: (content: string) => Promise<any>) {
    try {
        db.prepare('INSERT INTO shop (id, name, price, type) VALUES (?, ?, ?, ?)').run(id, name, price, type);
        await replyFunc(`Đã thêm vật phẩm **${name}** (${id}) giá ${price}.`);
    } catch (error) {
        await replyFunc('Thêm thất bại. ID có thể đã tồn tại.');
    }
}

async function adminShopRemove(id: string, replyFunc: (content: string) => Promise<any>) {
    const info = db.prepare('DELETE FROM shop WHERE id = ?').run(id);

    if (info.changes > 0) {
        await replyFunc(`Đã xóa vật phẩm có ID **${id}**.`);
    } else {
        await replyFunc('Không tìm thấy vật phẩm.');
    }
}

async function adminShopSetCurrency(name: string, replyFunc: (content: string) => Promise<any>) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run('currency_name', name, name);
    await replyFunc(`Tên tiền tệ đã đổi thành **${name}**.`);
}

async function adminShopSetEmoji(emoji: string, replyFunc: (content: string) => Promise<any>) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run('currency_emoji', emoji, emoji);
    await replyFunc(`Icon tiền tệ đã đổi thành ${emoji}.`);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-shop')
        .setDescription('Quản lý cửa hàng (Admin)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Thêm vật phẩm')
                .addStringOption(option => option.setName('id').setDescription('ID Duy nhất').setRequired(true))
                .addStringOption(option => option.setName('name').setDescription('Tên hiển thị').setRequired(true))
                .addIntegerOption(option => option.setName('price').setDescription('Giá').setRequired(true))
                .addStringOption(option => option.setName('type').setDescription('Loại (ore, fish, tool)').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Xóa vật phẩm')
                .addStringOption(option => option.setName('id').setDescription('ID Vật phẩm').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-currency')
                .setDescription('Đặt tên tiền tệ')
                .addStringOption(option => option.setName('name').setDescription('Tên mới').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-emoji')
                .setDescription('Đặt icon tiền tệ')
                .addStringOption(option => option.setName('emoji').setDescription('Icon mới').setRequired(true))
        ),
    aliases: ['admin', 'quanlyshop'],
    async execute(interaction: ChatInputCommandInteraction) {
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(interaction.user.id)) {
            await interaction.reply({ content: 'Bạn không có quyền sử dụng lệnh này.', ephemeral: true });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            const id = interaction.options.getString('id', true);
            const name = interaction.options.getString('name', true);
            const price = interaction.options.getInteger('price', true);
            const type = interaction.options.getString('type', true);
            await adminShopAdd(id, name, price, type, async (msg) => await interaction.reply(msg));
        } else if (subcommand === 'remove') {
            const id = interaction.options.getString('id', true);
            await adminShopRemove(id, async (msg) => await interaction.reply(msg));
        } else if (subcommand === 'set-currency') {
            const name = interaction.options.getString('name', true);
            await adminShopSetCurrency(name, async (msg) => await interaction.reply(msg));
        } else if (subcommand === 'set-emoji') {
            const emoji = interaction.options.getString('emoji', true);
            await adminShopSetEmoji(emoji, async (msg) => await interaction.reply(msg));
        }
    },
    async run(message: Message, args: string[]) {
        const adminIds = (process.env.ADMIN_IDS || '').split(',');
        if (!adminIds.includes(message.author.id)) {
            await message.reply('Bạn không có quyền sử dụng lệnh này.');
            return;
        }

        const subcommand = args[0]?.toLowerCase();

        if (subcommand === 'add' || subcommand === 'them') {
            // !admin add <id> <name> <price> <type>
            // Note: name with spaces might be tricky with simple split. For now assume single word or quoted (not handled by simple split).
            // Let's assume simple arguments for now.
            const id = args[1];
            const name = args[2];
            const price = parseInt(args[3]);
            const type = args[4];

            if (!id || !name || !price || !type) {
                await message.reply('Thiếu tham số. Dùng: `!admin them <id> <tên> <giá> <loại>`');
                return;
            }
            await adminShopAdd(id, name, price, type, async (msg) => await message.reply(msg));

        } else if (subcommand === 'remove' || subcommand === 'xoa') {
            const id = args[1];
            if (!id) {
                await message.reply('Thiếu ID. Dùng: `!admin xoa <id>`');
                return;
            }
            await adminShopRemove(id, async (msg) => await message.reply(msg));

        } else if (subcommand === 'set-currency') {
            const name = args[1];
            if (!name) {
                await message.reply('Thiếu tên. Dùng: `!admin set-currency <tên>`');
                return;
            }
            await adminShopSetCurrency(name, async (msg) => await message.reply(msg));

        } else if (subcommand === 'set-emoji') {
            const emoji = args[1];
            if (!emoji) {
                await message.reply('Thiếu emoji. Dùng: `!admin set-emoji <emoji>`');
                return;
            }
            await adminShopSetEmoji(emoji, async (msg) => await message.reply(msg));
        } else {
            await message.reply('Lệnh không hợp lệ.');
        }
    }
};
