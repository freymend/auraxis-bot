import { serverIDs } from "./utils.js";
import { fetch } from 'undici';

/**
 * Send a request to the PS2 census API
 * @param {string} platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param {string} key - what information you want to get from the API
 * @param {string} extension - the URL extension to request
 * @returns {Promise<any>} results of the request encoded in JSON
 * @throws if there are Census API errors
 */
 async function censusRequest(platform, key, extension, retry = 2){
	const uri = `https://census.daybreakgames.com/s:${process.env.serviceID}/get/${platform}/${extension}`;
	if (retry === 0) {
		return;
	}
	try{
		const request = await fetch(uri);
		if(!request.ok) {
			throw `Census API unreachable: ${request.status}`;
		}
		const response = await request.json();
		if(typeof(response.error) !== 'undefined'){
			if(response.error == 'service_unavailable'){
				throw "Census API currently unavailable";
			}
			if(typeof(response.error) === 'string'){
				throw `Census API error: ${response.error}`;
			}
			throw response.error;
		}
		if(typeof(response.errorCode) !== 'undefined'){
			if(response.errorCode == "SERVER_ERROR" && response.errorMessage){
				throw `Census API server error: ${response.errorMessage}`;
			}
			throw `Census API error: ${response.errorCode}`;
		}
		if(typeof(response[key]) === 'undefined' || !Array.isArray(response[key])){
			throw "Census API error: undefined response";
		}
		return response[key];
	}
	catch(err){
		if(typeof(err) === 'string'){
			throw err;
		}
		if(err instanceof SyntaxError){
			// .json() occurs when census gets redirected to https://www.daybreakgames.com/home
			throw "Census API unavailable: Redirect";
		}
		// fetch() only throws TypeErrors https://developer.mozilla.org/en-US/docs/Web/API/fetch#exceptions
		// Due to how finicky the census and fetch() not retrying on error we use recurion to retry the request
		const request = censusRequest(platform, key, extension, retry - 1);
		if (request !== undefined) {
			return request;
		}
		throw `Census API error: ${err.cause.code}`;
	}
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2  
 * @param { string } cName - the name of the character to query
 * @returns { Promise<Character[]> } the character's stats
 * @see {@link https://census.daybreakgames.com/get/ps2/character?name.first_lower=gelos&c:resolve=item_full&c:lang=en&c:show=name.first,prestige_level,character_id,faction_id,battle_rank Example Query}
 */
export async function censusASP(platform, cName) {
	/**
	 * @typedef { Object } Character
	 * @property { string } character_id - ID of the character
	 * @property {{ first: string }} name - name of the character
	 * @property {{ value: string }} battle_rank - battle rank of the character
	 * @property { string } prestige_level - prestige level of the character
	 * @property { string } faction_id - faction of the character
	 * @property { item[] } items - items the character has
	 * @typedef { Object } item
	 * @property { string } item_id - ID of the item
	 * @property { string } item_type_id - type of the item
	 * @property { string } item_category_id - category of the item
	 * @property {{ en: string }} name - name of the item
	 * @property {{ en: string }} description - description of the item
	 */
    return await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName}&c:resolve=item_full&c:lang=en`);
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2 
 * @param { string } cName - the name of the character to query
 * @returns { Promise<Character[]> } the character's stats
 */
export async function censusAuraxiums(platform, cName) {
	/**
	 * @typedef { Object } Character
	 * @property { string } character_id - ID of the character
	 * @property {{ first: string }} name - name of the character
	 * @property { string }	faction_id - faction of the character
	 * @property { Achievement[] } character_id_join_characters_achievement - achievements the character has
	 * @property { object } stats - I don't feel like documenting this again
	 * @typedef { Object } Achievement
	 * @property { string } achievement_id - ID of the achievement
	 * @property { string } finish_date - date the achievement was completed
	 * @property {{ name: {en:string}, description: {en:string} }} achievement_id_join_achievement - achievement details
	 *
	 */
    return await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName}&c:join=characters_achievement^list:1^outer:0^hide:character_id'earned_count'start'finish'last_save'last_save_date'start_date(achievement^terms:repeatable=0^outer:0^show:name.en'description.en)&c:resolve=weapon_stat_by_faction`);
}

/**
 * Query the census API for the current status of Live servers
 * @returns { Promise<ServerStatus[]> } the server status of each Live PS2 server
 * @see {@link https://census.daybreakgames.com/get/global/game_server_status?game_code=ps2&c:limit=100&c:show=last_reported_state,name Example Query}
 */
export async function censusStatus() {
	/**
	 * @typedef { Object } ServerStatus
	 * @property { string } name - name of the server
	 * @property { string } last_reported_state - state of the server as reported by the census API
	 */
    return await censusRequest('global', 'game_server_status_list', '/game_server_status?game_code=ps2&c:limit=100&c:show=last_reported_state,name');
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param { string } serverID - the ID of the server to query
 * @returns { Promise<Continent[]> } the status of each territories on each continent on the server
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/map/?world_id=1&zone_ids=2,4,6,8,14,344 Example Query}
 */
export async function censusTerritories(platform, serverID) {
	/**
	 * @typedef { Object } Continent
	 * @property { string } ZoneId - ID of the continent	
	 * @property {{ Row: RowData[] }} Regions - the status of each territory on the continent
	 * @typedef {{ RowData: Territory }} RowData
	 * 
	 * @typedef { Object } Territory
	 * @property { string } RegionId - ID of the territory
	 * @property { string } FactionId - ID of the faction that controls the territory
	 */
    return await censusRequest(platform, 'map_list', `/map/?world_id=${serverID}&zone_ids=2,4,6,8,14,344`);
}

/**
 * 
 * @param {*} platform 
 * @param {*} cName 
 * @returns 
 */
export async function censusCharacterOverview(platform, cName) {
    return await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName}&c:resolve=outfit_member_extended,online_status,world,stat_history,weapon_stat_by_faction,weapon_stat&c:join=title,characters_stat^list:1`);
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2 
 * @param { string } cName - the name of the character to query 
 * @returns { Promise<Character[]> } the character's stats
 * @see {@link https://census.daybreakgames.com/get/ps2/character?name.first_lower=gelos&c:show=name.first,character_id,faction_id Example Query}
 */
export async function censusCharacterProfile(platform, cName) {
	/**
	 * @typedef { Object } Character
	 * @property { string } character_id - ID of the character
	 * @property {{ first: string }} name - name of the character
	 * @property { string }	faction_id - faction of the character
	 */
    return await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName}`);
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param { string } characterID - the ID of the character to query 
 * @returns { Promise<Directive[]> } the status of each directive for the character
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/characters_directive_tree?character_id=5428245075231810753&c:limit=500&c:show=completion_time,directive_tree_id Example Query}
 */
export async function censusDirectives(platform, characterID) {
	/**
	 * @typedef { Object } Directive
	 * @property { string } directive_tree_id - ID of the directive
	 * @property { string } completion_time - time the directive was completed
	 */
    return await censusRequest(platform, 'characters_directive_tree_list', `characters_directive_tree?character_id=${characterID}&c:limit=500&c:show=completion_time,directive_tree_id`);
}

/**
 * 
 * @param {*} platform 
 * @param {*} name 
 * @param {*} period 
 * @param {*} server 
 * @param {*} limit 
 * @returns 
 */
export async function censusLeaderboard(platform, name, period, server, limit) {
    const world = server !== undefined ? `&world=${serverIDs[server]}` : '';
    return await censusRequest(platform, 'leaderboard_list', `leaderboard/?name=${name}&period=${period}${world}}&c:limit=${limit}&c:resolve=character_name`, limit);
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2 
 * @param { string } oTag - the outfit tag to query
 * @param { string } outfitID - the outfit ID to query
 * @returns { Promise<Outfit[]> } the members of the outfit
 * @see {@link https://census.daybreakgames.com/get/ps2/outfit?alias_lower=skl&c:join=outfit_member^inject_at:members^show:character_id%27rank^outer:0^list:1(character^show:name.first^inject_at:character^outer:0^on:character_id(characters_online_status^inject_at:online_status^show:online_status^outer:0(world^on:online_status^to:world_id^outer:0^show:world_id^inject_at:ignore_this))&c:show=outfit_id Example Query}
 */
export async function censusOnlineMembers(platform, oTag, outfitID) {
	/**
	 * @typedef { Object } Outfit
	 * @property { string } outfit_id - ID of the character
	 * @property { OutfitMember[] } members - the members of the outfit
	 * @typedef { Object } OutfitMember
	 * @property { string } character_id - ID of the character
	 * @property { string } rank - rank of the character in the outfit
	 * @property {{ name: {first: name}, online_status: {online_status: string} }} character - name of the character
	 */
    const outfitSearch = outfitID != null ? `outfit_id=${outfitID}` : `alias_lower=${oTag}`;
    const url = `outfit?${outfitSearch}&c:join=outfit_member^inject_at:members^show:character_id%27rank^outer:0^list:1(character^show:name.first^inject_at:character^outer:0^on:character_id(characters_online_status^inject_at:online_status^show:online_status^outer:0(world^on:online_status^to:world_id^outer:0^show:world_id^inject_at:ignore_this))&c:show=outfit_id`;
    return await censusRequest(platform, 'outfit_list', url);
}

/**
 * 
 * @param { string } environment - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param { string } facilityID - the ID of the facility to query
 * @returns { Promise< Facility[]> } basic information about the facility
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/map_region?facility_id=118020&c:show=zone_id,facility_type,facility_name Example Query}
 */
export async function censusFacility(environment, facilityID) {
	/**
	 * @typedef { Object } Facility
	 * @property { string } zone_id - ID of the continent
	 * @property { string } facility_type - type of the facility
	 * @property { string } facility_name - name of the facility type
	 */
    return await censusRequest(environment, "map_region_list", `/map_region?facility_id=${facilityID}&c:show=zone_id,facility_type,facility_name`);
}

/**
 * 
 * @param {*} platform 
 * @param {*} cID 
 * @returns 
 */
export async function censusCharacterRecentStats(platform, cID) {
    return await censusRequest(platform, 'character_list', `/character/${cID}?c:resolve=stat_history&c:join=title,characters_stat^list:1`);
}

/**
 * Query the Census API for the name of a weapon
 * @param {*} platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param {*} ID - the ID of the weapon
 * @returns { Promise<WeaponName[]> } the name of the weapon
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/item/1/?c:show=name Example Query}
 */
export async function censusWeaponName(platform, ID) {
	/**
	 * @typedef { Object } WeaponName
	 * @property {{ name: {en: string} }} name - name of the weapon
	 */
    return await censusRequest(platform, 'item_list', `/item/${ID}?c:show=name`);
}

/**
 * 
 * @param {*} platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param {*} ID - the ID of the vehicle
 * @returns { Promise<VehicleName[]> } the name of the vehicle
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/vehicle/1/?c:show=name Example Query}
 */
export async function censusVehicleName(platform, ID) {
	/**
	 * @typedef { Object } VehicleName
	 * @property {{ name: {en: string} }} name - name of the vehicle
	 */
    return await censusRequest(platform, 'vehicle_list', `/vehicle/${ID}?c:show=name`);
}

/**
 * 
 * @param {*} platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param {*} id - the outfit ID
 * @returns { Promise<OutfitIdentity[]> } the name of the outfit
 * @see {@link https://census.daybreakgames.com/get/ps2/outfit/37526656648222749?c:show=alias,name Example Query}
 */
export async function censusOutfitIdentity(platform, id) {
	/**
	 * @typedef { Object } OutfitIdentity
	 * @property { string } name - name of the outfit
	 * @property { string } alias - Tag of the outfit
	 */
    return await censusRequest(platform, 'outfit_list', `/outfit/${id}?c:show=alias,name`);
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2 
 * @param { string } cName - the name of the character 
 * @returns { Promise<CharacterVehicleStats[]> } the vehicle stats of the character
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/character?name.first_lower=gelos&c:resolve=weapon_stat_by_faction,weapon_stat&c:show=character_id,stats,faction_id,name Example Query}
 */
export async function censusCharacterVehicleStats(platform, cName) {
	/**
	 * @typedef { Object } CharacterVehicleStats
	 * @property { string } character_id - ID of the character
	 * @property { string } faction_id - the faction of the character
	 * @property {{ first: string }} name - name of the character
	 * @property {{ weapon_stat: WeaponStat[], weapon_stat_by_faction: WeaponStatFaction[] }} stats - the stats of the character
	 *     @typedef { Object } WeaponStat
	 * 	   @property { string } stat_name 
	 * 	   @property { string } value
	 *     @property { string } item_id
	 * 	   @property { string } vehicle_id
	 *     @typedef { Object } WeaponStatFaction
	 * 	   @property { string } stat_name 
	 * 	   @property { string } value_nc
	 *     @property { string } value_vs
	 *     @property { string } value_tr
	 *     @property { string } item_id
	 * 	   @property { string } vehicle_id
	 */
    return await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName.toLowerCase()}&c:resolve=weapon_stat_by_faction,weapon_stat`);
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2 
 * @param { string } cName - the name of the character 
 * @returns { Promise<CharacterWeaponStats[]> } the weapon stats of the character
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/character?name.first_lower=gelos&c:resolve=weapon_stat_by_faction,weapon_stat&c:show=character_id,stats,faction_id,name Example Query}
 */
export async function censusCharacterWeaponStats(platform, cName) {
	/**
	 * @typedef { Object } CharacterWeaponStats
	 * @property { string } character_id - ID of the character
	 * @property { string } faction_id - the faction of the character
	 * @property {{ first: string }} name - name of the character
	 * @property {{ weapon_stat: WeaponStat[], weapon_stat_by_faction: WeaponStatFaction[] }} stats - the stats of the character
	 *     @typedef { Object } WeaponStat
	 * 	   @property { string } stat_name 
	 * 	   @property { string } value
	 *     @property { string } item_id
	 * 	   @property { string } vehicle_id
	 *     @typedef { Object } WeaponStatFaction
	 * 	   @property { string } stat_name 
	 * 	   @property { string } value_nc
	 *     @property { string } value_vs
	 *     @property { string } value_tr
	 *     @property { string } item_id
	 * 	   @property { string } vehicle_id
	 */
    return await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName}&c:resolve=weapon_stat_by_faction,weapon_stat`);
}

/**
 * 
 * @param {*} platform 
 * @param {*} oID 
 * @param {*} oTag 
 * @returns 
 */
export async function censusOutfitActivityLevels(platform, oID, oTag) {
    const outfitSearch = oID != null ? `outfit_id=${oID}` : `alias_lower=${oTag.toLowerCase()}`;
    const url = `/outfit?${outfitSearch}&c:resolve=member_online_status&c:join=character^on:leader_character_id^to:character_id&c:join=character^on:members.character_id^to:character_id^hide:certs&c:join=characters_world^on:leader_character_id^to:character_id`;
    return await censusRequest(platform, 'outfit_list', url);
}

/**
 * 
 * @param { string } environment - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param { string } metagameEventID - the ID of the metagame event
 * @returns { Promise<MetaGameEvent[]> } the name of the metagame event
 * @see {@link https://census.daybreakgames.com/get/ps2/metagame_event/10?c:show=name,description Example Query}
 */
export async function censusMetaGameEvent(environment, metagameEventID) {
	/**
	 * @typedef { Object } MetaGameEvent
	 * @property {{ en: string }} name - name of the metagame event
	 * @property {{ en: string }} description - description of the metagame event
	 */
    return await censusRequest(environment, "metagame_event_list", `/metagame_event/${metagameEventID}`)
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param { string } oID - the ID of the outfit
 * @param { string } oTag - the tag of the outfit
 * @returns { Promise<OutfitRank[]> } the name of the character
 * @see {@link https://census.daybreakgames.com/get/ps2/outfit?alias_lower=bax&c:resolve=rank&c:show=alias,name,member_count,ranks,outfit_id,leader_character_id Example Query}
 */
export async function censusOutfitRanks(platform, oID, oTag) {
	/**
	 * @typedef { Object } OutfitRank
	 * @property { string } alias - the tag of the outfit
	 * @property { string } name - the name of the outfit
	 * @property { string } member_count - the number of members in the outfit
	 * @property { string } outfit_id - the ID of the outfit
	 * @property { Rank[] } ranks - the ranks of the outfit
	 * @property { string } leader_character_id - the ID of the leader of the outfit
	 *    @typedef { Object } Rank
	 * 	  @property { string } name - the name of the rank
	 * 	  @property { string } ordinal - the rank of the rank
	 *    @property { string } description - the description of the rank
	 */
    const outfitSearch = oID != null ? `outfit_id=${oID}` : `alias_lower=${oTag}`;
    return await censusRequest(platform, 'outfit_list', `outfit?${outfitSearch}&c:resolve=rank`)
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param { string } characterID - the ID of the character 
 * @returns { Promise<OutfitLeader[]> } the name of the character
 * @see {@link https://census.daybreakgames.com/get/ps2/character?character_id=5428010618040904337&c:resolve=world&c:show=character_id,faction_id,world_id Example Query}
 */
export async function censusOutfitLeader(platform, characterID) {
	/**
	 * @typedef { Object } OutfitLeader
	 * @property { string } character_id - ID of the character
	 * @property { string } faction_id - the faction of the character
	 * @property { string } world_id - the server the character is on
	 */
	return await censusRequest(platform, 'character_list', `/character?character_id=${characterID}&c:resolve=world&c:show=character_id,faction_id,world_id`)
}

/**
 * 
 * @param { string } platform - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2
 * @param { string } tag - the tag of the outfit
 * @returns { Promise<OutfitProfile[]> } the outfit profile
 * @see {@link https://census.daybreakgames.com/get/ps2/outfit?alias_lower=bax&c:join=character^on:leader_character_id^to:character_id&c:show=alias,name,outfit_id,leader_character_id,leader_character_id_join_character.faction_id Example Query}
 */
export async function censusOutfitProfile(platform, tag){
	/**
	 * @typedef { Object } OutfitProfile
	 * @property { string } outfit_id - ID of the outfit
	 * @property { string } name - the name of the outfit
	 * @property { string } alias - the tag of the outfit
	 * @property { string } leader_character_id - the ID of the leader of the outfit
	 * @property {{ faction_id: string }} leader_character_id_join_character - the faction of the leader of the outfit
	 */
	return await censusRequest(platform, 'outfit_list', `/outfit?alias_lower=${tag.toLowerCase()}&c:join=character^on:leader_character_id^to:character_id`);
}

/**
 * 
 * @param { string } environment - which environment to request, eg. ps2:v2, ps2ps4us:v2, or ps2ps4eu:v2 
 * @param { string } characterID - the ID of the character 
 * @returns { Promise<CharacterOutfit[]> } the name of the character
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/character/5428010618040904337?c:resolve=outfit_member&c:show=character_id,outfit_member,faction_id,name.first Example Query}
 */
export async function censusCharacterOutfit(environment, characterID) {
	/**
	 * @typedef { Object } CharacterOutfit
	 * @property { string } character_id - ID of the character
	 * @property { string } faction_id - the faction of the character
	 * @property {{ first: string }} name - the name of the character
	 * @property {{ outfit_id: string }} outfit_member - the outfit the character is in
	 */
	return await censusRequest(environment, 'character_list', `/character/${characterID}?c:resolve=outfit_member&c:show=character_id,outfit_member,faction_id,name.first`);
}

/**
 * 
 * @param { string } platform - which platform to request, eg. ps2, ps2ps4us, or ps2ps4eu
 * @param { string } characterID - the ID of the character 
 * @returns { Promise<CaptureContribution[]> } the name of the character
 * @see {@link https://census.daybreakgames.com/get/ps2:v2/characters_event?id=5428010618040904337&type=FACILITY_CHARACTER&c:resolve=character_name Example Query}
 */
export async function censusCaptureContribution(platform, characterID) {
	/**
	 * @typedef { Object } CaptureContribution
	 * @property { string } character_id - ID of the character
	 * @property { string } timestamp - when the capture was made
	 * @property { string } facility_id - ID of the facility
	 * @property {{ name: {first: string} }} character - the name of the character
	 */
	return await censusRequest(platform, 'characters_event_list', `characters_event?id=${characterID}&type=FACILITY_CHARACTER&c:resolve=character_name`)
}