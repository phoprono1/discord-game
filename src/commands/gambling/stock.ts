import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

async function stockLogic(
    userId: string,
    typeInput: string,
    amountInput: string | number,
    replyFunc: (content: any) => Promise<any>,
    editFunc: (content: any) => Promise<any>
) {
    // 1. Validate Type
    let type = '';
    const input = typeInput.toLowerCase();
    if (['mua', 'buy', 'up', 'tang'].includes(input)) type = 'buy';
    else if (['ban', 'sell', 'down', 'giam'].includes(input)) type = 'sell';
    else {
        await replyFunc('Vui lòng chọn `mua` (dự đoán tăng) hoặc `ban` (dự đoán giảm).');
        return;
    }

    // 2. Validate Amount & Balance
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    let betAmount = 0;
    if (amountInput === 'all' || amountInput === 'tatca') {
        betAmount = user.balance;
    } else {
        betAmount = parseInt(amountInput.toString());
    }

    if (isNaN(betAmount) || betAmount <= 0) {
        await replyFunc('Số tiền cược không hợp lệ.');
        return;
    }

    if (user.balance < betAmount) {
        await replyFunc(`Bạn không đủ tiền! Bạn chỉ có **${user.balance}**.`);
        return;
    }

    // 3. Deduct Money Immediately
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(betAmount, userId);

    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';
    const currencyEmoji = configEmoji?.value || '🪙';

    // 4. Simulation Setup
    let currentPrice = 100.00;
    const initialPrice = 100.00;
    const history: number[] = [100.00];
    const duration = 30; // seconds
    const intervalTime = 4000; // 4 seconds
    let elapsed = 0;

    // Initial Message
    const embed = new EmbedBuilder()
        .setTitle('📈 SÀN CHỨNG KHOÁN 📉')
        .setDescription(`Bạn đã đặt cược **${betAmount} ${currencyEmoji}** vào lệnh **${type === 'buy' ? 'MUA (Tăng)' : 'BÁN (Giảm)'}**.\n\n⏳ **Thời gian còn lại:** ${duration}s\n💰 **Giá hiện tại:** ${currentPrice.toFixed(2)}`)
        .setColor(0xFFFF00); // Yellow

    await replyFunc({ embeds: [embed] });

    // 5. Simulation Loop
    const interval = setInterval(async () => {
        elapsed += intervalTime / 1000;

        // Random fluctuation (-5% to +5%)
        const changePercent = (Math.random() * 0.1) - 0.05;
        currentPrice = currentPrice * (1 + changePercent);
        history.push(currentPrice);

        // Visuals
        const trend = currentPrice >= initialPrice ? '🟢' : '🔴';
        const graph = history.slice(-5).map(p => p >= initialPrice ? '🟩' : '🟥').join(''); // Simple bar graph

        const timeLeft = Math.max(0, duration - elapsed);

        embed.setDescription(
            `Bạn đã đặt cược **${betAmount} ${currencyEmoji}** vào lệnh **${type === 'buy' ? 'MUA (Tăng)' : 'BÁN (Giảm)'}**.\n\n` +
            `⏳ **Thời gian:** ${timeLeft}s\n` +
            `💰 **Giá:** ${initialPrice} -> **${currentPrice.toFixed(2)}** ${trend}\n` +
            `📊 **Biểu đồ:** ${graph}`
        );

        if (currentPrice > initialPrice) embed.setColor(0x00FF00); // Green
        else if (currentPrice < initialPrice) embed.setColor(0xFF0000); // Red
        else embed.setColor(0xFFFF00); // Yellow

        await editFunc({ embeds: [embed] });

        // End Game
        if (elapsed >= duration) {
            clearInterval(interval);

            let win = false;
            let refund = false;

            if (currentPrice > initialPrice && type === 'buy') win = true;
            else if (currentPrice < initialPrice && type === 'sell') win = true;
            else if (Math.abs(currentPrice - initialPrice) < 0.01) refund = true; // Tie

            let resultMsg = '';
            if (refund) {
                db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(betAmount, userId);
                resultMsg = `🤝 **HÒA VỐN!** Giá không đổi. Bạn nhận lại **${betAmount} ${currencyEmoji}**.`;
                embed.setColor(0xFFFF00);
            } else if (win) {
                const profit = betAmount * 2;
                db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(profit, userId);
                resultMsg = `🎉 **THẮNG LỚN!** Bạn đoán đúng! Nhận được **${profit} ${currencyEmoji}**.`;
                embed.setColor(0x00FF00);
            } else {
                resultMsg = `💸 **THUA CUỘC!** Chúc may mắn lần sau.`;
                embed.setColor(0xFF0000);
            }

            embed.addFields({ name: 'Kết quả', value: resultMsg });
            embed.setDescription(
                `Lệnh: **${type === 'buy' ? 'MUA' : 'BÁN'}** | Cược: **${betAmount}**\n` +
                `Giá chốt: **${currentPrice.toFixed(2)}** (${currentPrice >= initialPrice ? '🟢' : '🔴'})`
            );

            await editFunc({ embeds: [embed] });
        }

    }, intervalTime);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stock')
        .setDescription('Chơi chứng khoán (30s)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Mua (Tăng) hoặc Bán (Giảm)')
                .setRequired(true)
                .addChoices(
                    { name: 'Mua (Dự đoán Tăng)', value: 'buy' },
                    { name: 'Bán (Dự đoán Giảm)', value: 'sell' }
                )
        )
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Số tiền cược')
                .setRequired(true)
        ),
    aliases: ['ck', 'chungkhoan'],
    async execute(interaction: ChatInputCommandInteraction) {
        const type = interaction.options.getString('type', true);
        const amount = interaction.options.getString('amount', true);

        // Need to fetch reply to edit it later
        await interaction.deferReply();

        await stockLogic(
            interaction.user.id,
            type,
            amount,
            async (msg) => await interaction.editReply(msg),
            async (msg) => await interaction.editReply(msg)
        );
    },
    async run(message: Message, args: string[]) {
        const type = args[0];
        const amount = args[1];

        if (!type || !amount) {
            await message.reply('Cách dùng: `!ck <mua/ban> <tiền>`');
            return;
        }

        const replyMsg = await message.reply('Đang khởi tạo sàn giao dịch...');

        await stockLogic(
            message.author.id,
            type,
            amount,
            async (msg) => await replyMsg.edit(msg), // Initial edit
            async (msg) => await replyMsg.edit(msg)  // Loop edits
        );
    }
};
