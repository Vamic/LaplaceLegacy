var bot = module.parent.exports;

const messagelinkRegex = /discordapp\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/;

async function getMessageFromIDs(messageID, channelID, guildID) {
    console.log(guildID);
    if(isNaN(guildID) || isNaN(channelID) || isNaN(messageID)) throw "Invalid Arguments";
    let guild = bot.guilds.get(guildID);
    if(!guild) throw "Can't find that server.";
    let channel = guild.channels.get(channelID);
    if(!channel) throw "Can't find that channel.";
    let message = channel.fetchMessage(messageID);
    if(!message) throw "Can't find that message.";
    return message;
}

exports.commands = {
    repostaquote: {
        commands: ["!repost", "!quote"],
        requirements: [bot.requirements.guild],
        usage: "<messageid> [channelid] [serverid] OR <messagelink>",
        exec: async function (command, message) {
            if(!command.arguments.length) {
                return message.reply("provide a message id or link.");
            }
            let ids = {};
            if(messagelinkRegex.test(command.arguments[0])) {
                let regexresult = messagelinkRegex.exec(command.arguments.shift());
                ids.messageID = regexresult[3];
                ids.channelID = regexresult[2];
                ids.guildID = regexresult[1];
            } else {
                ids.messageID = command.arguments.shift();
                ids.channelID = command.arguments.shift() || message.channel.id;
                ids.guildID = command.arguments.shift() || message.guild.id;
            }

            let url = `https://discordapp.com/channels/${ids.guildID}/${ids.channelID}/${ids.messageID}`;

            try {
                let targetMessage = await getMessageFromIDs(ids.messageID, ids.channelID, ids.guildID);
                message.delete();
        
                let embed = new bot.MessageEmbed();
                embed.setAuthor(targetMessage.author.username, targetMessage.author.avatarURL, targetMessage.url);
                embed.setFooter("Reposted by " + message.author.username);
                embed.setURL(url);
                if(targetMessage.attachments.first()) {
                    embed.setImage(targetMessage.attachments.first().url);
                }
                else if(targetMessage.embeds[0] && targetMessage.embeds[0].thumbnail) {
                    embed.setImage(targetMessage.embeds[0].thumbnail.url);
                }
                embed.setDescription(targetMessage.content);
                embed.setTimestamp(targetMessage.createdAt);
                message.channel.send(embed);
            } catch(err) {
                if(typeof err == "string") {
                    if(err == "Invalid Arguments") {
                        return message.reply("provide a **valid** message id or link.");
                    } else {
                        message.channel.send(err);
                    }
                }
                else {
                    message.channel.send("Couldn't find that message.");
                }
            }
        }
    }
};