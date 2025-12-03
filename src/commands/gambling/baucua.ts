import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder, MessageFlags } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

const SYMBOLS = {
    'bau': '🍐',
    'cua': '🦀',
    'tom': '🦐',
    'ca': '🐟',
    'ga': '🐓',
    'nai': '🦌'
};

const SYMBOL_KEYS = Object.keys(SYMBOLS);

async function baucuaLogic(
    userId: string,
    bets: { [key: string]: number },
    replyFunc: (content: any) => Promise<any>
) {
    // 1. Calculate Total Bet
    let totalBet = 0;
    for (const amount of Object.values(bets)) {
        totalBet += amount;
    }

    if (totalBet <= 0) {
        await replyFunc('❌ Tổng tiền cược phải lớn hơn 0.');
        return;
    }

    // 2. Check User Balance
    let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserData;
    if (!user) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(userId);
        user = { id: userId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    if (user.balance < totalBet) {
        await replyFunc(`❌ Bạn không đủ tiền! Cần **${formatNumber(totalBet)}** nhưng chỉ có **${formatNumber(user.balance)}**.`);
        return;
    }

    // 3. Roll Dice
    const dice: string[] = [];
    const diceKeys: string[] = [];
    for (let i = 0; i < 3; i++) {
        const randomKey = SYMBOL_KEYS[Math.floor(Math.random() * SYMBOL_KEYS.length)];
        diceKeys.push(randomKey);
        dice.push(SYMBOLS[randomKey as keyof typeof SYMBOLS]);
    }

    // 4. Calculate Winnings
    let totalWinnings = 0;
    let resultDetails = '';

    // Deduct initial bet first
    let newBalance = user.balance - totalBet;

    for (const [choice, amount] of Object.entries(bets)) {
        const count = diceKeys.filter(k => k === choice).length;
        if (count > 0) {
            // Win: Return Bet + (Bet * Count)
            const winAmount = amount + (amount * count);
            totalWinnings += winAmount;
            resultDetails += `✅ **${SYMBOLS[choice as keyof typeof SYMBOLS]}**: +${formatNumber(winAmount)} (x${count})\n`;
        } else {
            resultDetails += `❌ **${SYMBOLS[choice as keyof typeof SYMBOLS]}**: -${formatNumber(amount)}\n`;
        }
    }

    newBalance += totalWinnings;

    // 5. Update DB
    db.prepare('UPDATE users SET balance = ? WHERE id = ?').run(newBalance, userId);

    // 6. Response
    const embed = new EmbedBuilder()
        .setTitle('🎲 BẦU CUA TÔM CÁ 🎲')
        .setDescription(`Kết quả: ${dice.join(' | ')}`)
        .setColor(totalWinnings > totalBet ? 0x00FF00 : 0xFF0000)
        .addFields(
            { name: 'Chi tiết cược', value: resultDetails || 'Không có', inline: false },
            { name: 'Tổng kết', value: `Cược: ${formatNumber(totalBet)}\nNhận: ${formatNumber(totalWinnings)}\nLãi/Lỗ: ${formatNumber(totalWinnings - totalBet)}`, inline: false },
            { name: 'Số dư mới', value: `${formatNumber(newBalance)} Xu`, inline: false }
        )
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('baucua')
        .setDescription('Chơi Bầu Cua Tôm Cá')
        .addStringOption(option => option.setName('bets').setDescription('Cược (vd: tom 100 cua 50)').setRequired(true)),
    aliases: ['bc', 'baucua'],
    async execute(interaction: ChatInputCommandInteraction) {
        const betString = interaction.options.getString('bets', true);
        const args = betString.split(/ +/);
        const bets: { [key: string]: number } = {};

        for (let i = 0; i < args.length; i += 2) {
            const choice = args[i].toLowerCase();
            const amount = parseInt(args[i + 1]);

            if (SYMBOL_KEYS.includes(choice) && !isNaN(amount) && amount > 0) {
                bets[choice] = (bets[choice] || 0) + amount;
            }
        }

        if (Object.keys(bets).length === 0) {
            await interaction.reply({ content: '❌ Cược không hợp lệ! Ví dụ: `/baucua bets: tom 100 cua 50`', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.deferReply();
        await baucuaLogic(interaction.user.id, bets, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        // !baucua tom 100 cua 50
        const bets: { [key: string]: number } = {};

        for (let i = 0; i < args.length; i += 2) {
            const choice = args[i].toLowerCase();
            const amount = parseInt(args[i + 1]);

            if (SYMBOL_KEYS.includes(choice) && !isNaN(amount) && amount > 0) {
                bets[choice] = (bets[choice] || 0) + amount;
            }
        }

        if (Object.keys(bets).length === 0) {
            await message.reply('❌ Cược không hợp lệ! Ví dụ: `!baucua tom 100 cua 50`\nCác con vật: `bau`, `cua`, `tom`, `ca`, `ga`, `nai`');
            return;
        }

        await baucuaLogic(message.author.id, bets, async (msg) => await message.reply(msg));
    }
};
