import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction, Collection } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';
import REALMS_DATA from '../../data/realms.json';

const cooldowns = new Map<string, number>();

async function pvpLogic(
    challengerId: string,
    targetId: string,
    betAmount: number,
    source: ChatInputCommandInteraction | Message,
    replyFunc: (content: any) => Promise<any>
) {
    // 1. Validation
    if (challengerId === targetId) {
        await replyFunc('❌ Bạn không thể tự đánh chính mình (tâm ma à?).');
        return;
    }

    if (betAmount < 0) {
        await replyFunc('❌ Tiền cược không thể âm.');
        return;
    }

    // Check Cooldown
    const configCd = db.prepare('SELECT value FROM config WHERE key = ?').get('cd_pvp') as { value: string } | undefined;
    const cooldownSeconds = configCd ? parseInt(configCd.value) : 300; // Default 5 mins

    const now = Date.now();
    const lastUsed = cooldowns.get(challengerId) || 0;
    const diff = (now - lastUsed) / 1000;

    if (diff < cooldownSeconds) {
        const remaining = Math.ceil(cooldownSeconds - diff);
        await replyFunc(`⏳ **Đang dưỡng thương!** Vui lòng đợi **${remaining}s** nữa để tiếp tục tỷ thí.`);
        return;
    }

    // Check Users
    let challenger = db.prepare('SELECT * FROM users WHERE id = ?').get(challengerId) as UserData;
    let target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as UserData;

    if (!challenger) {
        db.prepare('INSERT INTO users (id, balance, bank, exp, realm) VALUES (?, 0, 0, 0, 0)').run(challengerId);
        challenger = { id: challengerId, balance: 0, bank: 0, exp: 0, realm: 0 };
    }

    if (!target) {
        await replyFunc('❌ Đối thủ chưa bước chân vào giới tu tiên.');
        return;
    }

    // Check Balance
    if (challenger.balance < betAmount) {
        await replyFunc('❌ Bạn không đủ tiền mặt để cược.');
        return;
    }

    if (target.balance < betAmount) {
        await replyFunc('❌ Đối thủ không đủ tiền mặt để cược.');
        return;
    }

    // 2. Send Challenge
    const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('accept')
                .setLabel('⚔️ Chấp nhận')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('decline')
                .setLabel('🏳️ Từ chối')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setTitle('⚔️ LỜI TUYÊN CHIẾN ⚔️')
        .setDescription(`<@${challengerId}> muốn tỷ thí với <@${targetId}>!`)
        .addFields(
            { name: 'Tiền cược', value: `${formatNumber(betAmount)} Xu`, inline: true },
            { name: 'Thời gian', value: '60 giây để chấp nhận', inline: true }
        )
        .setColor(0xFF0000)
        .setTimestamp();

    const response = await replyFunc({ content: `<@${targetId}>`, embeds: [embed], components: [row] });

    // 3. Handle Interaction
    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async (i: ButtonInteraction) => {
        if (i.user.id !== targetId) {
            await i.reply({ content: '❌ Đây không phải chuyện của bạn!', ephemeral: true });
            return;
        }

        if (i.customId === 'decline') {
            await i.update({ content: `🏳️ <@${targetId}> đã từ chối lời thách đấu.`, components: [] });
            collector.stop();
            return;
        }

        if (i.customId === 'accept') {
            // Re-check balances just in case
            challenger = db.prepare('SELECT * FROM users WHERE id = ?').get(challengerId) as UserData;
            target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as UserData;

            if (challenger.balance < betAmount || target.balance < betAmount) {
                await i.update({ content: '❌ Giao dịch thất bại do số dư thay đổi.', components: [] });
                collector.stop();
                return;
            }

            // COMBAT LOGIC
            const p1Realm = challenger.realm || 0;
            const p2Realm = target.realm || 0;
            const realmDiff = p1Realm - p2Realm; // Positive if P1 is stronger

            // Base win chance 50%
            // Each realm level diff adds/subtracts 10%
            let winChance = 0.5 + (realmDiff * 0.1);

            // Clamp chance (Always at least 10% chance to win/lose)
            if (winChance > 0.9) winChance = 0.9;
            if (winChance < 0.1) winChance = 0.1;

            const roll = Math.random();
            const p1Wins = roll < winChance;

            let winnerId = p1Wins ? challengerId : targetId;
            let loserId = p1Wins ? targetId : challengerId;
            let winnerName = p1Wins ? `<@${challengerId}>` : `<@${targetId}>`;
            let loserName = p1Wins ? `<@${targetId}>` : `<@${challengerId}>`;

            // Rewards/Penalties
            const expReward = Math.floor(Math.random() * 50) + 10;
            const expPenalty = Math.floor(Math.random() * 30) + 5;

            // Transaction
            const updateStmt = db.prepare('UPDATE users SET balance = ?, exp = ? WHERE id = ?');

            // Winner: +Bet, +EXP
            const winner = p1Wins ? challenger : target;
            updateStmt.run(winner.balance + betAmount, winner.exp + expReward, winnerId);

            // Loser: -Bet, -EXP
            const loser = p1Wins ? target : challenger;
            updateStmt.run(loser.balance - betAmount, Math.max(0, loser.exp - expPenalty), loserId);

            // Set Cooldown for Challenger
            cooldowns.set(challengerId, Date.now());

            // Result Embed
            const resultEmbed = new EmbedBuilder()
                .setTitle('🏆 KẾT QUẢ TỶ THÍ')
                .setDescription(`Trận chiến nảy lửa đã kết thúc!`)
                .setColor(0xFFD700)
                .addFields(
                    { name: 'Người thắng', value: `${winnerName}\n+${formatNumber(betAmount)} Xu\n+${formatNumber(expReward)} EXP`, inline: true },
                    { name: 'Người thua', value: `${loserName}\n-${formatNumber(betAmount)} Xu\n-${formatNumber(expPenalty)} EXP`, inline: true },
                    { name: 'Chi tiết', value: `Chênh lệch cảnh giới: ${Math.abs(realmDiff)}\nTỷ lệ thắng của <@${challengerId}>: ${(winChance * 100).toFixed(0)}%`, inline: false }
                )
                .setTimestamp();

            await i.update({ content: null, embeds: [resultEmbed], components: [] });
            collector.stop();
        }
    });

    collector.on('end', (collected: Collection<string, ButtonInteraction>, reason: string) => {
        if (reason === 'time') {
            if (source instanceof ChatInputCommandInteraction) {
                source.editReply({ content: '⏱️ Lời thách đấu đã hết hạn.', components: [] }).catch(() => { });
            } else {
                // Message edit logic if needed, but replyFunc usually handles initial reply
            }
        }
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pvp')
        .setDescription('Tỷ thí với người chơi khác')
        .addUserOption(option => option.setName('user').setDescription('Đối thủ').setRequired(true))
        .addIntegerOption(option => option.setName('bet').setDescription('Tiền cược').setRequired(true)),
    aliases: ['tythi', 'pk', 'duel'],
    async execute(interaction: ChatInputCommandInteraction) {
        const targetUser = interaction.options.getUser('user', true);
        const bet = interaction.options.getInteger('bet', true);

        if (targetUser.bot) {
            await interaction.reply({ content: '❌ Không thể đánh nhau với Bot.', ephemeral: true });
            return;
        }

        await interaction.deferReply();
        await pvpLogic(interaction.user.id, targetUser.id, bet, interaction, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        // !tythi @user 1000
        if (args.length < 2) {
            await message.reply('❌ Sai cú pháp! Dùng: `!tythi @user <tiền_cược>`');
            return;
        }

        const targetUser = message.mentions.users.first();
        const bet = parseInt(args[1]);

        if (!targetUser) {
            await message.reply('❌ Vui lòng tag đối thủ hợp lệ.');
            return;
        }

        if (targetUser.bot) {
            await message.reply('❌ Không thể đánh nhau với Bot.');
            return;
        }

        if (isNaN(bet)) {
            await message.reply('❌ Tiền cược phải là số.');
            return;
        }

        await pvpLogic(message.author.id, targetUser.id, bet, message, async (msg) => await message.reply(msg));
    }
};
