import { ApplicationCommand, Client } from "discord.js";
import pg from "pg";

/**
 * The current assumption is all commands will have these fields even subscription commands 
 */
interface Base {
    interaction: ApplicationCommand
    locale: string
}

/**
 * And not every command will need to use the database,
 * mostly just the subscription commands. This might be a singleton actually.
 */
interface PGClient {
    pgClient: pg.Client
}