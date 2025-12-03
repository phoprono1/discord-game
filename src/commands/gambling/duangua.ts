import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

const HORSES = 5;
const TRACK_LENGTH = 20;
const UPDATE_INTERVAL = 2500; // 2.5 seconds

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getTrackString(position: number, isFinished: boolean) {
    const track = '-'.repeat(TRACK_LENGTH).split('');
    const horsePos = Math.min(position, TRACK_LENGTH - 1);
    track[horsePos] = '🐎';
    return `|${track.join('')}| ${isFinished ? '🏁' : ''}`;
}

async function duanguaLogic(
    userId: string,
    horseChoice: number,
    betAmount: number,
    replyFunc: (content: any) => Promise<any>,
    editFunc: (content: any) => Promise<any>
) {
    // 1. Validate Input
    if (horseChoice < 1 || horseChoice > HORSES) {
        await replyFunc(`❌ Vui lòng chọn ngựa từ 1 đến ${HORSES}.`);
        return;
    }

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
        await replyFunc(`❌ Bạn không đủ tiền! Cần **${formatNumber(betAmount)}** nhưng chỉ có **${formatNumber(user.balance)}**.`);
        return;
    }

    // Deduct bet immediately
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(betAmount, userId);

    // 3. Start Race
    let positions = new Array(HORSES).fill(0);
    let winner = -1;
    let round = 0;

    const embed = new EmbedBuilder()
        .setTitle('🐎 ĐUA NGỰA TRỰC TIẾP 🐎')
        .setDescription(`Bạn đã cược **${formatNumber(betAmount)}** vào ngựa số **${horseChoice}**.\nCuộc đua bắt đầu!`)
        .setColor(0x0099FF)
        .setTimestamp();

    // Initial message
    let raceContent = '';
    for (let i = 0; i < HORSES; i++) {
        raceContent += `**${i + 1}.** ${getTrackString(0, false)}\n`;
    }
    embed.setFields({ name: 'Đường đua', value: raceContent });

    const message = await replyFunc({ embeds: [embed] });

    // Race Loop
    while (winner === -1) {
        await sleep(UPDATE_INTERVAL);
        round++;

        // Move horses
        // Move horses
        for (let i = 0; i < HORSES; i++) {
            // Random move 1-4 steps
            const move = Math.floor(Math.random() * 4) + 1;
            positions[i] += move;
        }

        // Check for winners AFTER all horses moved
        const finishers: { index: number, position: number }[] = [];
        for (let i = 0; i < HORSES; i++) {
            if (positions[i] >= TRACK_LENGTH - 1) {
                finishers.push({ index: i + 1, position: positions[i] });
            }
        }

        if (finishers.length > 0) {
            // Sort by position (descending)
            finishers.sort((a, b) => b.position - a.position);

            // Check for ties in top position
            const maxPos = finishers[0].position;
            const topFinishers = finishers.filter(f => f.position === maxPos);

            if (topFinishers.length > 1) {
                // Random winner among ties
                const winnerObj = topFinishers[Math.floor(Math.random() * topFinishers.length)];
                winner = winnerObj.index;
            } else {
                winner = finishers[0].index;
            }
        }

        // Update UI
        raceContent = '';
        for (let i = 0; i < HORSES; i++) {
            raceContent += `**${i + 1}.** ${getTrackString(positions[i], positions[i] >= TRACK_LENGTH - 1)}\n`;
        }

        embed.setFields({ name: 'Đường đua', value: raceContent });

        if (winner !== -1) {
            embed.setTitle(`🏆 NGỰA SỐ ${winner} VỀ NHẤT! 🏆`);
            if (winner === horseChoice) {
                const winAmount = betAmount * 10;
                db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(winAmount, userId);
                embed.setColor(0x00FF00);
                embed.addFields({ name: 'Kết quả', value: `🎉 Chúc mừng! Bạn đã thắng **${formatNumber(winAmount)}** Xu!` });
            } else {
                embed.setColor(0xFF0000);
                embed.addFields({ name: 'Kết quả', value: `😢 Rất tiếc! Bạn đã thua **${formatNumber(betAmount)}** Xu.` });
            }
        }

        // Edit message (handle both interaction and normal message)
        if (message && typeof message.edit === 'function') {
            await message.edit({ embeds: [embed] });
        } else {
            await editFunc({ embeds: [embed] });
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('duangua')
        .setDescription('Đặt cược đua ngựa')
        .addIntegerOption(option => option.setName('horse').setDescription('Chọn ngựa (1-5)').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('Số tiền cược').setRequired(true)),
    aliases: ['race', 'dn'],
    async execute(interaction: ChatInputCommandInteraction) {
        const horse = interaction.options.getInteger('horse', true);
        const amount = interaction.options.getInteger('amount', true);

        await interaction.deferReply();
        await duanguaLogic(
            interaction.user.id,
            horse,
            amount,
            async (msg) => await interaction.editReply(msg),
            async (msg) => await interaction.editReply(msg)
        );
    },
    async run(message: Message, args: string[]) {
        const horse = parseInt(args[0]);
        const amount = parseInt(args[1]);

        if (isNaN(horse) || isNaN(amount)) {
            await message.reply('❌ Cú pháp: `!duangua <số_ngựa> <tiền_cược>` (Ví dụ: `!duangua 1 1000`)');
            return;
        }

        await duanguaLogic(
            message.author.id,
            horse,
            amount,
            async (msg) => await message.reply(msg),
            async (msg) => {
                // For normal messages, we can't easily edit the *reply* unless we stored it.
                // But wait, message.reply returns the sent message!
                // So the first callback returns the message, we can use that.
                // However, the logic above awaits the replyFunc.
                // Let's adjust the logic to handle this.
                // Actually, for the first call, replyFunc returns the message object.
                // The logic stores it in `const message`.
                // So we just need to pass a dummy editFunc or use the returned message.
                // The logic inside `duanguaLogic` handles `message.edit` if it exists.
                return null;
            }
        );
    }
};
