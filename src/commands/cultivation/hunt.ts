import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import REALMS_DATA from '../../data/realms.json';

const HUNT_COOLDOWNS = new Set<string>();
const COOLDOWN_SECONDS = 5; // 5 seconds

const BEASTS = [
    { name: 'Thỏ Tinh', minRealm: 0, strength: 10 },
    { name: 'Sói Hoang', minRealm: 0, strength: 30 },
    { name: 'Hổ Yêu', minRealm: 1, strength: 80 },
    { name: 'Gấu Trúc Khổng Lồ', minRealm: 2, strength: 150 },
    { name: 'Xà Tinh', minRealm: 3, strength: 300 },
    { name: 'Huyết Lang', minRealm: 4, strength: 600 },
    { name: 'Hắc Điểu', minRealm: 5, strength: 1000 },
    { name: 'Kỳ Lân Con', minRealm: 6, strength: 2000 },
    { name: 'Rồng Đất', minRealm: 7, strength: 5000 },
    { name: 'Phượng Hoàng Lửa', minRealm: 8, strength: 10000 },
    { name: 'Huyết Mãng', minRealm: 9, strength: 15000 },
    { name: 'Bạch Hổ', minRealm: 10, strength: 20000 },
    { name: 'Huyền Vũ', minRealm: 12, strength: 30000 },
    { name: 'Thanh Long', minRealm: 14, strength: 50000 },
    { name: 'Cửu Vĩ Hồ', minRealm: 16, strength: 80000 },
    { name: 'Thôn Thiên Khuyển', minRealm: 18, strength: 120000 },
    { name: 'Thái Cổ Ma Long', minRealm: 20, strength: 200000 },
    { name: 'Hỗn Độn Thú', minRealm: 22, strength: 350000 },
    { name: 'Thao Thiết', minRealm: 24, strength: 500000 },
    { name: 'Côn Bằng', minRealm: 26, strength: 1000000 }
];

async function huntLogic(userId: string, replyFunc: (content: any) => Promise<any>) {
    // 1. Check Cooldown
    if (HUNT_COOLDOWNS.has(userId)) {
        await replyFunc('⏳ Bạn đang bị thương/mệt mỏi. Hãy nghỉ ngơi thêm vài phút.');
        return;
    }

    // 2. Get User Data
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    const userRealm = user.realm || 0;
    const realmName = REALMS_DATA[userRealm]?.name || 'Phàm Nhân';

    // 3. Find Beast
    // Filter beasts that are somewhat around user's level (not too weak, not impossible)
    // Allow beasts from userRealm - 1 to userRealm + 2
    const availableBeasts = BEASTS.filter(b => b.minRealm <= userRealm + 1);

    // Random Selection (Uniform Probability)
    const beast = availableBeasts[Math.floor(Math.random() * availableBeasts.length)];

    const embed = new EmbedBuilder()
        .setTitle('⚔️ SĂN BẮT YÊU THÚ ⚔️')
        .setTimestamp();

    // 4. Combat Logic
    // Simple logic: Win chance based on Realm vs Beast Strength
    // User Strength roughly correlates to Realm * 100 + EXP/10? 
    // Let's simplify: Base chance 40%. 
    // If User Realm > Beast Min Realm: +15% per level diff.
    // If User Realm < Beast Min Realm: -15% per level diff.

    let winChance = 0.4 + (userRealm - beast.minRealm) * 0.15;
    if (winChance > 0.9) winChance = 0.9;
    if (winChance < 0.1) winChance = 0.1;

    const roll = Math.random();
    const isWin = roll < winChance;

    // Apply Cooldown based on result
    const cooldownTime = isWin ? 5 : 120;
    HUNT_COOLDOWNS.add(userId);
    setTimeout(() => HUNT_COOLDOWNS.delete(userId), cooldownTime * 1000);

    if (isWin) {
        // REWARDS
        // EXP: Beast Strength * 2
        // Money: Beast Strength * 5
        const expGain = beast.strength * 2;
        const moneyGain = beast.strength * 5;

        db.prepare('UPDATE users SET exp = exp + ?, balance = balance + ? WHERE id = ?').run(expGain, moneyGain, userId);

        embed.setDescription(`Bạn đã gặp **${beast.name}**!`)
            .setColor(0x00FF00)
            .addFields(
                { name: 'Kết quả', value: '🎉 Chiến thắng!', inline: true },
                { name: 'Phần thưởng', value: `+${expGain} EXP\n+${moneyGain} Xu`, inline: true },
                { name: 'Hồi sức', value: `Cần nghỉ ngơi ${cooldownTime} giây.`, inline: true }
            );
    } else {
        // LOSS
        // Penalty: Cooldown (Already applied)

        embed.setDescription(`Bạn đã gặp **${beast.name}** nhưng không đánh lại!`)
            .setColor(0xFF0000)
            .addFields(
                { name: 'Kết quả', value: '🤕 Thất bại & Bị thương', inline: true },
                { name: 'Hậu quả', value: `Bạn cần nghỉ ngơi ${cooldownTime} giây.`, inline: true }
            );
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hunt')
        .setDescription('Đi săn yêu thú kiếm EXP và Xu'),
    aliases: ['san', 'h'],
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        await huntLogic(interaction.user.id, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        await huntLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
