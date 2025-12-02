import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

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
        await replyFunc(`🚫 **Tu vi chưa đủ!**\nCần: **${nextRealm.req.toLocaleString()} EXP** để đột phá lên **${nextRealm.name}**.\nThiếu: **${missing.toLocaleString()} EXP**.`);
        return;
    }

    // 3. Attempt Breakthrough
    // Check for Trúc Cơ Đan (breakthrough_pill)
    const pill = db.prepare('SELECT count FROM inventory WHERE user_id = ? AND item_id = ?').get(userId, 'breakthrough_pill') as { count: number } | undefined;
    let hasPill = false;
    let bonusRate = 0;

    if (pill && pill.count > 0) {
        hasPill = true;
        bonusRate = nextRealm.rate * 0.2; // +20% of base rate
    }

    const finalRate = nextRealm.rate + bonusRate;
    const success = Math.random() < finalRate;

    // Consume pill if it helped (or just consume it on attempt? usually on attempt)
    if (hasPill) {
        if (pill!.count === 1) {
            db.prepare('DELETE FROM inventory WHERE user_id = ? AND item_id = ?').run(userId, 'breakthrough_pill');
        } else {
            db.prepare('UPDATE inventory SET count = count - 1 WHERE user_id = ? AND item_id = ?').run(userId, 'breakthrough_pill');
        }
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
                { name: 'Tỷ lệ thành công', value: `${(nextRealm.rate * 100).toFixed(0)}% ${hasPill ? `(+${(bonusRate * 100).toFixed(1)}% từ Đan)` : ''}`, inline: true }
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
                { name: 'Tổn thất Tu Vi', value: `-${expLoss.toLocaleString()} EXP`, inline: true },
                { name: 'Tiền thuốc men', value: `-${moneyLoss.toLocaleString()} Xu`, inline: true },
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
