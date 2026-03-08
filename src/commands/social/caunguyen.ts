import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';
import { formatNumber } from '../../utils';
import realms from '../../data/realms.json';

const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000; // 30 phút

// Tính EXP thưởng: 1% ~ 5% của khoảng cách EXP đến realm tiếp theo
function calcExpReward(targetData: UserData): number {
    const currentRealmIndex = targetData.realm;
    const nextRealm = realms[currentRealmIndex + 1];

    let gapExp: number;
    if (!nextRealm) {
        // Đã đạt cảnh giới tối đa, dùng 1-5% EXP hiện tại
        gapExp = targetData.exp;
    } else {
        const currentRealmReq = realms[currentRealmIndex].req;
        gapExp = nextRealm.req - currentRealmReq;
    }

    const percent = (Math.random() * 4 + 1) / 100; // 1% ~ 5%
    return Math.max(1, Math.floor(gapExp * percent));
}

async function caunnguyenLogic(
    prayerId: string,
    targetId: string,
    targetDisplayName: string,
    targetAvatarURL: string,
    replyFunc: (content: any) => Promise<any>
) {
    if (prayerId === targetId) {
        await replyFunc({ content: '🙏 Bạn không thể tự cầu nguyện cho chính mình!', flags: 64 });
        return;
    }

    // Kiểm tra cooldown
    const lastUsed = cooldowns.get(prayerId) || 0;
    const diff = Date.now() - lastUsed;
    if (diff < COOLDOWN_MS) {
        const remaining = Math.ceil((COOLDOWN_MS - diff) / 1000 / 60);
        await replyFunc({ content: `⏳ Tâm lực chưa hồi phục! Còn **${remaining} phút** nữa mới có thể cầu nguyện tiếp.`, flags: 64 });
        return;
    }

    const prayerData = db.prepare('SELECT * FROM users WHERE id = ?').get(prayerId) as UserData | undefined;
    const targetData = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId) as UserData | undefined;

    if (!prayerData) {
        await replyFunc({ content: '❌ Bạn chưa có tài khoản! Hãy dùng lệnh tu luyện để bắt đầu.', flags: 64 });
        return;
    }

    if (!targetData) {
        await replyFunc({ content: '❌ Người này chưa có tài khoản tu luyện!', flags: 64 });
        return;
    }

    // Tính EXP thưởng scale theo realm
    const expGain = calcExpReward(targetData);

    // 10% cơ hội "phước lành kép" — người cầu nguyện cũng nhận EXP
    const isDoubleBless = Math.random() < 0.10;
    const selfExpGain = isDoubleBless ? calcExpReward(prayerData) : 0;

    // Cập nhật DB
    db.prepare('UPDATE users SET exp = exp + ? WHERE id = ?').run(expGain, targetId);
    if (isDoubleBless) {
        db.prepare('UPDATE users SET exp = exp + ? WHERE id = ?').run(selfExpGain, prayerId);
    }

    // Đặt cooldown
    cooldowns.set(prayerId, Date.now());

    const prayerRealm = realms[prayerData.realm]?.name || 'Phàm Nhân';
    const targetRealm = realms[targetData.realm]?.name || 'Phàm Nhân';
    const nextRealmName = realms[targetData.realm + 1]?.name;

    const embed = new EmbedBuilder()
        .setColor(isDoubleBless ? 0xFFD700 : 0xA855F7)
        .setTitle(isDoubleBless ? '✨ PHƯỚC LÀNH KÉP! ✨' : '🙏 Lời Cầu Nguyện Được Lắng Nghe')
        .setThumbnail(targetAvatarURL)
        .setDescription(
            isDoubleBless
                ? `Thiên Đạo cảm ứng lời cầu nguyện chí thành của <@${prayerId}>!\n**Cả hai** đều nhận được ân huệ!`
                : `<@${prayerId}> thành tâm cầu nguyện cho <@${targetId}>.\nThiên Đạo ban xuống ân huệ tu luyện!`
        )
        .addFields(
            { name: '🎯 Người nhận', value: `<@${targetId}>\n*${targetRealm}*`, inline: true },
            { name: '🌟 EXP ban tặng', value: `**+${formatNumber(expGain)} EXP**`, inline: true },
            ...(nextRealmName ? [{ name: '📈 Cảnh giới kế tiếp', value: nextRealmName, inline: true }] : []),
            ...(isDoubleBless ? [{ name: `💫 <@${prayerId}> cũng nhận được`, value: `**+${formatNumber(selfExpGain)} EXP**`, inline: false }] : []),
            { name: '🏮 Cảnh giới người cầu nguyện', value: prayerRealm, inline: true },
        )
        .setFooter({ text: '⏳ Cooldown: 30 phút' })
        .setTimestamp();

    await replyFunc({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('caunguyen')
        .setDescription('🙏 Cầu nguyện ban phước EXP tu luyện cho người khác')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Người bạn muốn cầu nguyện cho')
                .setRequired(true)
        ),
    aliases: ['pray', 'phucloc'],
    async execute(interaction: ChatInputCommandInteraction) {
        const targetUser = interaction.options.getUser('user', true);
        await caunnguyenLogic(
            interaction.user.id,
            targetUser.id,
            targetUser.displayName,
            targetUser.displayAvatarURL(),
            async (msg) => await interaction.reply(msg)
        );
    },
    async run(message: Message, args: string[]) {
        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            await message.reply('🙏 Vui lòng tag người muốn cầu nguyện. Ví dụ: `!caunguyen @user`');
            return;
        }
        const member = message.guild?.members.cache.get(targetUser.id);
        await caunnguyenLogic(
            message.author.id,
            targetUser.id,
            member?.displayName ?? targetUser.displayName,
            targetUser.displayAvatarURL(),
            async (msg) => await message.reply(msg)
        );
    }
};
