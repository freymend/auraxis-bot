import i18n from 'i18n';

export const data = {
    name: 'ping',
    description: `Get the bot's current ping to Discord servers`,
};

export const type = ['Base'];

export async function execute(interaction, locale) {
    await interaction.editReply(`Bot's ping to Discord is ${interaction.client.ws.ping}ms`);
}