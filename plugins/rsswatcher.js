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
        bot.log("Checking RSS Feeds - " + new Date().toLocaleTimeString());
        for (const guildID in rssData) {
            if (rssData.hasOwnProperty(guildID)) {
                //Check feeds in each server
                //TODO: check personal feeds
                await checkFeeds(guildID);
            }
        }
    }, 10 * 60 * 1000);
});

async function checkFeeds(guildID) {
    let guildData = rssData[guildID];
    let guild = bot.guilds.get(guildID);
    if(!guild) return;
    let channel = guild.channels.get(guildData.channelID);
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

function getUnusedID(guildID) {
    let ids = rssData[guildID].feeds.map(f => f.id);
    let newID = rssData[guildID].feeds.length + 1;
    while(ids.includes(newID)) {
        newID++;
    }
    return newID;
}

async function addGuildFeed(guildID, url, userID){
    let feeds = rssData[guildID].feeds;
    let found = feeds.find(f => f.feedUrl == url);
    if(found) return "that feed is already tracked on this server. Use `!rss sub [ID]` to subscribe to it";
    
    bot.log("Checking rss " + url);
    let parsedXml = await getFeedXml(url).catch(bot.error);
    
    //Save the parts we care about and add our own stuff
    let feed = {
        id: getUnusedID(guildID),
        title: parsedXml.title,
        feedUrl: url,
        linkUrl: parsedXml.link,
        description: parsedXml.description,

        users: [userID],
        lastCheck: Date.now()
    };

    feeds.push(feed);
    
    await bot.datastore.set(datastoretarget, rssData);

    return "added the `" + feed.title + "` rss feed to this server.";
}

async function removeGuildFeed(guildID, id) {
    let feed = rssData[guildID].feeds.find(f => f.id == id);
    if(!feed) return "no rss feed with the id `" + id + "` found on this server.";

    rssData[guildID].feeds = rssData[guildID].feeds.filter(f => f.id != id);
    await bot.datastore.set(datastoretarget, rssData);
    return "removed rss feed for `" + feed.title + "` from this server.";
}

//Add user to be mentioned when an update is announced
async function addUserToFeed(guildID, id, userID) {
    let feed = rssData[guildID].feeds.find(f => f.id == id);
    if(!feed) return "no rss feed with the id `" + id + "` found on this server.";

    feed.users.push(userID);
    await bot.datastore.set(datastoretarget, rssData);
    return "added you to be pinged for the `" + feed.title + "` feed on this server.";
}

//Remove user from being mentioned when an update is announced
async function removeUserFromFeed(guildID, id, userID) {
    let feed = rssData[guildID].feeds.find(f => f.id == id);
    if(!feed) return "no rss feed with the id `" + id + "` found on this server.";

    if(feed.users.includes(userID)) feed.users.splice(feed.users.indexOf(userID), 1);
    await bot.datastore.set(datastoretarget, rssData);
    return "you will no longer be pinged for the `" + feed.title + "` feed on this server.";
}


exports.commands = {
    setrsschannel: {
        commands: ["!setrsschannel"],
        requirements: [bot.requirements.guild],
        exec: function (command, message) {
            if(rssData[message.guild.id]) {
                if(message.channel.id == rssData[message.guild.id].channelID) {
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
            if(rssData[message.guild.id]) {
                if(message.channel.id == rssData[message.guild.id].channelID) {
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
            if(!args.length) {
                return message.reply("usage: `!rss [(un)subscribe|add|remove|list]");
            }
            if(message.guild) {
                if(!rssData[message.guild.id]) {
                    return message.reply("this server doesn't have an rss channel set.\nUse `!setrsschannel` in the channel you want rss updates posted.");
                } else {
                    let response = "";
                    let argument = args.shift();
                    switch(argument) {
                        case "subscribe":
                        case "sub":
                            if(!args.length) 
                                response = "usage: `!rss subscribe [ID]`, see IDs in `!rss list`";
                            else
                                response = await addUserToFeed(message.guild.id, args.shift(), message.author.id);
                            break;
                        case "unsubscribe":
                        case "unsub":
                            if(!args.length) 
                                response = "usage: `!rss unsubscribe [ID]`, see IDs in `!rss list`";
                            else
                                response = await removeUserFromFeed(message.guild.id, args.shift(), message.author.id);
                            break;
                        case "add":
                            if(!args.length) 
                                response = "usage: `!rss add [link to rss]`";
                            else {
                                let nextArg = args.shift();
                                if(/tumblr\.com.*\/rss/.test(nextArg))
                                    response = "tumblr feeds are not supported because tumblr is retarded and puts a privacy policy screen where the rss should be.";
                                else  
                                    response = await addGuildFeed(message.guild.id, nextArg, message.author.id).catch(bot.error);
                            }
                            break;
                        case "remove":
                            if(!args.length) 
                                response = "usage: `!rss remove [ID]`, see IDs in `!rss list`";
                            else 
                                response = await removeGuildFeed(message.guild.id, args.shift());
                            break;
                        case "list":
                            let feeds = rssData[message.guild.id].feeds;
                            let embed = new bot.RichEmbed().setTitle("Tracked RSS Feeds");
                            let lines = feeds.map(feed => `${feed.id}: [${feed.title}](${feed.linkUrl})`);
                            if (lines.length == 0) lines.push("No feeds tracked in this server yet.");
                            return bot.send.paginatedEmbed(message.channel, lines, 15, embed);
                    }
                    if(response) return message.reply(response);
                }
            } else {
                //TODO: handle personal RSS things (DMs)
                message.reply("Not implemented");
            }
        }
    },
};