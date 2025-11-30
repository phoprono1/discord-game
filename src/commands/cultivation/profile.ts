import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

// Duplicate REALMS for display (should be in constants.ts in future)
import REALMS_DATA from '../../data/realms.json';

const REALMS = REALMS_DATA;

async function profileLogic(userId: string, targetUser: any, replyFunc: (content: any) => Promise<any>) {
    // 1. Get User Data
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUser.id) as UserData;
    if (!user) {
        // Only create if it's the caller checking themselves? Or just show empty?
        // Let's show empty/default if checking someone else who hasn't played.
        user = { id: targetUser.id, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    const currentRealmIdx = user.realm || 0;
    const realmName = REALMS[currentRealmIdx]?.name || `Cảnh giới ${currentRealmIdx}`;

    // Calculate Progress
    let progressStr = 'Max Level';
    let percent = 100;

    if (currentRealmIdx < REALMS.length - 1) {
        const nextRealm = REALMS[currentRealmIdx + 1];
        const req = nextRealm.req;
        percent = Math.min(100, Math.floor((user.exp / req) * 100));
        progressStr = `${user.exp.toLocaleString()} / ${req.toLocaleString()} EXP (${percent}%)`;
    } else {
        progressStr = `${user.exp.toLocaleString()} EXP (Đỉnh Phong)`;
    }

    // Progress Bar
    const barLength = 10;
    const filled = Math.floor((percent / 100) * barLength);
    const empty = barLength - filled;
    const progressBar = '▓'.repeat(filled) + '░'.repeat(empty);

    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
    const currencyName = configName?.value || 'Linh Thạch';
    const currencyEmoji = configEmoji?.value || '💎';

    const embed = new EmbedBuilder()
        .setTitle(`📜 Hồ Sơ Tu Tiên: ${targetUser.username}`)
        .setColor(0x00FFFF) // Cyan
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '🧘 Cảnh Giới', value: `**${realmName}**`, inline: true },
            { name: '💰 Tài Sản', value: `${(user.balance + user.bank).toLocaleString()} ${currencyEmoji}`, inline: true },
            { name: '✨ Tu Vi', value: `${progressBar}\n${progressStr}`, inline: false }
        )
        .setFooter({ text: 'Tu hành nghịch thiên, gian nan trắc trở.' });

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Xem thông tin tu tiên')
        .addUserOption(option => option.setName('user').setDescription('Người cần xem')),
    aliases: ['tt', 'thongtin', 'me'],
    async execute(interaction: ChatInputCommandInteraction) {
        const target = interaction.options.getUser('user') || interaction.user;
        await interaction.deferReply();
        await profileLogic(interaction.user.id, target, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        const target = message.mentions.users.first() || message.author;
        await profileLogic(message.author.id, target, async (msg) => await message.reply(msg));
    }
};
