import { SlashCommandBuilder, ChatInputCommandInteraction, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';
import REALMS_DATA from '../../data/realms.json';

const ITEMS_PER_PAGE = 10;

async function startLeaderboard(source: ChatInputCommandInteraction | Message, type: 'money' | 'realm' = 'money') {
    let users: any[];
    let title: string;
    let color: number;
    let emoji: string;

    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';
    const currencyEmoji = configEmoji?.value || '🪙';

    if (type === 'realm') {
        // Realm Leaderboard
        users = db.prepare('SELECT * FROM users ORDER BY realm DESC, exp DESC').all();
        title = '🧘 BẢNG XẾP HẠNG TU TIÊN';
        color = 0x00FFFF; // Cyan
        emoji = '✨';
    } else {
        // Money Leaderboard (Default)
        users = db.prepare('SELECT *, (balance + bank) as total FROM users ORDER BY total DESC').all();
        title = '🏆 BẢNG XẾP HẠNG TÀI PHÚ';
        color = 0xFFD700; // Gold
        emoji = '💰';
    }

    if (users.length === 0) {
        const msg = 'Chưa có dữ liệu người dùng.';
        if (source instanceof ChatInputCommandInteraction) await source.editReply(msg);
        else await source.reply(msg);
        return;
    }

    const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);
    let currentPage = 1;

    const generateEmbed = async (page: number) => {
        const start = (page - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const pageUsers = users.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setColor(color)
            .setFooter({ text: `Trang ${page} / ${totalPages}` })
            .setTimestamp();

        const description = (await Promise.all(pageUsers.map(async (user, index) => {
            const rank = start + index + 1;
            let username = user.id;
            try {
                const discordUser = await source.client.users.fetch(user.id);
                username = discordUser.username;
            } catch (e) {
                username = `User ${user.id}`;
            }

            let rankEmoji = '';
            if (rank === 1) rankEmoji = '🥇';
            else if (rank === 2) rankEmoji = '🥈';
            else if (rank === 3) rankEmoji = '🥉';
            else rankEmoji = `**#${rank}**`;

            if (type === 'realm') {
                const realmName = REALMS_DATA[user.realm]?.name || 'Phàm Nhân';
                return `${rankEmoji} **${username}**\n   ${emoji} Cảnh giới: **${realmName}**\n   ✨ Tu vi: ${formatNumber(user.exp)} EXP`;
            } else {
                return `${rankEmoji} **${username}**\n   ${emoji} Tổng tài sản: **${formatNumber(user.total)} ${currencyEmoji}**\n   (Ví: ${formatNumber(user.balance)} | Bank: ${formatNumber(user.bank)})`;
            }
        }))).join('\n\n');

        embed.setDescription(description);
        return embed;
    };

    const generateButtons = (page: number) => {
        return new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('⬅️ Trước')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Sau ➡️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === totalPages)
            );
    };

    const initialEmbed = await generateEmbed(currentPage);
    const initialButtons = generateButtons(currentPage);

    let response;
    if (source instanceof ChatInputCommandInteraction) {
        response = await source.editReply({ embeds: [initialEmbed], components: [initialButtons] });
    } else {
        response = await source.reply({ embeds: [initialEmbed], components: [initialButtons] });
    }

    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (i: ButtonInteraction) => {
        const callerId = source instanceof ChatInputCommandInteraction ? source.user.id : source.author.id;
        if (i.user.id !== callerId) {
            await i.reply({ content: '❌ Bạn không thể điều khiển bảng này.', ephemeral: true });
            return;
        }

        if (i.customId === 'prev') {
            if (currentPage > 1) currentPage--;
        } else if (i.customId === 'next') {
            if (currentPage < totalPages) currentPage++;
        }

        await i.update({ embeds: [await generateEmbed(currentPage)], components: [generateButtons(currentPage)] });
    });

    collector.on('end', async () => {
        const disabledRow = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('⬅️ Trước')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('Sau ➡️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );

        try {
            if (source instanceof ChatInputCommandInteraction) {
                await source.editReply({ components: [disabledRow] });
            } else {
                await response.edit({ components: [disabledRow] });
            }
        } catch (e) { }
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Xem bảng xếp hạng')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Loại bảng xếp hạng')
                .addChoices(
                    { name: 'Tài Phú (Money)', value: 'money' },
                    { name: 'Cảnh Giới (Realm)', value: 'realm' }
                )
        ),
    aliases: ['top', 'bxh', 'rank'],
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        const type = interaction.options.getString('type') as 'money' | 'realm' || 'money';
        await startLeaderboard(interaction, type);
    },
    async run(message: Message, args: string[]) {
        let type: 'money' | 'realm' = 'money';
        if (args.length > 0) {
            const arg = args[0].toLowerCase();
            if (['realm', 'canhgioi', 'cg', 'tuvi'].includes(arg)) {
                type = 'realm';
            }
        }
        await startLeaderboard(message, type);
    }
};
