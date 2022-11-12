/**
 * This file implements functions to create and update server tracker channels, showing total population and active continents
 * @module tracker
 * @typedef {import('discord.js').Client} discord.Client
 * @typedef {import('discord.js').Guild} discord.Guild
 * @typedef {import('discord.js').ChatInputCommandInteraction} ChatInteraction
 */

import { serverIDs, platforms, allServers } from '../utils.js';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import query from '../db/index.js';

export const data = {
	name: 'tracker',
	description: "Create an automatically updating voice channel",
	dm_permission: false,
	options: [{
		name: "server",
		description: "Create an automatically updating voice channel displaying server info",
		type: '1',
		options: [{
			name: 'server',
			type: '3',
			description: 'Server name',
			required: true,
			choices: allServers
		},
		{
			name: 'type',
			type: '3',
			description: 'Type of tracker channel',
			required: true,
			choices:[
				{
					name: 'Population',
					value: 'population'
				},
				{
					name: 'Continents',
					value: 'territory'
				}
			]
		}]
		},
		{
			name: "outfit",
			description: "Create an automatically updating voice channel displaying outfit online count",
			type: '1',
			options: [{
				name: 'tag',
				type: '3',
				description: 'Outfit tag',
				required: true
			},
			{
				name: 'show-faction',
				type: '5',
				description: 'Display a faction indicator in channel name? ex: 🟣/🔵/🔴/⚪',
				required: true
			},
			{
				name: 'platform',
				type: '3',
				description: "Which platform is the outfit on?  Defaults to PC",
				required: false,
				choices: platforms
			}
			]
		}
	]
};

/**
 * runs the `/tracker` command
 * @param { ChatInteraction } interaction - command chat interaction 
 * @param { string } locale - locale of the user
 */
export async function execute(interaction, locale) {
	if (interaction.channel.type === ChannelType.DM) {
		await interaction.editReply({content: 'Cannot create trackers in DMs'});
	}
	const options = interaction.options.getSubcommand();
	if (options === 'server') {
		const type =  interaction.options.getString('type');
		const server = interaction.options.getString('server');
		const guild = interaction.guild;
		const client = interaction.client;
		const res = await create(type, server, guild, client);
		await interaction.editReply(res);
	} else if (options === 'outfit') {
		const tag = interaction.options.getString('tag').toLowerCase();
		const platform = interaction.options.getString('platform') || 'ps2:v2';
		const showFaction = interaction.options.getBoolean('show-faction');
		const guild = interaction.guild;
		const client = interaction.client;
		const res = await createOutfit(tag, platform, showFaction, guild, client);
		await interaction.editReply(res);
	}
	
}

/**
 * Used to create tracker channels for server population and territory
 * @param {string} type - the type of tracker to create
 * @param {string} serverName - the server to check
 * @param {discord.Guild} guild - the discord guild
 * @param {discord.Client} discordClient - the discord Client
 * @returns A string saying the tracker channel was created
 * @throws if bot is missing permissions to create channels
 */
async function create(type, serverName, guild, discordClient){
	try{
		let name = "";
		if(type == "population"){
			name = await populationName(serverIDs[serverName]);
		}
		else if(type == "territory"){
			name = await territoryName(serverIDs[serverName]);
		}
		
		const newChannel = await guild.channels.create({
			name: name,
			type: ChannelType.GuildVoice,
			reason: 'New tracker channel',
			permissionOverwrites: [
				{
					id: guild.id,
					deny: [PermissionFlagsBits.Connect],
					allow: [PermissionFlagsBits.ViewChannel]
				},
				{
					id: discordClient.user.id,
					allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel]
				}
			]
		});

		await query("INSERT INTO tracker (channel, trackerType, world) VALUES ($1, $2, $3);",
		[newChannel.id, type, serverName]);

		return `Tracker channel created as ${newChannel.toString()}. This channel will automatically update once every 10 minutes. If you move the channel or edit permissions make sure to keep the "Manage Channel" and "Connect" permissions enabled for Auraxis Bot.`;
	}
	catch(err){
		if(err.message == "Missing Permissions"){
			throw "Unable to create channel due to missing permissions. Ensure the bot has both \"Manage Channels\" and \"Connect\" permissions granted.";
		}
		else{
			throw(err);
		}		
	}
}

/**
 * Used to create tracker channels for outfits
 * @param {string} tag - the tag of the outfit to check
 * @param {string} platform - the platform of the outfit
 * @param {boolean} showFaction - if true, show faction indicator in tracker
 * @param {discord.Guild} guild - the discord guild
 * @param {discord.Client} discordClient - the discord Client
 * @returns a string saying the tracker channel for outfits was created
 * @throws if bot is missing permissions to create channels
 */
async function createOutfit(tag, platform, showFaction, guild, discordClient){
	try{
		const oInfo = await onlineInfo(tag, platform);
		let name = await outfitName(oInfo.outfitID, platform);
		if(showFaction){
			name = name.faction;
		}
		else{
			name = name.noFaction;
		}
					
		const newChannel = await guild.channels.create({
			name: name,
			type: ChannelType.GuildVoice,
			reason: 'New tracker channel',
			permissionOverwrites: [
				{
					id: guild.id,
					deny: [PermissionFlagsBits.Connect],
					allow: [PermissionFlagsBits.ViewChannel]
				},
				{
					id: discordClient.user.id,
					allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel]
				}
			]
		});

		await query("INSERT INTO outfittracker (channel, outfitid, showfaction, platform) VALUES ($1, $2, $3, $4);",
		[newChannel.id, oInfo.outfitID, showFaction, platform]);

		return `Tracker channel created as ${newChannel}. This channel will automatically update once every 10 minutes. If you move the channel or edit permissions make sure to keep the "Manage Channel" and "Connect" permissions enabled for Auraxis Bot.`;
	}
	catch(err){
		if(err.message == "Missing Permissions"){
			throw "Unable to create channel due to missing permissions. Ensure the bot has both \"Manage Channels\" and \"Connect\" permissions granted.";
		}
		else{
			throw(err);
		}		
	}
}