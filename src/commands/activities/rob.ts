import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';

const COOLDOWNS = new Set<string>();

async function robLogic(
    robberId: string,
    victimId: string,
    replyFunc: (content: any) => Promise<any>
) {
    if (COOLDOWNS.has(robberId)) {
        await replyFunc('👮 Cảnh sát đang tuần tra! Hãy đợi 10 phút nữa mới được cướp tiếp.');
        return;
    }

    if (robberId === victimId) {
        await replyFunc('Bạn không thể tự cướp chính mình!');
        return;
    }

    const robber = db.prepare('SELECT * FROM users WHERE id = ?').get(robberId) as UserData;
    const victim = db.prepare('SELECT * FROM users WHERE id = ?').get(victimId) as UserData;

    if (!robber || robber.balance < 100) {
        await replyFunc('Bạn cần ít nhất **100 xu** trong ví để đi cướp (để nộp phạt nếu bị bắt).');
        return;
    }

    if (!victim || victim.balance <= 0) {
        await replyFunc('Người này không có một xu dính túi! Hãy tìm mục tiêu khác.');
        return;
    }

    // Get Cooldown from DB
    const configCD = db.prepare('SELECT value FROM config WHERE key = ?').get('cd_rob') as { value: string } | undefined;
    const cooldownTime = configCD ? parseInt(configCD.value) * 1000 : 10 * 60 * 1000; // Default 10m

    // Add cooldown
    COOLDOWNS.add(robberId);
    setTimeout(() => COOLDOWNS.delete(robberId), cooldownTime);

    const chance = Math.random();
    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const configEmoji = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_emoji') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';
    const currencyEmoji = configEmoji?.value || '🪙';

    const embed = new EmbedBuilder()
        .setTimestamp();

    if (chance < 0.35) {
        // SUCCESS (35%)
        // Steal 1% - 20% of victim's CASH balance
        const percent = (Math.floor(Math.random() * 20) + 1) / 100;
        const stolenAmount = Math.floor(victim.balance * percent);

        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(stolenAmount, robberId);
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(stolenAmount, victimId);

        embed.setTitle('🔫 CƯỚP THÀNH CÔNG!')
            .setDescription(`Bạn đã cướp được **${formatNumber(stolenAmount)} ${currencyEmoji}** từ <@${victimId}>!`)
            .setColor(0x00FF00); // Green
    } else {
        // FAIL (65%)
        // Pay 10% of robber's CASH balance as fine
        const fineAmount = Math.floor(robber.balance * 0.1);

        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(fineAmount, robberId);
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(fineAmount, victimId);

        embed.setTitle('🚔 CƯỚP THẤT BẠI!')
            .setDescription(`**BỊ BẮT!** Bạn đã bị cảnh sát tóm và phải đền bù **${formatNumber(fineAmount)} ${currencyEmoji}** cho <@${victimId}>!`)
            .setColor(0xFF0000); // Red
    }

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Cướp tiền người khác')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người muốn cướp')
                .setRequired(true)
        ),
    aliases: ['cuop', 'trom'],
    async execute(interaction: ChatInputCommandInteraction) {
        const targetUser = interaction.options.getUser('user', true);
        await robLogic(interaction.user.id, targetUser.id, async (msg) => await interaction.reply(msg));
    },
    async run(message: Message, args: string[]) {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            await message.reply('Vui lòng tag người muốn cướp. Ví dụ: `!cuop @abc`');
            return;
        }
        await robLogic(message.author.id, targetUser.id, async (msg) => await message.reply(msg));
    }
};
