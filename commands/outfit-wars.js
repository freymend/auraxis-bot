/**
 * This file implements functions to look up information about the current outfit wars
 * @ts-check
 * @module outfitWars
 */

import { EmbedBuilder } from 'discord.js';
import got from 'got';
import { serverNames, serverIDs, faction, pcServers } from '../utils.js';
import { onlineInfo}  from './online.js';
import i18n from 'i18n';

export const data = {
	name: 'outfit-wars',
	description: "Lookup information about outfit wars",
	options: [
		{
			name: 'registrations',
			description: "View registered outfits for a given server's outfit wars",
			type: '1',
			options: [{
				name: 'server',
				description: 'Server name',
				type: '3',
				required: true,
				choices: pcServers
			}]
		}
	]
};

export const type = ['Base'];

export async function execute(interaction, locale) {
	await interaction.deferReply();
	const server = interaction.options.getString('server');
	const embed = await registrations(server, locale);
	await interaction.editReply({ embeds: [embed] });
}
/**
 * Get the current registrations for the input server
 * @param {string} server - server name
 * @param {string} locale - locale to use
 * @returns a discord embed of the current outfit wars registrations
 * @throws if there is an error requesting any info
 */
async function registrations(server, locale='en-US'){
	const uri = `https://census.lithafalcon.cc/get/ps2/outfit_war_registration?world_id=${serverIDs[server]}`
	const response = await got(uri).json();
	const sendEmbed = new EmbedBuilder();
	sendEmbed.setTitle(i18n.__mf({phrase: "outfitWarsRegistrations", locale: locale}, 
		{server: serverNames[serverIDs[server]]}
	));
	let fullyRegistered = "";
	let partiallyRegistered = "";
	let fullyContinued = "";
	let partiallyContinued = "";
	let fullyRegisteredCount = 0;
	let partiallyRegisteredCount = 0;
	const outfitIDs = [];
	const registrations = response.outfit_war_registration_list;
	for(const outfit of registrations){
		outfitIDs.push(outfit.outfit_id);
	}
	const outfits = await Promise.all(Array.from(outfitIDs, x=> onlineInfo("", "ps2:v2", x, locale)));
	for(let i = 0; i < outfits.length; i++){
		if(registrations[i].status == "Full"){
			fullyRegisteredCount++;
			const currentString = `${faction(registrations[i].faction_id).decal} [${outfits[i].alias}] ${outfits[i].name}\n`;
			if(fullyRegistered.length + currentString.length > 1020){
				fullyContinued += currentString;
			}
			else{
				fullyRegistered += currentString;
			}
		}
		else{
			partiallyRegisteredCount++;
			const currentString = `${faction(registrations[i].faction_id).decal} [${outfits[i].alias}] ${outfits[i].name}: ${registrations[i].member_signup_count} registered\n`;
			if(partiallyRegistered.length + currentString.length > 1020){
				partiallyContinued += currentString;
			}
			else{
				partiallyRegistered += currentString;
			}
		}
	}
	sendEmbed.addFields({name: i18n.__mf({phrase: "fullyRegistered", locale: locale}, {count: fullyRegisteredCount}), value: fullyRegistered});
	if(fullyContinued.length > 0){
		sendEmbed.addFields({name: '\u200B', value: fullyContinued});
	}
	sendEmbed.addFields({name: i18n.__mf({phrase: "partiallyRegistered", locale: locale}, {count: partiallyRegisteredCount}), value: partiallyRegistered});
	if(partiallyContinued.length > 0){
		sendEmbed.addFields({name: '\u200B', value: partiallyContinued});
	}
	sendEmbed.setFooter({text: i18n.__mf({phrase: "Data from {site}", locale: locale}, {site: "census.lithafalcon.cc"})});

	return sendEmbed;
}