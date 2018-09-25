var bot = module.parent.exports;

const parser = new (require('rss-parser'))();

const datastoretarget = "rsswatcher-data";

let rssData = {};

bot.datastore.get(datastoretarget).then(async data => {
    if(!data) {
        await bot.datastore.set(datastoretarget, rssData);
    } else {
        rssData = data;
    }
    
    //Save the interval on the bot so that when -reload is used we dont make a billion intervals
    if(bot.rssinterval) clearInterval(bot.rssinterval);

    bot.rssinterval = setInterval(async () => {
        bot.log("Checking RSS Feeds");
        for (const guild_id in rssData) {
            if (rssData.hasOwnProperty(guild_id)) {
                //Check feeds in each server
                //TODO: check personal feeds
                await checkFeeds(guild_id);
            }
        }
    }, 10 * 60 * 1000);
});

async function checkFeeds(guild_id) {
    let guildData = rssData[guild_id];
    let channel = bot.guilds.get(guild_id).channels.get(guildData.channel_id);
    if(!channel) return;
    //Check each feed
    for(const feed of guildData.feeds) {
        let xml = await getFeedXml(feed.feedUrl).catch(bot.error);
        if(!xml) continue;
        //Filter out old items
        let items = xml.items.filter(i => new Date(i.pubDate) > feed.lastCheck);
        //If we have new items, send a message
        if(items.length) {
            let mentions = feed.users.map(uid => `<@${uid}>`);;
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

    if(!parsed) {
        throw "Couldn't parse the feed.";
    }
    return parsed;
}

exports.commands = {
    showtrackedfeeds: {
        commands: ["!rss list"],
        exec: async function (command, message) {
            if(message.guild) {
                if(!rssData[message.guild.id]) {
                    return message.reply("this server doesn't have an rss channel set.\nUse `!setrsschannel` in the channel you want rss updates posted.");
                } else {
                    let feeds = rssData[message.guild.id].feeds;
                    let embed = new bot.RichEmbed().setTitle("Tracked RSS Feeds");
                    let lines = feeds.map(feed => `${feed.id}: [${feed.title}](${feed.linkUrl})`);
                    if (lines.length == 0) lines.push("No feeds tracked in this server yet.");
                    bot.send.paginatedEmbed(message.channel, lines, 15, embed);
                }
            } else {
                //TODO: show personal feeds
                message.reply("not implemented.");
            }
        }
    },
    addrsstotrack: {
        commands: ["!rss add"],
        exec: async function (command, message) {
            let args = command.arguments;
            if(!args.length) {
                return message.reply("usage: `!rss add [link to rss]`");
            }
            if(message.guild) {
                if(!rssData[message.guild.id]) {
                    return message.reply("this server doesn't have an rss channel set.\nUse `!setrsschannel` in the channel you want rss updates posted.");
                } else {
                    if(/tumblr\.com.*\/rss/.test(args[0])) {
                        return message.reply("tumblr feeds are not supported because tumblr is retarded and puts a privacy policy screen where the rss should be.")
                    }

                    bot.log("Checking rss " + args[0]);
                    let parsedXml = await getFeedXml(args[0]).catch(bot.error);
                    
                    //Save the parts we care about and add our own stuff
                    let feed = {
                        id: rssData[message.guild.id].feeds.length + 1,
                        title: parsedXml.title,
                        feedUrl: args[0],
                        linkUrl: parsedXml.link,
                        description: parsedXml.description,

                        users: [],
                        lastCheck: Date.now()
                    };

                    let feeds = rssData[message.guild.id].feeds;
                    let found = feeds.find(f => f.feedUrl == parsedXml.feedUrl);
                    if(found) {
                        feed = found;
                    }
                    if(!feed.users.includes(message.author.id)) feed.users.push(message.author.id);

                    if(!found) {
                        feeds.push(feed);
                    }
                    await bot.datastore.set(datastoretarget, rssData);
                    if(!found) return message.reply("added rss feed for `" + feed.title + "` to this server.");
                    else       return message.reply("added you to be pinged for this feed on this server.");
                }
            } else {
                //TODO: manage personal rss tracking
                message.reply("not implemented.");
            }
        }
    },
    removerssfromtracking: {
        commands: ["!rss remove"],
        exec: async function (command, message) {
            let args = command.arguments;
            if(!args.length) {
                return message.reply("usage: `!rss remove [ID]`, see IDs in `!rss list`");
            }
            if(message.guild) {
                if(!rssData[message.guild.id]) {
                    return message.reply("this server doesn't have an rss channel set.\nUse `!setrsschannel` in the channel you want rss updates posted.");
                } else {
                    let id = args.shift();
                    let feed = rssData[message.guild.id].feeds.find(f => f.id == id);
                    if(feed) {
                        rssData[message.guild.id].feeds = rssData[message.guild.id].feeds.filter(f => f.id != id);
                        await bot.datastore.set(datastoretarget, rssData);
                        message.reply("removed rss feed for `" + feed.title + "` from this server.");
                    } else {
                        message.reply("no rss feed with the id `" + id + "` found on this server.");
                    }
                }
            } else {
                //TODO: manage personal rss tracking
                message.reply("not implemented.");
            }
        }
    },
    exportrssfeeds: {
        commands: ["!rss export"],
        requirements: [bot.requirements.guild],
        exec: function (command, message) {
            message.reply("not implemented. Will export an opml file when its added.");
        }
    },
    setrsschannel: {
        commands: ["!setrsschannel"],
        requirements: [bot.requirements.guild],
        exec: function (command, message) {
            if(rssData[message.guild.id]) {
                if(message.channel.id == rssData[message.guild.id].channel_id) {
                    return message.reply("this channel is already the rss channel. Use `!unsetrsschannel` to unset.\nThis will cause the bot to not give updates in this server until another channel is set.");
                } else {
                    rssData[message.guild.id].channel_id = message.channel.id;
                    message.reply("this channel is now the new rss channel.");
                }
            } else {
                rssData[message.guild.id] = {
                    channel_id: message.channel.id,
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
            if(rssData[message.guild.id]) {
                if(message.channel.id == rssData[message.guild.id].channel_id) {
                    rssData[message.guild.id].channel_id = null;
                    return message.reply("this channel is already the rss channel. Use `!unsetrsschannel` to unset.\nWARNING: **Will** remove all feeds set to this server.");
                } else {
                    message.reply("this channel is not the rss channel.");
                }
            } else {
                message.reply("this server doesn't have an rss channel set.");
            }
            bot.datastore.set(datastoretarget, rssData);
        }
    }
};