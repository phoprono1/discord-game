import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

const COOLDOWNS = new Set<string>();

async function cultivateLogic(userId: string, replyFunc: (content: any) => Promise<any>) {
    // 1. Check Cooldown
    if (COOLDOWNS.has(userId)) {
        await replyFunc('🧘 **Tâm chưa tịnh!** Bạn cần nghỉ ngơi một chút trước khi tiếp tục tu luyện.');
        return;
    }

    // 2. Get User Data
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    // 3. Calculate EXP Gain
    // Base gain: 10-20 EXP
    // Realm bonus: +5 per realm level? Or maybe harder to gain at higher levels?
    // Let's keep it simple: 10-30 EXP random.
    const expGain = Math.floor(Math.random() * 21) + 10; // 10 to 30

    // 4. Update DB
    db.prepare('UPDATE users SET exp = exp + ? WHERE id = ?').run(expGain, userId);

    // Get Cooldown from DB
    const configCD = db.prepare('SELECT value FROM config WHERE key = ?').get('cd_cultivate') as { value: string } | undefined;
    const cooldownTime = configCD ? parseInt(configCD.value) * 1000 : 60000; // Default 60s

    // 5. Set Cooldown
    COOLDOWNS.add(userId);
    setTimeout(() => COOLDOWNS.delete(userId), cooldownTime);

    // 6. Reply
    // 6. Reply
    const embed = new EmbedBuilder()
        .setTitle('🧘 TU LUYỆN')
        .setDescription(`Bạn ngồi thiền hấp thu linh khí... Cảm thấy đan điền ấm nóng.`)
        .addFields(
            { name: '✨ Tu vi tăng', value: `+${expGain} EXP`, inline: true },
            { name: '📊 Tổng tu vi', value: `${(user.exp + expGain).toLocaleString()} EXP`, inline: true }
        )
        .setColor(0x9B59B6) // Purple
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cultivate')
        .setDescription('Tu luyện để tăng tu vi'),
    aliases: ['tu', 'tuluyen'],
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        await cultivateLogic(interaction.user.id, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        await cultivateLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
