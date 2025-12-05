import { SlashCommandBuilder, ChatInputCommandInteraction, Message, PermissionFlagsBits } from 'discord.js';
import db from '../../db';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jail')
        .setDescription('Giam người chơi vào tù (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người chơi cần phạt')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Thời gian (phút), mặc định 30')
                .setRequired(false)),
    aliases: ['giam'],
    async execute(interaction: ChatInputCommandInteraction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply('🚫 Bạn không có quyền dùng lệnh này!');
            return;
        }

        const target = interaction.options.getUser('user', true);
        const duration = interaction.options.getInteger('duration') || 30;

        const jailTime = Date.now() + duration * 60 * 1000;
        db.prepare('UPDATE users SET jail_until = ? WHERE id = ?').run(jailTime, target.id);

        await interaction.reply(`🔒 Đã giam **${target.username}** vào tù trong **${duration} phút**.`);
    },
    async run(message: Message, args: string[]) {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) return;

        const targetId = args[0]?.replace(/[<@!>]/g, '');
        const duration = parseInt(args[1]) || 30;

        if (!targetId) {
            await message.reply('Vui lòng tag người chơi. Ví dụ: `!jail @user 60`');
            return;
        }

        const jailTime = Date.now() + duration * 60 * 1000;
        db.prepare('UPDATE users SET jail_until = ? WHERE id = ?').run(jailTime, targetId);

        await message.reply(`🔒 Đã giam **<@${targetId}>** vào tù trong **${duration} phút**.`);
    }
};
