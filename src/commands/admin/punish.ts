import { SlashCommandBuilder, ChatInputCommandInteraction, Message, EmbedBuilder } from 'discord.js';
import db from '../../db';
import { UserData } from '../../types';

const ADMIN_IDS = process.env.ADMIN_IDS?.split(',') || [];

async function punishLogic(
    executorId: string,
    targetInput: string, // 'all' or userId
    moneyPenalty: number,
    expPenalty: number,
    replyFunc: (content: any) => Promise<any>
) {
    // 1. Check Admin Permission
    if (!ADMIN_IDS.includes(executorId)) {
        await replyFunc('🚫 **Quyền lực chưa đủ!** Chỉ có Thiên Đạo (Admin) mới được dùng lệnh này.');
        return;
    }

    // 2. Identify Targets
    let targets: UserData[] = [];

    if (targetInput === 'all') {
        // Get all users EXCEPT the executor (admin)
        targets = db.prepare('SELECT * FROM users WHERE id != ?').all(executorId) as UserData[];
    } else {
        // Specific user
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetInput) as UserData;
        if (user) {
            targets.push(user);
        } else {
            await replyFunc('❌ Không tìm thấy người chơi này.');
            return;
        }
    }

    if (targets.length === 0) {
        await replyFunc('❌ Không có mục tiêu nào để trừng phạt.');
        return;
    }

    // 3. Apply Punishment
    let count = 0;
    const affectedNames: string[] = [];

    const updateStmt = db.prepare('UPDATE users SET balance = ?, bank = ?, exp = ?, realm = ? WHERE id = ?');

    for (const user of targets) {
        let remainingPenalty = moneyPenalty;
        let newBalance = user.balance;
        let newBank = user.bank;

        if (newBalance >= remainingPenalty) {
            newBalance -= remainingPenalty;
            remainingPenalty = 0;
        } else {
            remainingPenalty -= newBalance;
            newBalance = 0;
        }

        if (remainingPenalty > 0) {
            newBank = Math.max(0, newBank - remainingPenalty);
        }

        let newExp = user.exp - expPenalty;
        let newRealm = user.realm;
        let realmDropped = false;

        // Check Realm Drop Logic
        if (newExp < 0) {
            if (newRealm > 0) {
                newRealm -= 1;
                newExp = 0; // Reset EXP to 0 after dropping realm
                realmDropped = true;
            } else {
                newExp = 0; // Already mortal, just 0 EXP
            }
        }

        updateStmt.run(newBalance, newBank, newExp, newRealm, user.id);
        count++;
        if (targetInput !== 'all') {
            // If single target, we can show more detail
            // But for 'all', we just list names or count
        }
        // Fetch username for display (might be slow for 'all' if we fetch from discord, so we rely on what we have or just count)
    }

    // 4. Response
    const configName = db.prepare('SELECT value FROM config WHERE key = ?').get('currency_name') as { value: string } | undefined;
    const currencyName = configName?.value || 'Xu';

    if (targetInput === 'all') {
        const embed = new EmbedBuilder()
            .setTitle('🌩️ THIÊN ĐẠO TRỪNG PHẠT! 🌩️')
            .setDescription(`Thiên lôi giáng xuống toàn server!`)
            .setColor(0xFF0000)
            .addFields(
                { name: 'Số nạn nhân', value: `${count} người`, inline: true },
                { name: 'Hình phạt', value: `-${moneyPenalty} ${currencyName}\n-${expPenalty} EXP`, inline: true },
                { name: 'Hậu quả', value: 'Kẻ nào âm EXP sẽ bị rớt cảnh giới!', inline: false }
            )
            .setTimestamp();
        await replyFunc({ embeds: [embed] });
    } else {
        const embed = new EmbedBuilder()
            .setTitle('⚡ TRỪNG PHẠT CÁ NHÂN ⚡')
            .setDescription(`Đạo hữu <@${targetInput}> đã chọc giận Thiên Đạo!`)
            .setColor(0xFF0000)
            .addFields(
                { name: 'Hình phạt', value: `-${moneyPenalty} ${currencyName}\n-${expPenalty} EXP`, inline: true },
                { name: 'Trạng thái', value: 'Nếu EXP về âm, cảnh giới đã bị rớt!', inline: false }
            )
            .setTimestamp();
        await replyFunc({ embeds: [embed] });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('punish')
        .setDescription('Trừng phạt người chơi (Admin only)')
        .addIntegerOption(option => option.setName('money').setDescription('Số tiền phạt').setRequired(true))
        .addIntegerOption(option => option.setName('exp').setDescription('Số EXP phạt').setRequired(true))
        .addUserOption(option => option.setName('user').setDescription('Người bị phạt (để trống nếu chọn all)'))
        .addStringOption(option => option.setName('scope').setDescription('Chọn "all" để phạt tất cả').setChoices({ name: 'Tất cả', value: 'all' })),
    aliases: ['trungphat', 'phat', 'punish'],
    async execute(interaction: ChatInputCommandInteraction) {
        const scope = interaction.options.getString('scope');
        const targetUser = interaction.options.getUser('user');
        const money = interaction.options.getInteger('money', true);
        const exp = interaction.options.getInteger('exp', true);

        let targetInput = '';
        if (scope === 'all') {
            targetInput = 'all';
        } else if (targetUser) {
            targetInput = targetUser.id;
        } else {
            await interaction.reply({ content: '❌ Vui lòng chọn người chơi hoặc chọn scope "all".', ephemeral: true });
            return;
        }

        await interaction.deferReply();
        await punishLogic(interaction.user.id, targetInput, money, exp, async (msg) => await interaction.editReply(msg));
    },
    async run(message: Message, args: string[]) {
        // !trungphat @user 1000 500
        // !trungphat all 1000 500

        if (args.length < 3) {
            await message.reply('❌ Sai cú pháp! Dùng: `!trungphat @user <tien> <exp>` hoặc `!trungphat all <tien> <exp>`');
            return;
        }

        const targetArg = args[0];
        const money = parseInt(args[1]);
        const exp = parseInt(args[2]);

        if (isNaN(money) || isNaN(exp)) {
            await message.reply('❌ Tiền và EXP phải là số nguyên.');
            return;
        }

        let targetInput = '';
        if (targetArg.toLowerCase() === 'all') {
            targetInput = 'all';
        } else {
            const targetUser = message.mentions.users.first();
            if (targetUser) {
                targetInput = targetUser.id;
            } else {
                await message.reply('❌ Vui lòng tag người chơi hợp lệ.');
                return;
            }
        }

        await punishLogic(message.author.id, targetInput, money, exp, async (msg) => await message.reply(msg));
    }
};
