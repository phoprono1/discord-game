import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';

const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];

const COOLDOWN_KEYS = {
    'mine': 'cd_mine',
    'fish': 'cd_fish',
    'rob': 'cd_rob',
    'tu': 'cd_cultivate',
    'chat': 'cd_chat',
    'explore': 'cd_explore',
    'pvp': 'cd_pvp'
};

async function configCooldownLogic(
    executorId: string,
    keyInput: string,
    seconds: number,
    replyFunc: (content: any) => Promise<any>
) {
    // 1. Check Admin Permission
    if (!ADMIN_IDS.includes(executorId)) {
        await replyFunc('🚫 **Quyền lực chưa đủ!** Chỉ có Thiên Đạo (Admin) mới được dùng lệnh này.');
        return;
    }

    // 2. Validate Key
    const dbKey = COOLDOWN_KEYS[keyInput as keyof typeof COOLDOWN_KEYS];
    if (!dbKey) {
        await replyFunc('❌ Loại cooldown không hợp lệ. Các loại: `mine`, `fish`, `rob`, `tu`, `chat`, `explore`, `pvp`.');
        return;
    }

    // 3. Update DB
    // Check if key exists
    const existing = db.prepare('SELECT * FROM config WHERE key = ?').get(dbKey);
    if (existing) {
        db.prepare('UPDATE config SET value = ? WHERE key = ?').run(seconds.toString(), dbKey);
    } else {
        db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(dbKey, seconds.toString());
    }

    // 4. Response
    await replyFunc(`✅ Đã cập nhật cooldown **${keyInput}** thành **${seconds} giây**.`);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config-cd')
        .setDescription('Cấu hình thời gian hồi chiêu (Admin only)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Loại hoạt động')
                .setRequired(true)
                .addChoices(
                    { name: 'Đào khoáng (mine)', value: 'mine' },
                    { name: 'Câu cá (fish)', value: 'fish' },
                    { name: 'Cướp (rob)', value: 'rob' },
                    { name: 'Tu luyện (tu)', value: 'tu' },
                    { name: 'Chat EXP (chat)', value: 'chat' },
                    { name: 'Khám phá (explore)', value: 'explore' },
                    { name: 'Tỷ thí (pvp)', value: 'pvp' }
                )
        )
        .addIntegerOption(option => option.setName('seconds').setDescription('Số giây').setRequired(true)),
    aliases: ['cd', 'setcd'],
    async execute(interaction: ChatInputCommandInteraction) {
        const type = interaction.options.getString('type', true);
        const seconds = interaction.options.getInteger('seconds', true);
        await interaction.deferReply();
        await configCooldownLogic(interaction.user.id, type, seconds, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        // !cd mine 10
        if (args.length < 2) {
            await message.reply('❌ Sai cú pháp! Dùng: `!cd <loại> <giây>`\nCác loại: `mine`, `fish`, `rob`, `tu`, `chat`, `explore`, `pvp`');
            return;
        }

        const type = args[0].toLowerCase();
        const seconds = parseInt(args[1]);

        if (isNaN(seconds)) {
            await message.reply('❌ Số giây phải là số nguyên.');
            return;
        }

        await configCooldownLogic(message.author.id, type, seconds, async (msg) => await message.reply(msg));
    }
};
