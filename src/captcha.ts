import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    Message,
    ChatInputCommandInteraction,
    InteractionResponse,
    ComponentType,
    ButtonInteraction,
    Client
} from 'discord.js';
import db from './db';

// Random Icons for Captcha
const ICONS = [
    { name: 'Quả Táo', emoji: '🍎' },
    { name: 'Quả Chuối', emoji: '🍌' },
    { name: 'Nho', emoji: '🍇' },
    { name: 'Dưa Hấu', emoji: '🍉' },
    { name: 'Cà Rốt', emoji: '🥕' },
    { name: 'Bánh Mỳ', emoji: '🍞' },
    { name: 'Kẹo', emoji: '🍬' },
    { name: 'Cái Rìu', emoji: '🪓' },
    { name: 'Cần Câu', emoji: '🎣' },
    { name: 'Kiếm', emoji: '🗡️' }
];

// Helper to shuffle array
function shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function checkCaptcha(
    userId: string,
    replyFunc: (content: any) => Promise<any>,
    client: Client
): Promise<boolean> {
    // 1. Chance Check (e.g., 5%)
    // Can be configured in DB later
    const CHANCE = 0.05;
    if (Math.random() > CHANCE) return true; // Pass (no captcha)

    // 2. Generate Random Question
    const targetItem = ICONS[Math.floor(Math.random() * ICONS.length)];

    // Get 2 other distractors
    const distractors = ICONS.filter(i => i.name !== targetItem.name);
    const options = shuffle([targetItem, shuffle(distractors)[0], shuffle(distractors)[1]]);

    // Generate UUIDs for buttons to prevent static ID scripts
    const correctId = `captcha_correct_${Date.now()}_${Math.random()}`;
    const wrongId1 = `captcha_wrong_1_${Date.now()}_${Math.random()}`;
    const wrongId2 = `captcha_wrong_2_${Date.now()}_${Math.random()}`;

    const buttons = options.map(opt => {
        const isCorrect = opt.name === targetItem.name;
        return new ButtonBuilder()
            .setCustomId(isCorrect ? correctId : (options.indexOf(opt) === 0 ? wrongId1 : wrongId2)) // Use random ID
            .setEmoji(opt.emoji)
            .setLabel(opt.name) // Can hide label to make it harder (only Emoji), but let's keep for now
            .setStyle(ButtonStyle.Secondary);
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    const embed = new EmbedBuilder()
        .setTitle('🛡️ KIỂM TRA BẢO MẬT (CAPTCHA)')
        .setDescription(`Hệ thống phát hiện bất thường. Vui lòng bấm vào nút **${targetItem.emoji} ${targetItem.name}** bên dưới để tiếp tục.\n⏳ Thời gian: 60 giây.`)
        .setColor(0xFFA500); // Orange

    const msg = await replyFunc({ content: `<@${userId}>`, embeds: [embed], components: [row] });

    if (!msg) return false; // Should not happen

    // 3. Collector
    try {
        const confirmation = await msg.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: (i: ButtonInteraction) => i.user.id === userId,
            time: 60_000
        });

        if (confirmation.customId === correctId) {
            await confirmation.update({ content: '✅ **Xác thực thành công!** Bạn có thể tiếp tục chơi.', embeds: [], components: [] });
            return true;
        } else {
            // Wrong Answer
            await handleFailure(userId, confirmation);
            return false;
        }
    } catch (e) {
        // Timeout
        await handleFailureTimeout(userId, msg);
        return false;
    }
}

async function handleFailure(userId: string, interaction: ButtonInteraction) {
    const jailTime = Date.now() + 30 * 60 * 1000; // 30 minutes
    db.prepare('UPDATE users SET jail_until = ? WHERE id = ?').run(jailTime, userId);

    await interaction.update({
        content: `🚫 **Xác thực thất bại!**\nBạn đã bị giam vào ngục 30 phút vì nghi vấn dùng tool.\nThời gian được thả: <t:${Math.floor(jailTime / 1000)}:R>`,
        embeds: [],
        components: []
    });
}

async function handleFailureTimeout(userId: string, message: Message | InteractionResponse) {
    const jailTime = Date.now() + 30 * 60 * 1000; // 30 minutes
    db.prepare('UPDATE users SET jail_until = ? WHERE id = ?').run(jailTime, userId);

    // Can't edit ephemeral interaction response easily if it's not deferred/replied properly in some contexts, but message.edit works for normal messages.
    // Safe try/catch
    try {
        if (message instanceof Message) {
            await message.edit({
                content: `⌛ **Hết thời gian!**\nBạn đã bị giam vào ngục 30 phút vì không phản hồi.\nThời gian được thả: <t:${Math.floor(jailTime / 1000)}:R>`,
                embeds: [],
                components: []
            });
        }
    } catch (e) { console.error("Could not edit timeout message", e); }
}

export function isJailed(userId: string): { jailed: boolean, until: number } {
    const user = db.prepare('SELECT jail_until FROM users WHERE id = ?').get(userId) as { jail_until: number } | undefined;
    if (user && user.jail_until && user.jail_until > Date.now()) {
        return { jailed: true, until: user.jail_until };
    }
    return { jailed: false, until: 0 };
}
