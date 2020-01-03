var bot = module.parent.exports;

const parser = new (require('rss-parser'))();

const datastoretarget = "rsswatcher-data";

const feedNameRegex = /^[\d\w'\.\-\/ ]{1,30}$/;

let rssData = {};

bot.datastore.get(datastoretarget).then(async data => {
    if (!data) {
        await bot.datastore.set(datastoretarget, rssData);
    } else {
        rssData = data;
    }

    //Save the interval on the bot so that when -reload is used we dont make a billion intervals
    if (bot.rssinterval) clearInterval(bot.rssinterval);

    bot.rssinterval = setInterval(async () => {
        bot.log("Checking RSS Feeds - " + new Date().toLocaleTimeString());
        //Loop through all properties
        for (const guildID in rssData) {
            //Filter away the default properties (toString and such), leaving only guildIDs
            if (rssData.hasOwnProperty(guildID)) {
                //Check feeds in each server
                //TODO: check personal feeds
                await checkFeeds(guildID);
            }
        }
    }, 10 * 60 * 1000);
});

async function checkFeeds(id) {
    let guildData = rssData[id];
    let guild = bot.guilds.get(id);
    let channel;
    if (guild) {
        channel = guild.channels.get(guildData.channelID);
    }
    else {
        channel = await bot.client.fetchUser(id).catch(e => { });
    }
    if (!channel) return;
    getAndNotify(guildData.feeds, channel);
}

async function getAndNotify(feeds, channel) {
    //Check each feed
    for (const feed of feeds) {
        let xml = await getFeedXml(feed.feedUrl).catch(bot.error);
        if (!xml) continue;
        //Filter out old items
        let items = xml.items.filter(i => new Date(i.pubDate) > feed.lastCheck);
        //If we have new items, send a message
        if (items.length) {
            let mentions = feed.users ? feed.users.map(uid => `<@${uid}>`) : [];
            let links = items.map(i => `[${i.title}](${i.link})`);
            let embed = new bot.RichEmbed().setTitle("RSS Feed update: " + feed.title);
            embed.setDescription(links.join("\n"));
            channel.send(mentions.join(" "), embed);
        }
        feed.lastCheck = Date.now();
    }
    await bot.datastore.set(datastoretarget, rssData);
}

async function getFeedXml(url) {
    let raw = await bot.util.httpGet(url, true);

    //Some rss feeds havent escaped the description area (tumblr, if it ever decides to start working again)
    raw = raw.replace(/<description><!\[CDATA\[/g, '<description>').replace(/]]><\/description>/g, '<\/description>');
    raw = raw.replace(/<description>/g, '<description><![CDATA[').replace(/<\/description>/g, ']]><\/description>');

    let parsed = await parser.parseString(raw);

    if (!parsed) {
        throw "Couldn't parse the feed.";
    }
    return parsed;
}

function getUnusedID(guildID) {
    let ids = rssData[guildID].feeds.map(f => f.id);
    let newID = rssData[guildID].feeds.length + 1;
    while (ids.includes(newID)) {
        newID++;
    }
    return newID;
}

async function addFeed(containerId, url, userID, alias) {
    let isGuild = containerId != userID;
    let feeds = rssData[containerId].feeds;
    let found = feeds.find(f => f.feedUrl == url);
    if (found) return `That feed is already tracked` + (isGuild ? ` on this server. Use \`!rss sub ${found.id}\` to subscribe to it.` : `.`);

    bot.log(`Checking rss ${url}`);
    let parsedXml = await getFeedXml(url).catch(bot.error);
    //Save the parts we care about and add our own stuff
    let feed = {
        id: getUnusedID(containerId),
        title: feedNameRegex.test(alias) ? alias : parsedXml.title,
        feedUrl: url,
        linkUrl: parsedXml.link,
        description: parsedXml.description,

        lastCheck: Date.now()
    };

    if (isGuild) feed.users = [userID];

    feeds.push(feed);

    await bot.datastore.set(datastoretarget, rssData);

    return `added the \`${feed.title}\` rss feed` + (isGuild ? ` to this server.` : ".");
}

async function removeFeed(containerId, feedId, isGuild) {
    let feed = rssData[containerId].feeds.find(f => f.id == feedId);
    if (!feed) return `no rss feed with the id \`${feedId}\` found` + (isGuild ? " on this server." : ".");

    rssData[containerId].feeds = rssData[containerId].feeds.filter(f => f.id != feedId);
    await bot.datastore.set(datastoretarget, rssData);
    return `removed rss feed for \`${feed.title}\`` + (isGuild ? " from this server." : ".");
}

async function renameFeed(containerId, feedId, newName, isGuild) {
    let feed = rssData[containerId].feeds.find(f => f.id == feedId);
    newName = newName || "";
    if (!feed) return `no rss feed with the id \`${feedId}\` found` + (isGuild ? " on this server." : ".");
    if (!feedNameRegex.test(newName)) return `improper feed name, regex: \`${feedNameRegex}\``;

    let response = `renamed feed \`${feed.title}\``;
    feed.title = newName;
    response += `to \`${feed.title}\`.`;

    await bot.datastore.set(datastoretarget, rssData);
    return response;
}

//Add user to be mentioned when an update is announced
async function addUserToGuildFeed(guildID, id, userID) {
    let feed = rssData[guildID].feeds.find(f => f.id == id);
    if (!feed) return `no rss feed with the id \`${id}\` found on this server.`;

    feed.users.push(userID);
    await bot.datastore.set(datastoretarget, rssData);
    return `added you to be pinged for the \`${feed.title}\` feed on this server.`;
}

//Remove user from being mentioned when an update is announced
async function removeUserFromGuildFeed(guildID, id, userID) {
    let feed = rssData[guildID].feeds.find(f => f.id == id);
    if (!feed) return `no rss feed with the id \`${id}\` found on this server.`;

    if (feed.users.includes(userID)) feed.users.splice(feed.users.indexOf(userID), 1);
    await bot.datastore.set(datastoretarget, rssData);
    return `you will no longer be pinged for the \`${feed.title}\` feed on this server.`;
}


exports.commands = {
    setrsschannel: {
        commands: ["!setrsschannel"],
        requirements: [bot.requirements.guild],
        exec: function (command, message) {
            if (rssData[message.guild.id]) {
                if (message.channel.id == rssData[message.guild.id].channelID) {
                    return message.reply("this channel is already the rss channel. Use `!unsetrsschannel` to unset.\nThis will cause the bot to not give updates in this server until another channel is set.");
                } else {
                    rssData[message.guild.id].channelID = message.channel.id;
                    message.reply("this channel is now the new rss channel.");
                }
            } else {
                rssData[message.guild.id] = {
                    channelID: message.channel.id,
                    feeds: []
                };
                message.reply("this channel is now the rss channel.");
            }
            bot.datastore.set(datastoretarget, rssData);
        }
    },
    unsetrsschannel: {
        commands: ["!unsetrsschannel"],
        requirements: [bot.requirements.guild],
        exec: function (command, message) {
            if (rssData[message.guild.id]) {
                if (message.channel.id == rssData[message.guild.id].channelID) {
                    rssData[message.guild.id].channelID = null;
                    return message.reply("channel has been unset, no notifications will appear until another is set.");
                } else {
                    message.reply("this channel is not the rss channel.");
                }
            } else {
                message.reply("this server doesn't have an rss channel set.");
            }
            bot.datastore.set(datastoretarget, rssData);
        }
    },
    generalrsscommands: {
        commands: ["!rss"],
        exec: async function (command, message) {
            let args = command.arguments;
            if (!args.length) {
                return message.reply("usage: `!rss:<alias> [(un)subscribe|add|remove|rename|list]");
            }

            if (!message.guild && !rssData[message.author.id]) {
                rssData[message.author.id] = {
                    channelID: message.channel.id,
                    feeds: []
                };
            }
            if (message.guild && !rssData[message.guild.id]) {
                return message.reply("this server doesn't have an rss channel set.\nUse `!setrsschannel` in the channel you want rss updates posted.");
            } else {
                let response = "";
                let argument = args.shift();
                let containerId = message.guild ? message.guild.id : message.author.id;
                switch (argument) {
                    case "subscribe":
                    case "sub":
                        if (!message.guild)
                            response = "useless for personal feeds";
                        else if (!args.length)
                            response = "usage: `!rss subscribe [ID]`, see IDs in `!rss list`";
                        else
                            response = await addUserToGuildFeed(containerId, args.shift(), message.author.id);
                        break;
                    case "unsubscribe":
                    case "unsub":
                        if (!message.guild)
                            response = "useless for personal feeds";
                        else if (!args.length)
                            response = "usage: `!rss unsubscribe [ID]`, see IDs in `!rss list`";
                        else
                            response = await removeUserFromGuildFeed(containerId, args.shift(), message.author.id);
                        break;
                    case "add":
                        if (!args.length)
                            response = "usage: `!rss add <link to rss> [<alias>]`";
                        else {
                            let nextArg = args.shift();
                            let alias = args.join(" ");
                            if (/tumblr\.com.*\/rss/.test(nextArg))
                                response = "tumblr feeds are not supported because tumblr puts a privacy policy screen where the rss should be.";
                            else
                                response = await addFeed(containerId, nextArg, message.author.id, alias).catch(bot.error);
                        }
                        break;
                    case "remove":
                        if (!args.length)
                            response = "usage: `!rss remove [ID]`, see IDs in `!rss list`";
                        else
                            response = await removeFeed(containerId, args.shift(), message.guild).catch(bot.error);

                        break;
                    case "rename":
                        if (!args.length)
                            response = "usage: `!rss rename [ID] [alias]`, see IDs in `!rss list`";
                        else
                            response = await renameFeed(containerId, args.shift(), args.join(" "), message.guild).catch(bot.error);

                        break;
                    case "list":
                        let feeds = rssData[containerId].feeds;
                        let lines = feeds.map(feed => `${feed.id}: [${feed.title}](${feed.linkUrl})`);
                        if (lines.length == 0) lines.push("No feeds tracked " + (message.guild ? "in this server " : "") + "yet. `!rss add <link to rss>`");

                        let embed = new bot.RichEmbed().setTitle("Tracked RSS Feeds");
                        return bot.send.paginatedEmbed(message.channel, lines, 15, embed);
                }
                if (response) return message.reply(response);
            }
        }
    },
};