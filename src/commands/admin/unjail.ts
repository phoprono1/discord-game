import { SlashCommandBuilder, ChatInputCommandInteraction, Message, PermissionFlagsBits } from 'discord.js';
import db from '../../db';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unjail')
        .setDescription('Thả người chơi khỏi tù (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người chơi cần thả')
                .setRequired(true)),
    aliases: ['tha'],
    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply('🚫 Bạn không có quyền dùng lệnh này!');
            return;
        }

        const target = interaction.options.getUser('user', true);

        db.prepare('UPDATE users SET jail_until = 0 WHERE id = ?').run(target.id);

        await interaction.reply(`🔓 Đã thả **${target.username}** khỏi tù.`);
    },
    async run(message: Message, args: string[]) {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        const targetId = args[0]?.replace(/[<@!>]/g, '');

        if (!targetId) {
            await message.reply('Vui lòng tag người chơi. Ví dụ: `!unjail @user`');
            return;
        }

        db.prepare('UPDATE users SET jail_until = 0 WHERE id = ?').run(targetId);

        await message.reply(`🔓 Đã thả **<@${targetId}>** khỏi tù.`);
    }
};
