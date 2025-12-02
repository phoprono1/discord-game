import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import REALMS_DATA from '../../data/realms.json';

const HUNT_COOLDOWNS = new Set<string>();
const COOLDOWN_SECONDS = 120; // 2 minutes

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
    { name: 'Phượng Hoàng Lửa', minRealm: 8, strength: 10000 }
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
    const beast = availableBeasts[Math.floor(Math.random() * availableBeasts.length)];

    const embed = new EmbedBuilder()
        .setTitle('⚔️ SĂN BẮT YÊU THÚ ⚔️')
        .setTimestamp();

    // 4. Combat Logic
    // Simple logic: Win chance based on Realm vs Beast Strength
    // User Strength roughly correlates to Realm * 100 + EXP/10? 
    // Let's simplify: Base chance 50%. 
    // If User Realm > Beast Min Realm: +20% per level diff.
    // If User Realm < Beast Min Realm: -20% per level diff.

    let winChance = 0.5 + (userRealm - beast.minRealm) * 0.2;
    if (winChance > 0.9) winChance = 0.9;
    if (winChance < 0.1) winChance = 0.1;

    const roll = Math.random();
    const isWin = roll < winChance;

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
                { name: 'Phần thưởng', value: `+${expGain} EXP\n+${moneyGain} Xu`, inline: true }
            );
    } else {
        // LOSS
        // Penalty: Cooldown
        HUNT_COOLDOWNS.add(userId);
        setTimeout(() => HUNT_COOLDOWNS.delete(userId), COOLDOWN_SECONDS * 1000);

        embed.setDescription(`Bạn đã gặp **${beast.name}** nhưng không đánh lại!`)
            .setColor(0xFF0000)
            .addFields(
                { name: 'Kết quả', value: '🤕 Thất bại & Bị thương', inline: true },
                { name: 'Hậu quả', value: `Bạn cần nghỉ ngơi ${COOLDOWN_SECONDS} giây.`, inline: true }
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
