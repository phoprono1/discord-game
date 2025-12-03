import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction } from 'discord.js';
import REALMS_DATA from '../../data/realms.json';
import { formatNumber } from '../../utils';

async function realmsLogic(interactionOrMessage: ChatInputCommandInteraction | Message, initialPage: number = 1) {
    const chunkSize = 20;
    const totalPages = Math.ceil(REALMS_DATA.length / chunkSize);
    let currentPage = initialPage;

    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const generateEmbed = (page: number) => {
        const startIndex = (page - 1) * chunkSize;
        const endIndex = Math.min(startIndex + chunkSize, REALMS_DATA.length);
        const chunk = REALMS_DATA.slice(startIndex, endIndex);

        const embed = new EmbedBuilder()
            .setTitle(`📜 DANH SÁCH CẢNH GIỚI (Trang ${page}/${totalPages})`)
            .setColor(0x00FFFF) // Cyan
            .setDescription('Các cảnh giới tu luyện và điều kiện đột phá:')
            .setFooter({ text: `Trang ${page} / ${totalPages}` })
            .setTimestamp();

        chunk.forEach((realm, index) => {
            const rate = realm.rate !== undefined ? `${realm.rate * 100}%` : 'N/A';
            embed.addFields({
                name: `${startIndex + index}. ${realm.name}`,
                value: `Yêu cầu: **${formatNumber(realm.req)} EXP**\nTỷ lệ: **${rate}**`,
                inline: true
            });
        });

        return embed;
    };

    const generateButtons = (page: number) => {
        const row = new ActionRowBuilder<ButtonBuilder>()
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
        return row;
    };

    const initialEmbed = generateEmbed(currentPage);
    const initialButtons = generateButtons(currentPage);

    let sentMessage;
    if (interactionOrMessage instanceof ChatInputCommandInteraction) {
        sentMessage = await interactionOrMessage.editReply({ embeds: [initialEmbed], components: [initialButtons] });
    } else {
        sentMessage = await interactionOrMessage.reply({ embeds: [initialEmbed], components: [initialButtons] });
    }

    const collector = sentMessage.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (i: ButtonInteraction) => {
        if (i.user.id !== (interactionOrMessage instanceof ChatInputCommandInteraction ? interactionOrMessage.user.id : interactionOrMessage.author.id)) {
            await i.reply({ content: '❌ Bạn không thể điều khiển menu này!', ephemeral: true });
            return;
        }

        if (i.customId === 'prev') {
            if (currentPage > 1) currentPage--;
        } else if (i.customId === 'next') {
            if (currentPage < totalPages) currentPage++;
        }

        await i.update({ embeds: [generateEmbed(currentPage)], components: [generateButtons(currentPage)] });
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
            if (interactionOrMessage instanceof ChatInputCommandInteraction) {
                await interactionOrMessage.editReply({ components: [disabledRow] });
            } else {
                await sentMessage.edit({ components: [disabledRow] });
            }
        } catch (e) {
            // Message might be deleted
        }
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('realms')
        .setDescription('Xem danh sách cảnh giới')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Số trang muốn xem')
                .setMinValue(1)
        ),
    aliases: ['canhgioi', 'cg', 'realms'],
    async execute(interaction: ChatInputCommandInteraction) {
        const page = interaction.options.getInteger('page') || 1;
        await interaction.deferReply();
        await realmsLogic(interaction, page);
    },
    async run(message: Message, args: string[]) {
        const page = parseInt(args[0]) || 1;
        await realmsLogic(message, page);
    }
};
