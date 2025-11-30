import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';

const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];

async function checkCooldownLogic(executorId: string, replyFunc: (content: any) => Promise<any>) {
    // 1. Check Admin Permission
    if (!ADMIN_IDS.includes(executorId)) {
        await replyFunc('🚫 **Quyền lực chưa đủ!** Chỉ có Thiên Đạo (Admin) mới được dùng lệnh này.');
        return;
    }

    // 2. Fetch Configs
    const keys = ['cd_mine', 'cd_fish', 'cd_rob', 'cd_cultivate', 'cd_chat', 'cd_explore', 'cd_pvp'];
    const defaults: { [key: string]: number } = {
        'cd_mine': 5,
        'cd_fish': 5,
        'cd_rob': 600,
        'cd_cultivate': 60,
        'cd_chat': 5,
        'cd_explore': 60,
        'cd_pvp': 300
    };
    const labels: { [key: string]: string } = {
        'cd_mine': '⛏️ Đào khoáng (mine)',
        'cd_fish': '🎣 Câu cá (fish)',
        'cd_rob': '🔫 Cướp (rob)',
        'cd_cultivate': '🧘 Tu luyện (tu)',
        'cd_chat': '💬 Chat EXP (chat)',
        'cd_explore': '🗺️ Khám phá (explore)',
        'cd_pvp': '⚔️ Tỷ thí (pvp)'
    };

    const embed = new EmbedBuilder()
        .setTitle('⏱️ CẤU HÌNH COOLDOWN')
        .setColor(0xFFA500) // Orange
        .setTimestamp();

    for (const key of keys) {
        const config = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
        const currentVal = config ? parseInt(config.value) : defaults[key];
        embed.addFields({ name: labels[key], value: `**${currentVal}** giây`, inline: true });
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('check-cd')
        .setDescription('Kiểm tra thời gian hồi chiêu (Admin only)'),
    aliases: ['checkcd', 'viewcd'],
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        await checkCooldownLogic(interaction.user.id, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        await checkCooldownLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
