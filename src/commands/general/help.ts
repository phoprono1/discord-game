import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Xem danh sách lệnh'),
    aliases: ['help', 'hotro', 'cmd', 'lenh'],
    async execute(interaction: ChatInputCommandInteraction) {
        await helpLogic(async (msg) => await interaction.reply(msg));
    },
    async run(message: Message, args: string[]) {
        await helpLogic(async (msg) => await message.reply(msg));
    }
};

async function helpLogic(replyFunc: (content: any) => Promise<any>) {
    const embed = new EmbedBuilder()
        .setTitle('📘 Cẩm Nang Tân Thủ')
        .setDescription('Danh sách các lệnh hiện có trong hệ thống.')
        .setColor(0x00AAFF) // Azure
        .addFields(
            {
                name: '💰 Kinh Tế',
                value: '`!taisan` (!vi, !tien): Xem tài sản\n`!nganhang` (!bank): Gửi/Rút tiền\n`!cuahang` (!shop): Mua đồ\n`!bxh` (!top): Bảng xếp hạng',
                inline: false
            },
            {
                name: '⚒️ Hoạt Động',
                value: '`!dao` (!mine): Đào khoáng (5s/lần)\n`!cau` (!fish): Câu cá (5s/lần)\n`!cuop` (!rob): Cướp người khác (10p/lần)\n`!khampha` (!explore): Khám phá thế giới (60s/lần)',
                inline: false
            },
            {
                name: '🎲 Giải Trí',
                value: '`!taixiu` (!tx): Chơi Tài Xỉu\n`!xd` (!bj): Chơi Xì Dách (Blackjack)\n`!baucua` (!bc): Bầu Cua Tôm Cá\n`!duangua` (!dn): Đua Ngựa\n`!ck` (!stock): Chơi Chứng Khoán',
                inline: false
            },
            {
                name: '🧘 Tu Tiên',
                value: '`!tu` (!tuluyen): Ngồi thiền tăng EXP\n`!dotpha` (!dp): Đột phá cảnh giới\n`!canhgioi` (!realms): Xem danh sách cảnh giới\n`!tythi` (!pvp): Tỷ thí với người khác\n`!thongtin` (!tt, !me): Xem hồ sơ tu tiên',
                inline: false
            },
            {
                name: '⚙️ Khác',
                value: '`!hotro` (!help): Xem bảng này\n`!ping`: Kiểm tra độ trễ',
                inline: false
            }
        )
        .setFooter({ text: 'Chúc đạo hữu tu luyện vui vẻ!' });

    await replyFunc({ embeds: [embed] });
}
