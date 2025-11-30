import { ChatInputCommandInteraction, SlashCommandBuilder, Message } from 'discord.js';

export interface Command {
    data: SlashCommandBuilder | any;
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
    run?: (message: Message, args: string[]) => Promise<void>;
    aliases?: string[];
}

export interface UserData {
    id: string;
    balance: number;
    bank: number;
    exp: number;
    realm: number; // 0: Phàm Nhân, 1: Luyện Khí Tầng 1, ...
}

export interface ShopItem {
    id: string;
    name: string;
    price: number;
    type: string;
}
