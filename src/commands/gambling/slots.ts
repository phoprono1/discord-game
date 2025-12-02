import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder, MessageFlags } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

const SYMBOLS = ['🍒', '🍋', '🍇', '🍉', '🔔', '💎', '7️⃣'];
const WEIGHTS = [20, 20, 20, 20, 10, 8, 2]; // Total 100

function getRandomSymbol(): string {
    const totalWeight = WEIGHTS.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < SYMBOLS.length; i++) {
        if (random < WEIGHTS[i]) {
            return SYMBOLS[i];
        }
        random -= WEIGHTS[i];
    }
    return SYMBOLS[0];
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function slotsLogic(
    userId: string,
    betAmount: number,
    replyFunc: (content: any) => Promise<any>,
    editFunc: (content: any) => Promise<any>
) {
    // 1. Validate Input
    if (betAmount <= 0) {
        await replyFunc('❌ Số tiền cược phải lớn hơn 0.');
        return;
    }

    // 2. Check Balance
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    if (user.balance < betAmount) {
        await replyFunc(`❌ Bạn không đủ tiền! Cần **${betAmount.toLocaleString()}** nhưng chỉ có **${user.balance.toLocaleString()}**.`);
        return;
    }

    // Deduct bet
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(betAmount, userId);

    // 3. Animation
    const embed = new EmbedBuilder()
        .setTitle('🎰 QUAY XÈNG (SLOTS) 🎰')
        .setDescription(`Cược: **${betAmount.toLocaleString()}** Xu\n\n[ 🌀 | 🌀 | 🌀 ]`)
        .setColor(0x0099FF)
        .addFields({
            name: 'Bảng Thưởng',
            value: '7️⃣7️⃣7️⃣: x100 | 💎💎💎: x50\n🔔🔔🔔: x20 | 🍒/🍋...: x10\n2 Giống nhau: x2'
        })
        .setFooter({ text: 'Chúc may mắn!' });

    const message = await replyFunc({ embeds: [embed] });

    // Spin results
    const result = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

    // Animation steps
    // Step 1: Reveal 1st
    await sleep(1000);
    embed.setDescription(`Cược: **${betAmount.toLocaleString()}** Xu\n\n[ ${result[0]} | 🌀 | 🌀 ]`);
    if (message && typeof message.edit === 'function') await message.edit({ embeds: [embed] });
    else await editFunc({ embeds: [embed] });

    // Step 2: Reveal 2nd
    await sleep(1000);
    embed.setDescription(`Cược: **${betAmount.toLocaleString()}** Xu\n\n[ ${result[0]} | ${result[1]} | 🌀 ]`);
    if (message && typeof message.edit === 'function') await message.edit({ embeds: [embed] });
    else await editFunc({ embeds: [embed] });

    // Step 3: Reveal 3rd (Final)
    await sleep(1000);

    // 4. Calculate Winnings
    let multiplier = 0;
    let winType = '';

    if (result[0] === result[1] && result[1] === result[2]) {
        // 3 matching symbols
        const symbol = result[0];
        if (symbol === '7️⃣') {
            multiplier = 100;
            winType = 'JACKPOT! 🎆';
        } else if (symbol === '💎') {
            multiplier = 50;
            winType = 'SIÊU TO KHỔNG LỒ! 💎';
        } else if (symbol === '🔔') {
            multiplier = 20;
            winType = 'THẮNG LỚN! 🔔';
        } else {
            multiplier = 10;
            winType = 'THẮNG! 🎉';
        }
    } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
        // 2 matching symbols
        multiplier = 2;
        winType = 'AN ỦI 🎈';
    }

    const winAmount = betAmount * multiplier;

    embed.setDescription(`Cược: **${betAmount.toLocaleString()}** Xu\n\n[ ${result[0]} | ${result[1]} | ${result[2]} ]`);

    if (multiplier > 0) {
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(winAmount, userId);
        embed.setColor(0x00FF00);
        embed.addFields({ name: 'Kết quả', value: `${winType}\nBạn nhận được: **${winAmount.toLocaleString()}** Xu` });
    } else {
        embed.setColor(0xFF0000);
        embed.addFields({ name: 'Kết quả', value: 'Chúc bạn may mắn lần sau! 😢' });
    }

    if (message && typeof message.edit === 'function') await message.edit({ embeds: [embed] });
    else await editFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Chơi quay xèng')
        .addIntegerOption(option => option.setName('amount').setDescription('Số tiền cược').setRequired(true)),
    aliases: ['quay', 's', 'slots'],
    async execute(interaction: ChatInputCommandInteraction) {
        const amount = interaction.options.getInteger('amount', true);

        await interaction.deferReply();
        await slotsLogic(
            interaction.user.id,
            amount,
            async (msg) => await interaction.editReply(msg),
            async (msg) => await interaction.editReply(msg)
        );
    },
    async run(message: Message, args: string[]) {
        const amount = parseInt(args[0]);

        if (isNaN(amount)) {
            await message.reply('❌ Cú pháp: `!slots <tiền_cược>` (Ví dụ: `!slots 100`)');
            return;
        }

        await slotsLogic(
            message.author.id,
            amount,
            async (msg) => await message.reply(msg),
            async (msg) => { return null; }
        );
    }
};
