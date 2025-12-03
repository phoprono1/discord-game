import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

const DICE_EMOJIS = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

async function taixiuLogic(
    userId: string,
    choiceInput: string,
    amountInput: string | number,
    replyFunc: (content: any) => Promise<any>
) {
    // 1. Validate Choice
    let choice = '';
    const input = choiceInput.toLowerCase();
    if (['tai', 't', 'big'].includes(input)) choice = 'tai';
    else if (['xiu', 'x', 'small'].includes(input)) choice = 'xiu';
    else {
        await replyFunc('Bạn chọn chưa đúng! Hãy chọn `tai` hoặc `xiu`.');
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

    // 3. Roll Dice
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const dice3 = Math.floor(Math.random() * 6) + 1;
    const total = dice1 + dice2 + dice3;

    // 4. Determine Result
    let result = '';
    if (dice1 === dice2 && dice2 === dice3) {
        result = 'bao'; // Triple - House wins
    } else {
        result = total >= 11 ? 'tai' : 'xiu';
    }

    // 5. Calculate Winnings
    let win = false;
    let profit = 0;

    if (result === 'bao') {
        win = false; // Always lose on Bao
    } else if (choice === result) {
        win = true;
        profit = betAmount; // 1:1 payout
    } else {
        win = false;
        profit = -betAmount;
    }

    // 6. Update Database
    if (win) {
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(profit, userId);
    } else {
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(betAmount, userId);
    }

    // 7. Config for display
    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';
    const currencyEmoji = configEmoji?.value || '🪙';

    // 8. Construct Response
    const diceVisuals = `${DICE_EMOJIS[dice1 - 1]} ${DICE_EMOJIS[dice2 - 1]} ${DICE_EMOJIS[dice3 - 1]}`;
    const resultText = result === 'bao' ? 'BÃO (Nhà cái ăn hết)' : (result === 'tai' ? 'TÀI' : 'XỈU');

    let resultMessage = '';
    if (result === 'bao') {
        resultMessage = `😱 **BÃO!!!** Bạn đã mất trắng **${betAmount} ${currencyEmoji}**!`;
    } else if (win) {
        resultMessage = `🎉 **THẮNG!** Bạn đoán đúng **${choice.toUpperCase()}**. Nhận được **${profit} ${currencyEmoji}**!`;
    } else {
        resultMessage = `💸 **THUA!** Kết quả là **${result.toUpperCase()}**. Bạn mất **${betAmount} ${currencyEmoji}**!`;
    }

    const embed = new EmbedBuilder()
        .setColor(win ? 0x00FF00 : 0xFF0000)
        .setTitle('🎲 KẾT QUẢ TÀI XỈU 🎲')
        .addFields(
            { name: 'Kết quả', value: `${diceVisuals}  ➡️  **${total} điểm** (${resultText})`, inline: false },
            { name: 'Bạn chọn', value: `**${choice.toUpperCase()}**`, inline: true },
            { name: 'Cược', value: `${betAmount} ${currencyEmoji}`, inline: true },
            { name: 'Thông báo', value: resultMessage, inline: false }
        )
        .setFooter({ text: `Số dư mới: ${formatNumber(user.balance + profit)} ${currencyName}` });

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('taixiu')
        .setDescription('Chơi Tài Xỉu (Cờ bạc)')
        .addStringOption(option =>
            option.setName('choice')
                .setDescription('Chọn Tài hoặc Xỉu')
                .setRequired(true)
                .addChoices(
                    { name: 'Tài (11-17)', value: 'tai' },
                    { name: 'Xỉu (4-10)', value: 'xiu' }
                )
        )
        .addStringOption(option =>
            option.setName('amount')
                .setDescription('Số tiền cược (hoặc "all")')
                .setRequired(true)
        ),
    aliases: ['tx', 'tai', 'xiu'],
    async execute(interaction: ChatInputCommandInteraction) {
        const choice = interaction.options.getString('choice', true);
        const amount = interaction.options.getString('amount', true);
        await taixiuLogic(interaction.user.id, choice, amount, async (msg) => await interaction.reply(msg));
    },
    async run(message: Message, args: string[]) {
        // Handle aliases like !tai 100 or !xiu 100
        let choice = args[0];
        let amount = args[1];

        const commandName = message.content.slice(1).split(' ')[0].toLowerCase();

        // If command is !tai or !xiu, the first arg is amount
        if (commandName === 'tai' || commandName === 'xiu') {
            choice = commandName;
            amount = args[0];
        }

        if (!choice || !amount) {
            await message.reply('Cách dùng: `!tx <tai/xiu> <tiền>` hoặc `!tai <tiền>`, `!xiu <tiền>`');
            return;
        }

        await taixiuLogic(message.author.id, choice, amount, async (msg) => await message.reply(msg));
    }
};
