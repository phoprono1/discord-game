import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

// Realm Configuration
import REALMS_DATA from '../../data/realms.json';

// Realm Configuration
const REALMS = REALMS_DATA;

async function breakthroughLogic(userId: string, replyFunc: (content: any) => Promise<any>) {
    // 1. Get User Data
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    const currentRealmIdx = user.realm || 0;
    const nextRealmIdx = currentRealmIdx + 1;

    // Check Max Level
    if (nextRealmIdx >= REALMS.length) {
        await replyFunc('👑 **Độc Cô Cầu Bại!** Bạn đã đạt đến cảnh giới cao nhất hiện tại.');
        return;
    }

    const nextRealm = REALMS[nextRealmIdx];

    // 2. Check Requirements
    if (user.exp < nextRealm.req) {
        const missing = nextRealm.req - user.exp;
        await replyFunc(`🚫 **Tu vi chưa đủ!**\nCần: **${formatNumber(nextRealm.req)} EXP** để đột phá lên **${nextRealm.name}**.\nThiếu: **${formatNumber(missing)} EXP**.`);
        return;
    }

    // 3. Attempt Breakthrough
    // 3. Attempt Breakthrough
    // Check for Breakthrough Pills (Priority: High > Mid > Basic)
    const pills = db.prepare('SELECT item_id, count FROM inventory WHERE user_id = ? AND item_id IN (?, ?, ?)').all(userId, 'breakthrough_pill_high', 'breakthrough_pill_mid', 'breakthrough_pill') as { item_id: string, count: number }[];

    let usedPillId = '';
    let bonusRate = 0;
    let pillName = '';

    const highPill = pills.find(p => p.item_id === 'breakthrough_pill_high');
    const midPill = pills.find(p => p.item_id === 'breakthrough_pill_mid');
    const basicPill = pills.find(p => p.item_id === 'breakthrough_pill');

    if (highPill && highPill.count > 0) {
        usedPillId = 'breakthrough_pill_high';
        bonusRate = 0.5; // +50% flat rate (or multiplier? User asked for "increase rate", usually additive or multiplicative. Let's do additive to be powerful)
        // Actually, previous logic was `nextRealm.rate * 0.2`. Let's stick to Multiplier for balance, or Additive for power?
        // User said "tăng tỷ lệ". Let's do Multiplier of Base Rate to avoid 100% too easily on high realms.
        // Wait, high realms have 0.000001 rate. Multiplier is useless.
        // It MUST be Additive or a very strong Multiplier.
        // Let's use ADDITIVE for these special pills to make them worth it.
        // But +50% additive is insane.
        // Let's go with:
        // Basic: +20% of Base Rate (Weak)
        // Mid: +50% of Base Rate
        // High: +100% of Base Rate (Double chance)
        // OR
        // Let's use the previous logic: `bonusRate = nextRealm.rate * multiplier`.
        // Basic: x1.2
        // Mid: x1.5
        // High: x2.0

        // RE-READING: "Đan tăng tỷ lệ đột phá".
        // If rate is 0.001 (0.1%), x2 is 0.2%. Still low.
        // Maybe these pills should add FLAT percent?
        // "Hộ Tâm Đan" (+30%), "Phá Cảnh Đan" (+50%).
        // If I add 50% flat, everyone passes.
        // Let's assume these are "Success Rate Multipliers" or "Protection"?
        // Let's stick to:
        // Basic: +20% success chance (Multiplier: rate * 1.2)
        // Mid: +50% success chance (Multiplier: rate * 1.5)
        // High: +100% success chance (Multiplier: rate * 2.0)

        // WAIT, previous code was: `bonusRate = nextRealm.rate * 0.2`. This is +20% OF THE RATE.
        // So if rate is 50%, new rate is 60%.
        // If rate is 1%, new rate is 1.2%.

        // Let's buff it for the new pills.
        // Mid: +50% (x1.5)
        // High: +100% (x2.0)

        bonusRate = nextRealm.rate * 1.0; // +100% (Double rate)
        pillName = 'Phá Cảnh Đan';
    } else if (midPill && midPill.count > 0) {
        usedPillId = 'breakthrough_pill_mid';
        bonusRate = nextRealm.rate * 0.5; // +50%
        pillName = 'Hộ Tâm Đan';
    } else if (basicPill && basicPill.count > 0) {
        usedPillId = 'breakthrough_pill';
        bonusRate = nextRealm.rate * 0.2; // +20%
        pillName = 'Trúc Cơ Đan';
    }

    const finalRate = nextRealm.rate + bonusRate;
    const success = Math.random() < finalRate;

    // Consume pill
    if (usedPillId) {
        db.prepare('UPDATE inventory SET count = count - 1 WHERE user_id = ? AND item_id = ?').run(userId, usedPillId);
        // Clean up if 0?
        db.prepare('DELETE FROM inventory WHERE user_id = ? AND item_id = ? AND count <= 0').run(userId, usedPillId);
    }

    const embed = new EmbedBuilder()
        .setTimestamp();

    if (success) {
        // SUCCESS
        db.prepare('UPDATE users SET realm = ? WHERE id = ?').run(nextRealmIdx, userId);

        embed.setTitle('✨ ĐỘT PHÁ THÀNH CÔNG! ✨')
            .setDescription(`Chúc mừng đạo hữu <@${userId}> đã bước chân vào cảnh giới **${nextRealm.name}**!`)
            .setColor(0x00FF00) // Green
            .addFields(
                { name: 'Cảnh giới mới', value: nextRealm.name, inline: true },
                { name: 'Tỷ lệ thành công', value: `${(nextRealm.rate * 100).toFixed(2)}% ${usedPillId ? `(+${(bonusRate * 100).toFixed(2)}% từ ${pillName})` : ''}`, inline: true }
            );

    } else {
        // FAILURE - LIGHTNING STRIKE
        // Penalty: Lose 10% of current EXP + 10% of Total Wealth (Medical fees)
        const expLoss = Math.floor(user.exp * 0.1);
        const totalWealth = user.balance + user.bank;
        const moneyLoss = Math.floor(totalWealth * 0.1);

        let remainingLoss = moneyLoss;
        let newBalance = user.balance;
        let newBank = user.bank;

        if (newBalance >= remainingLoss) {
            newBalance -= remainingLoss;
            remainingLoss = 0;
        } else {
            remainingLoss -= newBalance;
            newBalance = 0;
        }

        if (remainingLoss > 0) {
            newBank = Math.max(0, newBank - remainingLoss);
        }

        db.prepare('UPDATE users SET exp = exp - ?, balance = ?, bank = ? WHERE id = ?').run(expLoss, newBalance, newBank, userId);

        embed.setTitle('🌩️ ĐỘ KIẾP THẤT BẠI! 🌩️')
            .setDescription(`Thiên lôi giáng xuống! Đạo hữu <@${userId}> đột phá thất bại, thân thể trọng thương.`)
            .setColor(0xFF0000) // Red
            .addFields(
                { name: 'Tổn thất Tu Vi', value: `-${formatNumber(expLoss)} EXP`, inline: true },
                { name: 'Tiền thuốc men', value: `-${formatNumber(moneyLoss)} Xu`, inline: true },
                { name: 'Cảnh giới', value: 'Vẫn dậm chân tại chỗ', inline: false }
            );
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('breakthrough')
        .setDescription('Đột phá cảnh giới'),
    aliases: ['dotpha', 'dp'],
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        await breakthroughLogic(interaction.user.id, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        await breakthroughLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
