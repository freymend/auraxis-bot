import query from "./db/index.js";
import { territoryInfo } from "./commands/territory";
import { getPopulation } from "./commands/population.js";
import { onlineInfo } from "./commands/online.js";
import { faction } from "./utils.js"; 
import { servers, serverNames, continents, serverIDs } from "./utils";

/**
 * Get a string of the name and total population of a server
 * @param {number} serverID - the server to check population
 * @returns the name and population of the server
 */
 async function populationName(serverID){
	const pop = await getPopulation();
	return `${serverNames[serverID]}: ${pop[serverID].global.all} online`;
}

/**
 * Get the number of online members in an outfit
 * @param {string} outfitID - the outfit to check
 * @param {string} platform -  the platform of the outfit
 * @returns an object containing the number of online members in the outfit
 */
 async function outfitName(outfitID, platform){
	const oInfo = await onlineInfo("", platform, outfitID);
	if(oInfo.onlineCount == -1){
		return {
			faction: `${faction(oInfo.faction).tracker} ${oInfo.alias}: ? online`,
			noFaction: `${oInfo.alias}: ? online`
		};
	}
	return {
		faction: `${faction(oInfo.faction).tracker} ${oInfo.alias}: ${oInfo.onlineCount} online`,
		noFaction: `${oInfo.alias}: ${oInfo.onlineCount} online`
	};
}

/**
 * Update channels names of channels the are trackers
 * @param {string} name - the name to update the channel with
 * @param {string} channelID - the channel to update
 * @param {discord.Client} discordClient - the discord Client
 */
 async function updateChannelName(name, channelID, discordClient){
	try{
		const channel = await discordClient.channels.fetch(channelID);
		if(name != channel.name){ //Just avoid unneeded edits
			await channel.setName(name, "Scheduled tracker update");
		}
	}
	catch(err){
		if(err.code == 10003){ //Deleted/unknown channel
			console.log(`Removed tracker channel ${channelID}`);
			query("DELETE FROM tracker WHERE channel = $1;", [channelID]);
			query("DELETE FROM outfittracker WHERE channel = $1;", [channelID]);
		}
		else if(err.code == 50013 || err.code == 50001){ //Missing permissions, missing access
			//Ignore in case permissions are updated
		}
		else{
			console.log("Error in updateChannelName");
			console.log(err);
		}
	}
}


/**
 * Get open continents on server
 * @param {number} serverID - the server to check open continents
 * @returns which continents are open on the  server
 */
 async function territoryName(serverID){
	const territory = await territoryInfo(serverID);
	let openList = [];
	for (const cont of continents){
		if(territory[cont].locked == -1){
			openList.push(cont);
		}
	}
	return `${serverNames[serverID]}: ${openList}`;
}

/**
 * Used to update the tracker channels
 * @param {discord.Client} discordClient - the discord Client
 * @param {boolean} continentOnly - if false only update population and outfits
 */
 export async function update(discordClient, continentOnly = false){
	for(const serverName of servers){
		if(!continentOnly){
			try{
				const popName = await populationName(serverIDs[serverName]);
				const channels = await query("SELECT channel FROM tracker WHERE trackertype = $1 AND world = $2;", ["population", serverName]);
				for(const row of channels.rows){
					await updateChannelName(popName, row.channel, discordClient);
				}
			}
			catch(err){
				console.log(`Error updating ${serverName} population tracker`);
				console.log(err);
			}
		}
		try{
			const terName = await territoryName(serverIDs[serverName]);
			const channels = await query("SELECT channel FROM tracker WHERE trackertype = $1 AND world = $2;", ["territory", serverName]);
			for(const row of channels.rows){
				await updateChannelName(terName, row.channel, discordClient);
			}
		}
		catch(err){
			console.log(`Error updating ${serverName} territory tracker`);
			console.log(err);
		}
	}
	if(!continentOnly){
		try{
			const outfits = await query("SELECT DISTINCT outfitid, platform FROM outfittracker;");
			for(const row of outfits.rows){
				try{
					const oName = await outfitName(row.outfitid, row.platform);
					const channels = await query("SELECT channel, showfaction FROM outfittracker WHERE outfitid = $1 AND platform = $2;", [row.outfitid, row.platform]);
					for(const channelRow of channels.rows){
						if(channelRow.showfaction){
							await updateChannelName(oName.faction, channelRow.channel, discordClient);
						}
						else{
							await updateChannelName(oName.noFaction, channelRow.channel, discordClient);
						}
					}
				}
				catch(err){
					console.log(`Error updating outfit tracker ${row.outfitid}`);
					console.log(err);
					if(err == " not found"){
						await query("DELETE FROM outfittracker WHERE outfitid = $1;", [row.outfitid]);
						console.log(`Deleted ${row.outfitid} from tracker table`);
					}
				}
				
			}
		}catch(err){
			console.log(`Error pulling outfit trackers`);
			console.log(err);
		}
	}
}