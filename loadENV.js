/**
 * This is the file acts as a wrapper for loading in environment variables from a .env file.
 * Since ES6 modules load asynchoronously, we need to load the environment variables before
 * any other modules are loaded. This file is imported in the first line of the main file.
 */
import dotenv from 'dotenv';
dotenv.config();