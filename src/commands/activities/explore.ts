import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

const cooldowns = new Map<string, number>();

async function exploreLogic(userId: string, replyFunc: (content: any) => Promise<any>) {
    // 1. Get Cooldown Config
    const configCd = db.prepare('SELECT value FROM config WHERE key = ?').get('cd_explore') as { value: string } | undefined;
    const cooldownSeconds = configCd ? parseInt(configCd.value) : 60; // Default 60s

    // 2. Check Cooldown
    const now = Date.now();
    const lastUsed = cooldowns.get(userId) || 0;
    const diff = (now - lastUsed) / 1000;

    if (diff < cooldownSeconds) {
        const remaining = Math.ceil(cooldownSeconds - diff);
        await replyFunc(`⏳ **Đang nghỉ ngơi!** Vui lòng đợi **${remaining}s** nữa để tiếp tục khám phá.`);
        return;
    }

    cooldowns.set(userId, now);

    // 2. Get User Data
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';

    // 3. Random Event Logic
    const chance = Math.random();
    const embed = new EmbedBuilder().setTimestamp();

    // Realm Multiplier
    const realmLevel = user.realm || 0;
    const multiplier = 1 + (realmLevel * 0.5);

    if (chance < 0.15) {
        // BAD EVENT: Encounter Beast (Lose EXP)
        const baseLoss = Math.floor(Math.random() * 50) + 10;
        const expLoss = Math.floor(baseLoss * multiplier);
        let newExp = Math.max(0, user.exp - expLoss);

        db.prepare('UPDATE users SET exp = ? WHERE id = ?').run(newExp, userId);

        embed.setTitle('👹 GẶP YÊU THÚ!')
            .setDescription('Bạn vô tình đi lạc vào hang ổ Yêu Thú. May mắn chạy thoát nhưng kinh hồn bạt vía.')
            .setColor(0xFF0000) // Red
            .addFields({ name: 'Hậu quả', value: `-${formatNumber(expLoss)} EXP`, inline: true });

    } else if (chance < 0.30) {
        // BAD EVENT: Robbed (Lose Money)
        const baseLoss = Math.floor(Math.random() * 100) + 20;
        const moneyLoss = Math.floor(baseLoss * multiplier);

        // Deduct logic (Balance -> Bank)
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

        db.prepare('UPDATE users SET balance = ?, bank = ? WHERE id = ?').run(newBalance, newBank, userId);

        embed.setTitle('💸 GẶP CƯỚP ĐƯỜNG!')
            .setDescription('Một toán cướp chặn đường trấn lột. "Của đi thay người"!')
            .setColor(0xFF0000) // Red
            .addFields({ name: 'Mất', value: `-${formatNumber(moneyLoss)} ${currencyName}`, inline: true });

    } else if (chance < 0.45) {
        // NEUTRAL: Nothing
        embed.setTitle('🍃 KHÔNG CÓ GÌ')
            // ... (unchanged)
            .setDescription('Bạn đi dạo một vòng nhưng không tìm thấy gì đặc biệt.')
            .setColor(0x808080); // Gray

    } else if (chance < 0.75) {
        // GOOD EVENT: Found Money
        const baseGain = Math.floor(Math.random() * 200) + 50;
        const moneyGain = Math.floor(baseGain * multiplier);
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(moneyGain, userId);

        embed.setTitle('💰 NHẶT ĐƯỢC CỦA RƠI')
            .setDescription('Bạn tình cờ nhặt được một túi tiền ai đó đánh rơi.')
            .setColor(0x00FF00) // Green
            .addFields({ name: 'Nhận được', value: `+${formatNumber(moneyGain)} ${currencyName}`, inline: true });

    } else if (chance < 0.95) {
        // GOOD EVENT: Absorb Essence (EXP)
        const baseGain = Math.floor(Math.random() * 100) + 30;
        const expGain = Math.floor(baseGain * multiplier);
        db.prepare('UPDATE users SET exp = exp + ? WHERE id = ?').run(expGain, userId);

        embed.setTitle('✨ HẤP THỤ LINH KHÍ')
            .setDescription('Bạn tìm thấy một vùng đất linh khí dồi dào, tu vi tăng tiến.')
            .setColor(0x00FF00) // Green
            .addFields({ name: 'Tu vi tăng', value: `+${formatNumber(expGain)} EXP`, inline: true });

    } else {
        // RARE EVENT: Treasure (Money + EXP)
        const baseMoney = Math.floor(Math.random() * 500) + 200;
        const baseExp = Math.floor(Math.random() * 200) + 100;

        const moneyGain = Math.floor(baseMoney * multiplier);
        const expGain = Math.floor(baseExp * multiplier);

        db.prepare('UPDATE users SET balance = balance + ?, exp = exp + ? WHERE id = ?').run(moneyGain, expGain, userId);

        embed.setTitle('💎 TÌM THẤY KHO BÁU! 💎')
            .setDescription('Vận may tề thiên! Bạn tìm thấy một hang động cổ xưa chứa đầy châu báu và bí kíp.')
            .setColor(0xFFD700) // Gold
            .addFields(
                { name: 'Tài sản', value: `+${formatNumber(moneyGain)} ${currencyName}`, inline: true },
                { name: 'Tu vi', value: `+${formatNumber(expGain)} EXP`, inline: true }
            );
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('explore')
        .setDescription('Đi khám phá thế giới (Random sự kiện)'),
    aliases: ['khampha', 'kp', 'explore'],
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply();
        await exploreLogic(interaction.user.id, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        await exploreLogic(message.author.id, async (msg) => await message.reply(msg));
    }
};
