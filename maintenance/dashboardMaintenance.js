import query from "./db/index.js";
import { servers, serverIDs } from "./utils.js";

/**
 * Edit dashboard embeds with new data
 * @param {string} channelID - The channel ID where the current dashboard is
 * @param {string} messageID - The message ID of the current dashboard
 * @param {discord.MessageEmbed} newDash - The new dashboard
 * @param {discord.Client} discordClient - The discord client 
 */
 async function editMessage(channelID, messageID, newDash, discordClient){
	try{
		const channel = await discordClient.channels.fetch(channelID);
		const message = await channel.messages.fetch(messageID);
		await message.edit({embeds: [newDash]});
	}
	catch(err){
		if(err?.code == 10008 || err?.code == 10003 || err?.code == 50001){ //Unknown message/channel or missing access
			console.log("Deleted message from dashboard table");
			query("DELETE FROM dashboard WHERE messageid = $1;", [messageID]);
			query("DELETE FROM outfitDashboard WHERE messageid = $1;", [messageID]);
		}
		else{
			console.log('Error editing dashboard');
			console.log(err);
		}
	}
}

/**
 * Updates current dashboards in discord channels
 * @param {discord.Client} discordClient - The discord client 
 */
 export async function update(discordClient){
	for(const serverName of servers){
		try{
			const status = await serverStatus(serverIDs[serverName]);
			const channels = await query('SELECT * FROM dashboard WHERE world = $1;', [serverName]);
			for(const row of channels.rows){
				await editMessage(row.channel, row.messageid, status, discordClient);
			}
		}
		catch(err){
			console.log(`Error updating ${serverName} dashboard`);
			console.log(err);
		}
	}
	try{
		const outfits = await query('SELECT DISTINCT outfitID, platform FROM outfitDashboard;');
		for(const row of outfits.rows){
			try{
				const status = await outfitStatus(row.outfitid, row.platform);
				const channels = await query('SELECT * FROM outfitdashboard WHERE outfitid = $1 AND platform = $2', [row.outfitid, row.platform]);
				for(const channelRow of channels.rows){
					await editMessage(channelRow.channel, channelRow.messageid, status, discordClient);
				}
			}
			catch(err){
				console.log(`Error updating outfit dashboard ${row.platform}: ${row.outfitid}`);
				console.log(err);
				if(err == " not found"){
					await query("DELETE FROM outfitDashboard WHERE outfitID = $1;", [row.outfitid]);
					console.log(`Deleted ${row.outfitid} from table`);
				}
			}
		}
	}
	catch(err){
		console.log(`Error pulling outfit dashboards`);
		console.log(err);
	}
}