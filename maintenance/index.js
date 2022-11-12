import { update as alertUpdate } from "./alertMaintenance";
import { run as runDeleteMessages } from "./deleteMessages";
import { check as checkOpenContinets } from "./openContinents";
import { update as outfitUpdate } from "./outfitMaintenance";
/**
 * @typedef {import("discord.js").Client} discord.Client
 */

/**
 * Start maintenance tasks
 * @param {discord.Client} client - discord client
 */
export function maintenace(client) {
    //TODO
    alertUpdate(client);
    outfitUpdate();
    runDeleteMessages(client);
    checkOpenContinets(client);
}