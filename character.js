// This file implements functions to look up a character's basic information, the number of Auraxium medals they have, and their top weapon
// All three platforms are supported, but must be specified in the "platform" parameter

const Discord = require('discord.js');
const weapons = require('./static/weapons.json');
const vehicles = require('./static/vehicles.json');
const decals = require('./static/decals.json');
const sanction = require('./static/sanction.json');
const got = require('got');
const { serverNames, badQuery, censusRequest } = require('./utils');

const basicInfo = async function(cName, platform){
    // Main function for character lookup.  Pulls most stats and calls other functions for medals/top weapon info
    let response =  await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName}&c:resolve=outfit_member_extended,online_status,world,stat_history,weapon_stat_by_faction,weapon_stat&c:join=title,characters_stat^list:1`)
    if(response.length == 0){
        throw `${cName} not found`;
    }
    let data = response[0];
    //store basic information
    let resObj = {
        name: data.name.first,
        characterID: data.character_id,
        title: null,
        br: data.battle_rank.value,
        prestige: data.prestige_level,
        server: data.world_id,
        playTime: data.times.minutes_played,
        online: data.online_status,
        lastLogin: data.times.last_login,
        faction: data.faction_id,
        inOutfit: false,
        stats: false,
        stat_history: false
    }
    if(platform != 'ps2:v2' && data.faction_id != 4){
        try{
            let manualPrestige = await checkASP(cName, platform);
            if(manualPrestige){
                resObj.prestige = 1;
            }
        }
        catch(err){
            // Fail silently
        }
    }
    if(data.title_id_join_title != null){
        resObj.title = data.title_id_join_title.name.en;
    }
    if(data.outfit_member != null){
        resObj.inOutfit = true;
        resObj.outfitName = data.outfit_member.name;
        resObj.outfitAlias = data.outfit_member.alias;
        resObj.outfitRank = data.outfit_member.member_rank;
        resObj.outfitRankOrdinal = data.outfit_member.member_rank_ordinal;
    }
    if(data.stats != null){
        resObj.stats = true;
        let topID = 0;
        let mostKills = 0;
        let sanctionedStats = {}

        // Find most used weapon
        if(typeof(data.stats.weapon_stat_by_faction) !== 'undefined'){
            for (let stat of data.stats.weapon_stat_by_faction){
                if (stat.stat_name == "weapon_kills"){
                    if(stat.item_id != "0"){
                    itemKills = Number(stat.value_vs) + Number(stat.value_nc) + Number(stat.value_tr);
                        if (itemKills > mostKills){
                            mostKills = itemKills;
                            topID = stat.item_id;
                        } 
                    }
                    if(includeInIVI(stat.item_id)){
                        sanctionedStats = populateStats(sanctionedStats, stat.item_id, 'kills', (Number(stat.value_vs) + Number(stat.value_nc) + Number(stat.value_tr)));
                    }
                    
                }
                else if(stat.stat_name == "weapon_headshots" && includeInIVI(stat.item_id)){
                    sanctionedStats = populateStats(sanctionedStats, stat.item_id, 'headshots', (Number(stat.value_vs) + Number(stat.value_nc) + Number(stat.value_tr)));
                }
            }
        }
        
        resObj.mostKills = mostKills;
        resObj.topWeaponID = topID;

        // Find name of most used weapon, calculate number of Auraxium medals
        if(mostKills > 0){
            try{
                resObj.topWeaponName = await getWeaponName(topID, platform);
            }
            catch{
                console.log("Error retrieving top weapon name for id "+topID);
                resObj.topWeaponName = "Error";
            }
            if(mostKills > 100){
                resObj.auraxCount = await getAuraxiumCount(cName, platform);
            }
            else{
                resObj.auraxCount = 0;
            }
        }
        else{
            resObj.topWeaponName = "No kills";
            resObj.auraxCount = 0;
        }
        // Determine most used vehicle
        if(typeof(data.stats.weapon_stat) !== 'undefined'){
            let topVehicleTime = 0;
            let favoriteVehicle = 0;
            for(let stat of data.stats.weapon_stat){
                if(stat.stat_name == "weapon_play_time" && stat.item_id == "0" && stat.value > topVehicleTime){
                    topVehicleTime = Number.parseInt(stat.value);
                    favoriteVehicle = stat.vehicle_id;
                }
                else if(stat.stat_name == "weapon_fire_count" && includeInIVI(stat.item_id)){
                    sanctionedStats = populateStats(sanctionedStats, stat.item_id, 'shots', Number.parseInt(stat.value));
                }
                else if(stat.stat_name == "weapon_hit_count" && includeInIVI(stat.item_id)){
                    sanctionedStats = populateStats(sanctionedStats, stat.item_id, 'hits', Number.parseInt(stat.value));
                }
            }
            resObj.favoriteVehicle = favoriteVehicle;
            resObj.topVehicleTime = topVehicleTime;
        }
        // Pull stats for score, spm, and K/D
        if(typeof(data.stats.stat_history) !== 'undefined'){
            resObj.stat_history = true;
            for(let stat of data.stats.stat_history){
                switch(stat.stat_name){
                    case "deaths":
                        resObj.deaths = stat.all_time;
                        break;
                    case "facility_capture":
                        resObj.captures = stat.all_time;
                        break;
                    case "facility_defend":
                        resObj.defends = stat.all_time;
                        break;
                    case "kills":
                        resObj.kills = stat.all_time;
                        break;
                    case "score":
                        resObj.score = stat.all_time;
                        break;
                }
            }
        }
        // IVI calculations
        let infantryKills = 0;
        let infantryHeadshots = 0;
        let infantryShots = 0;
        let infantryHits = 0;
        for(const id in sanctionedStats){
            if(sanctionedStats[id].kills && sanctionedStats[id].kills > 50){
                infantryKills += sanctionedStats[id].kills;
                infantryHeadshots += sanctionedStats[id].headshots;
                infantryShots += sanctionedStats[id].shots;
                infantryHits += sanctionedStats[id].hits;
            }
        }
        resObj.infantryKills = infantryKills;
        resObj.infantryHeadshots = infantryHeadshots;
        resObj.infantryShots = infantryShots;
        resObj.infantryHits = infantryHits;
        
    }
    if(typeof(data.character_id_join_characters_stat) !== 'undefined'){
        let topClass = 0;
        let topTime = 0;
        for(let stat of data.character_id_join_characters_stat){
            if(stat.stat_name == "play_time" && parseInt(stat.value_forever) > topTime){
                topTime = stat.value_forever;
                topClass = stat.profile_id;
            }
        }
        resObj.topClass = topClass;
        resObj.topTime = topTime;
    }
    return resObj;
}

const checkASP = async function(cName, platform){
    let response = await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName}&c:resolve=item_full&c:lang=en`);
    let data = response[0];
    let aspTitle = false;
    for (const item of data.items){
        if(Number(item.item_id) == 6004399){
            aspTitle = true;
            break;
        }
    }
    return aspTitle;
}

const populateStats = function(sanctionedStats, id, key, value){
    if(id in sanctionedStats){
        sanctionedStats[id][key] = value;
    }
    else{
        sanctionedStats[id] = {};
        sanctionedStats[id][key] = value;
    }
    return sanctionedStats;
}

const includeInIVI = function(ID){
    if(ID in sanction && sanction[ID].sanction == "infantry"){
        return true;
    }
    return false;
}

const getWeaponName = async function(ID, platform){
    // Returns the name of the weapon ID specified.  If the Census API is unreachable it will fall back to the fisu api
    if(typeof(weapons[ID]) !== 'undefined'){
        return weapons[ID].name;
    }
    let response = await censusRequest(platform, 'item_list', `/item/${ID}`)
    if(response.length==1){
        return response.item_list[0].name.en;
    }
    let URI = 'https://ps2.fisu.pw/api/weapons/?id='+ID; //Fallback Fisu URI
    let fisuResponse = await got(URI).json();
    if(typeof(fisuResponse[ID]) !== 'undefined'){
        return fisuResponse[ID].name;
    }
    if(ID in sanction){
        return sanction[ID].name;
    }

    throw "Not found";
}

const getVehicleName = async function(ID, platform){
    if(typeof(vehicles[ID]) !== 'undefined'){
        return vehicles[ID].name;
    }
    let response = await censusRequest(platform, 'vehicle_list', `/vehicle/${ID}`);
    if(response.returned==1){
        return response.vehicle_list[0].name.en;
    }

    throw "Not found";
}

const getAuraxiumCount = async function(cName, platform){
    // Calculates the number of Auraxium medals a specified character has
    let response = await censusRequest(platform, 'character_list', `/character?name.first_lower=${cName}&c:join=characters_achievement^list:1^terms:earned_count=1^outer:0^hide:character_id%27earned_count%27start%27finish%27last_save%27last_save_date%27start_date(achievement^terms:repeatable=0^outer:0^show:name.en%27description.en)`);
    let medalCount = 0;
    if(typeof(response) === 'undefined' || typeof(response[0]) === 'undefined'){
        return "Error"; // TODO: Verify if resolve is correct
    }
    let achievementList = response[0].character_id_join_characters_achievement;
    for(const x in achievementList){
        achievement = achievementList[x].achievement_id_join_achievement;
        if(achievement != undefined){
            if(achievement.description == undefined){
                if(achievement.name.en.indexOf("Auraxium") > -1){
                    medalCount++;
                }
            }
            else if(achievement.description.en == "1000 Enemies Killed"){
                medalCount++;
            }
        }
    }
    return medalCount;
}

const recentStatsInfo =  async function(cID, platform, days){
    const response = await censusRequest(platform, 'character_list', `/character/${cID}?c:resolve=stat_history&c:join=title,characters_stat^list:1`);
    const data = response[0];
    let resObj = {
        name: data.name.first,
        br: data.battle_rank.value,
        prestige: data.prestige_level,
        server: data.world_id,
        lastLogin: data.times.last_login,
        faction: data.faction_id,
        lastSave: data.times.last_save,
        kills: 0,
        deaths: 0,
        time: 0,
        score: 0,
        certs: 0,
        battle_rank: 0
    }
    if(data.stats?.stat_history == undefined){
        throw "Unable to retrieve stat history";
    }
    for(const stat of data.stats.stat_history){
        let current = 0;
        let currentDays = Number.parseInt(days);
        for(const day in stat.day){
            current += Number.parseInt(stat.day[day]);
            currentDays -= 1;
            if(currentDays <= 0){
                break;
            }
        }
        if(stat.stat_name in resObj){
            resObj[stat.stat_name] = current;
        }
        
    }
    return resObj;
}

module.exports = {
    character: async function(cName, platform){
        // Calls function to get basic info, extracts info from returned object and constructs the Discord embed to send
        if(badQuery(cName)){
			throw "Character search contains disallowed characters";
		}
        
        const cInfo = await basicInfo(cName, platform);
        let resEmbed = new Discord.MessageEmbed();
        const row = new Discord.MessageActionRow()
        row.addComponents(
            new Discord.MessageButton()
                .setCustomId(`recentStats%30%${cInfo.characterID}%${platform}`)
                .setLabel('30 day stats')
                .setStyle('PRIMARY'),
            new Discord.MessageButton()
                .setCustomId(`recentStats%7%${cInfo.characterID}%${platform}`)
                .setLabel('7 day stats')
                .setStyle('PRIMARY'),
            new Discord.MessageButton()
                .setCustomId(`recentStats%1%${cInfo.characterID}%${platform}`)
                .setLabel('1 day stats')
                .setStyle('PRIMARY')
        );

        // Username, title, fisu url
        resEmbed.setTitle(cInfo.name);
        if(cInfo.title != null){
            resEmbed.setDescription(cInfo.title);
        }
        if(platform == 'ps2:v2'){
            resEmbed.setURL('http://ps2.fisu.pw/player/?name='+cName);
        }
        else if(platform == 'ps2ps4us:v2'){
            resEmbed.setURL('http://ps4us.ps2.fisu.pw/player/?name='+cName);
        }
        else if(platform == 'ps2ps4eu:v2'){
            resEmbed.setURL('http://ps4eu.ps2.fisu.pw/player/?name='+cName);
        }
        
        // BR & ASP
        if(cInfo.prestige > 0){
            resEmbed.addField('BR', cInfo.br+"~"+cInfo.prestige, true);
        }
        else{
            resEmbed.addField('BR', cInfo.br, true);
        }

        // Decal thumbnail
        if(cInfo.prestige == "1"){
            resEmbed.setThumbnail("http://census.daybreakgames.com/files/ps2/images/static/88685.png");
        }
        else if (cInfo.prestige == "2"){
            resEmbed.setThumbnail("http://census.daybreakgames.com/files/ps2/images/static/94469.png");
        }
        else if (parseInt(cInfo.br) > 100){
            resEmbed.setThumbnail(`http://census.daybreakgames.com/files/ps2/images/static/${85033+(parseInt(cInfo.br)-100)}.png`);
        }
        else if (cInfo.faction == "1"){ //vs
            resEmbed.setThumbnail(`http://census.daybreakgames.com/files/ps2/images/static/${decals.vs[parseInt(cInfo.br)]}.png`);
        }
        else if (cInfo.faction == "2"){ //nc
            resEmbed.setThumbnail(`http://census.daybreakgames.com/files/ps2/images/static/${decals.nc[parseInt(cInfo.br)]}.png`);
        }
        else if (cInfo.faction == "3"){ //tr
            resEmbed.setThumbnail(`http://census.daybreakgames.com/files/ps2/images/static/${decals.tr[parseInt(cInfo.br)]}.png`);
        }
        else{ //nso
            resEmbed.setThumbnail(`http://census.daybreakgames.com/files/ps2/images/static/${90110+Math.floor(parseInt(cInfo.br)/10)}.png`);
        }

        // Score, SPM
        if(cInfo.stat_history){
            resEmbed.addField('Score (SPM)', parseInt(cInfo.score).toLocaleString()+" ("+Number.parseFloat(cInfo.score/cInfo.playTime).toPrecision(4)+")", true);
        }

        // Server
        resEmbed.addField('Server', serverNames[Number(cInfo.server)], true);

        // Playtime
        hours = Math.floor(cInfo.playTime/60);
        minutesPlayed = cInfo.playTime - hours*60;
        resEmbed.addField('Playtime', hours+' hours, '+minutesPlayed+' minutes', true);
        
        // KD, KPM
        if(cInfo.stat_history){
            resEmbed.addField('K/D', Number.parseFloat(cInfo.kills/cInfo.deaths).toPrecision(3), true);
            resEmbed.addField('KPM', Number.parseFloat(cInfo.kills/cInfo.playTime).toPrecision(3), true);
            let sign = "";
            if((cInfo.kills-cInfo.deaths) > 0){
                sign = "+";
            }
            resEmbed.addField('K-D Diff', `${Number.parseInt(cInfo.kills).toLocaleString()} - ${Number.parseInt(cInfo.deaths).toLocaleString()} = ${sign}${(cInfo.kills-cInfo.deaths).toLocaleString()}`, true);
        }

        // IVI Score
        if(typeof(cInfo.infantryHeadshots) !== 'undefined' && typeof(cInfo.infantryHits) !== 'undefined'){
            let accuracy = cInfo.infantryHits/cInfo.infantryShots;
            let hsr = cInfo.infantryHeadshots/cInfo.infantryKills;
            resEmbed.addField("IVI Score", `${Math.round(accuracy*hsr*10000)}`, true);
        }

        // Online status
        if (cInfo.online == "service_unavailable"){
            resEmbed.addField('Online', 'Service unavailable', true);
        }
        else if (cInfo.online >= 1){
            resEmbed.addField('Online', ':white_check_mark:', true);
        }
        else{
            resEmbed.addField('Online', ':x:', true);
        }
        resEmbed.addField('Last Login', `<t:${cInfo.lastLogin}:R>`, true);

        // Faction, embed color
        if (cInfo.faction == "1"){ //vs
            resEmbed.addField('Faction', '<:VS:818766983918518272> VS', true);
            resEmbed.setColor('PURPLE');
        }
        else if (cInfo.faction == "2"){ //nc
            resEmbed.addField('Faction', '<:NC:818767043138027580> NC', true);
            resEmbed.setColor('BLUE');
        }
        else if (cInfo.faction == "3"){ //tr
            resEmbed.addField('Faction', '<:TR:818988588049629256> TR', true);
            resEmbed.setColor('RED');
        }
        else{ //NSO
            resEmbed.addField('Faction', '<:NS:819511690726866986> NSO', true);
            resEmbed.setColor('GREY');
        }

        // Outfit info
        if(cInfo.inOutfit){
            if(cInfo.outfitAlias != "" && platform == 'ps2:v2'){
                resEmbed.addField('Outfit', '[['+cInfo.outfitAlias+']](https://ps2.fisu.pw/outfit/?name='+cInfo.outfitAlias+') '+cInfo.outfitName, true);
            }
            else if(cInfo.outfitAlias != "" && platform == 'ps2ps4us:v2'){
                resEmbed.addField('Outfit', '[['+cInfo.outfitAlias+']](https://ps4us.ps2.fisu.pw/outfit/?name='+cInfo.outfitAlias+') '+cInfo.outfitName, true);
            }
            else if(cInfo.outfitAlias != "" && platform == 'ps2ps4eu:v2'){
                resEmbed.addField('Outfit', '[['+cInfo.outfitAlias+']](https://ps4eu.ps2.fisu.pw/outfit/?name='+cInfo.outfitAlias+') '+cInfo.outfitName, true);
            }
            else{
                resEmbed.addField('Outfit', cInfo.outfitName, true);
            }
            resEmbed.addField('Outfit Rank', `${cInfo.outfitRank} (${cInfo.outfitRankOrdinal})`, true);
        }

        // Top Weapon, Auraxium medals
        if(cInfo.stats){
            if(cInfo.topWeaponName != "Error"){
                resEmbed.addField('Top Weapon (kills)', cInfo.topWeaponName+" ("+cInfo.mostKills+")", true);
            }
            if(cInfo.auraxCount != "Error"){
                resEmbed.addField('Auraxium medals', `${cInfo.auraxCount}`, true);
            }
        }

        // Top class
        if(typeof(cInfo.topClass) !== 'undefined'){
            let classHours = Math.floor(cInfo.topTime/60/60);
            let classMinutes = cInfo.topTime/60 - classHours*60;
            let className = " ";
            switch(cInfo.topClass){
                case "1":
                    className = "Infiltrator"
                    break;
                case "3":
                    className = "Light Assault"
                    break;
                case "4":
                    className = "Medic"
                    break;
                case "5":
                    className = "Engineer"
                    break;
                case "6":
                    className = "Heavy Assault"
                    break;
                case "7":
                    className = "MAX"
                    break;
            }
            resEmbed.addField("Most played class (time)", className+" ("+classHours+"h "+parseInt(classMinutes)+"m)", true);
        }

        // Favorite vehicle
        if(typeof(cInfo.favoriteVehicle) !== 'undefined' && cInfo.favoriteVehicle != 0){
            let vehicleHours = Math.floor(cInfo.topVehicleTime/60/60);
            let vehicleMinutes = parseInt(cInfo.topVehicleTime/60 - vehicleHours*60);
            try{
                let vehicleName = await getVehicleName(cInfo.favoriteVehicle);
                resEmbed.addField("Most played vehicle (time)", vehicleName+" ("+vehicleHours+"h "+vehicleMinutes+"m)", true);
            }
            catch(err){
                //Fail silently
            }
        }
        return [resEmbed, [row]];
    },

    recentStats: async function(cID, platform, days){
        const cInfo = await recentStatsInfo(cID, platform, days);
        if(cInfo.time == 0){
            throw "No stats in this time period";
        }
        const resEmbed = new Discord.MessageEmbed();
        resEmbed.setTitle(cInfo.name);
        resEmbed.setDescription(`${days} day stats ending <t:${cInfo.lastSave}:d>`);
        if (cInfo.faction == "1"){ //vs
            resEmbed.setColor('PURPLE');
        }
        else if (cInfo.faction == "2"){ //nc
            resEmbed.setColor('BLUE');
        }
        else if (cInfo.faction == "3"){ //tr
            resEmbed.setColor('RED');
        }
        else{ //NSO
            resEmbed.setColor('GREY');
        }
        resEmbed.addField('Score (SPM)', `${cInfo.score.toLocaleString()} (${(cInfo.score/(cInfo.time/60)).toPrecision(4)})`, true);
        const hours = Math.floor(cInfo.time/60/60);
        const minutes = Math.floor(cInfo.time/60 - hours*60);
        resEmbed.addField('Playtime', `${hours} hours, ${minutes} minutes`, true);
        resEmbed.addField('Certs gained', cInfo.certs.toLocaleString(), true);
        resEmbed.addField('K/D', Number.parseFloat(cInfo.kills/cInfo.deaths).toPrecision(3), true);
        let sign = '';
        if((cInfo.kills-cInfo.deaths) > 0){
            sign = '+';
        }
        resEmbed.addField('K-D Diff', `${(cInfo.kills).toLocaleString()} - ${(cInfo.deaths).toLocaleString()} = ${sign}${(cInfo.kills-cInfo.deaths).toLocaleString()}`, true);
        resEmbed.addField('KPM', (cInfo.kills/(cInfo.time/60)).toPrecision(3), true);
        return resEmbed;     
    },

    getWeaponName: getWeaponName
}