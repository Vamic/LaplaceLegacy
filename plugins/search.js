var bot = module.parent.exports;
// Requires
var https = require('https');
//var xml2js = require('xml2js');
var fs = require("fs");

var storedTags = {};

var tagTypes = {
    //gb has numbers in xml and words in json
    gelbooru: {
        "tag": "0",
        "artist": "1",
        "copyright": "3",
        "character": "4",
        "metadata": "5"
    }
};

var cmds = {
    gelbooru: ["gelbooru", "gb"]
};
var sscmds = {
    global: ["global", "g"]
};
var delay = 300; //Delay between requests to APIs, lets hope they dont disable us anymore

var lastSearches = {
    //<discord_id> : [<args>]
};

async function getTags(site, unknownTags, knownTags) {
    //Check our saved tags so we dont have to look up every single tag every single time
    if (!storedTags[site]) {
        let filePath = "tmp/" + site + ".tags.json";
        if(fs.existsSync(filePath)) {
            let data = fs.readFileSync("tmp/" + site + ".tags.json");
            storedTags[site] = JSON.parse(data);
        } else {
            storedTags[site] = {};
        }
        return getTags(site, unknownTags, knownTags);
    //Check if we still have tags to look up
    } else if (unknownTags.length > 0) {
        //Gelbooru
        if (site === cmds.gelbooru[0]) {
            //Check next tag while removing it from unknown
            var nextTag = unknownTags.shift();
            //Check if we already have it saved
            if (storedTags[site][nextTag]) {
                knownTags[nextTag] = {
                    name: nextTag,
                    type: storedTags[site][nextTag].type
                };
                
                return getTags(site, unknownTags, knownTags);
            }
            //We don't have the tag so look it up

            var url = "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&name=" + encodeURIComponent(nextTag);
            let tags = await bot.util.httpGetJson(url).catch((err) => {
                bot.error("Error while getting the tag from gelbooru.");
                bot.error(err);
            });
            
            if(!tags || !tags.length)
                return getTags(site, unknownTags, knownTags);
            //Add the tag to our known tags and storage
            if (tags.length && tags[0].tag === nextTag) {
                knownTags[nextTag] = {
                    name: nextTag,
                    type: tagTypes[site][tags[0].type]
                };
                storedTags[site][nextTag] = {
                    type: tagTypes[site][tags[0].type]
                };
            }
            //Continue checking after a delay, just to be safe
            await new Promise(resolve => setTimeout(resolve, delay));
            return getTags(site, unknownTags, knownTags);
        } else {
            throw "Unknown site provided.";
        }
    //We have stored tags and we dont need to look any more up so save what we have then return the tags
    } else {
        return new Promise((resolve,reject) => {
            fs.writeFile("tmp/" + site + ".tags.json", JSON.stringify(storedTags[site]), function (err) {
                if (err) {
                    bot.error(err);
                    reject(err);
                } else {
                    resolve(knownTags);
                }
            });
        });
    }
}

async function updateStats(site, searchedTags, resultTags, user, chicken) {
    //Get the stats
    let data = await bot.datastore.get("search_stats").catch(bot.error);
    if(!data) return;
    
    //First time initialization
    if (!data.sites) {
        data.sites = {
        };
    }
    if (!data.sites[site]) {
        data.sites[site] = {
            searches: 0,
            chickens: 0,
            tags: {}
        };
    }

    //Add the search to the stats
    data.sites[site].searches++;
    if (chicken)
        data.sites[site].chickens++;

    //Sort the tags into known and unknown to know what to look up
    var unknownTags = [];
    var countedAsteriskTags = [];
    for (var i in resultTags) {
        var tag = resultTags[i];
        //Unknown tag
        if (!data.sites[site].tags[tag]) {
            unknownTags.push(tag);
        } else {
            //Tag found, update stats
            data.sites[site].tags[tag].timesGotten++;
            for (var k in searchedTags) {
                //Handle * for searched tags
                //if the searched tag was "xxx*" it probably wasnt focused at a specific tag
                if (searchedTags[k].split("*")[0].length < 3)
                    continue;
                //Otherwise it may be inentional so lets up the searched count
                if (tag.indexOf("*") > -1 && countedAsteriskTags.indexOf(searchedTags[k]) === -1) {
                    if (tag.startsWith(searchedTags[k].split("*")[0])) {
                        data.sites[site].tags[tag].timesSearched++;
                        //Only count the * tag once
                        countedAsteriskTags.push(searchedTags[k]);
                    }
                }
                else if (searchedTags[k] === tag) {
                    data.sites[site].tags[tag].timesSearched++;
                }
            }
        }
    }

    //Look up the unknown tags
    countedAsteriskTags = [];
    let foundTags = await getTags(site, unknownTags, {});
    //Add the tags to stats
    for (i in foundTags) {
        var tag = foundTags[i];
        
        if (tag.type > 0) {
            //To be here it has to have at least been gotten once
            data.sites[site].tags[tag.name] = {
                type: tag.type,
                timesGotten: 1,
                timesSearched: 0
            };
            for (k in searchedTags) {
                //Handle * for searched tags
                //if the searched tag was "xxx*" it probably wasnt focused at a specific tag
                if (searchedTags[k].split("*")[0].length < 3)
                    continue;
                //Otherwise it may be inentional so lets up the searched count
                if (tag.name.indexOf("*") > -1 && countedAsteriskTags.indexOf(searchedTags[k]) === -1) {
                    if (tag.startsWith(searchedTags[k].split("*")[0])) {
                        data.sites[site].tags[tag.name].timesSearched++;
                        //Only count the * tag once
                        countedAsteriskTags.push(searchedTags[k]);
                    }
                }
                //If it doesnt have * it needs to match perfectly
                else if (searchedTags[k] === tag.name) {
                    data.sites[site].tags[tag.name].timesSearched++;
                }
            }
        }
    }
    //Store the site stats
    bot.datastore.set("search_stats", data).catch();

    //Handle the user stats
    let userData = await bot.datastore.get("user_" + user).catch(bot.error);
    if(!userData) return;
    
    //First time initialization
    if (!userData.searchstats) {
        userData.searchstats = {
            sites: {}
        };
    }
    if (!userData.searchstats.sites[site]) {
        userData.searchstats.sites[site] = {
            searches: 0,
            chickens: 0,
            tags: {}
        };
    }

    //Update stats for the site on the user
    var siteData = data.sites[site];
    var userSiteData = userData.searchstats.sites[site];
    userSiteData.searches++;
    if (chicken)
        userSiteData.chickens++;
    var searched = [];
    //Store the searched for tags, artists and copyrights
    for (i in resultTags) {
        resultTag = resultTags[i];

        var tag = siteData.tags[resultTag];
        if (!tag && userSiteData.tags[resultTag]) tag = userSiteData.tags[resultTag];
        if (tag && tag.type === tagTypes[site].metadata) continue;
        var j;
        
        //If it wasnt found, 
        if (!tag) {
            //Add the tag if it was searched for
            for (j in searchedTags) {
                //If * was used, only store tags that match if theyre longer than "xxx*"
                if (searchedTags[j].split("*")[0].length < 3)
                    continue;
                if (resultTag.startsWith(searchedTags[j].split("*")[0])) {
                    //Store it if its not there already
                    if (!userSiteData.tags[resultTag]) {
                        userSiteData.tags[resultTag] = {
                            type: tagTypes[site].tag, //Type tag because otherwise it wouldve been found
                            timesGotten: 0,
                            timesSearched: 0
                        };
                    }
                    //Up the stats
                    userSiteData.tags[resultTag].timesSearched++;
                    searched.push(resultTag);
                    searchedTags.splice(j, 1); //Only count it once
                }
            }
            //Up the amount gotten on added tags
            if (userSiteData.tags[resultTag]) {
                userSiteData.tags[resultTag].timesGotten++;
            }
        } else {
            if (!userSiteData.tags[resultTag]) {
                userSiteData.tags[resultTag] = {
                    type: tag.type,
                    timesGotten: 0,
                    timesSearched: 0
                };
            }
            //Add stats
            userSiteData.tags[resultTag].timesGotten++;
            for (j in searchedTags) {
                //Bla bla "xxx*" not enough to count
                if (searchedTags[j].split("*")[0].length < 3)
                    continue;
                if (resultTag.startsWith(searchedTags[j].split("*")[0])) {
                    userSiteData.tags[resultTag].timesSearched++;
                    searched.push(resultTag);
                    searchedTags.splice(j, 1); //Only count it once
                }
            }
        }
    }
    //Save it
    bot.datastore.set("user_" + user, userData).catch();
    data["userSearch"] = searched;
    return data;
}

function limitTags(arr, limit) {
    if (!limit) limit = 10;

    //Allow for up to 10 tags
    var overflowAmount = 0;
    if (arr.length > limit) {
        //Keep track of how many tags are hidden
        overflowAmount = arr.length - 10;
        //Take out the first 10
        arr = arr.splice(0, 10);
        //Tell the user how many are hidden
        arr.push(" ... " + overflowAmount + " more.");
    }
    return arr;
}

async function gbSearch(info, args) {
    const url = "https://gelbooru.com/index.php";

    //Exclude unless searched for
    if (args.indexOf("game_cg") === -1)
        args.push("-game_cg");
    if (args.indexOf("comic") === -1)
        args.push("-comic");

    //Encode tags
    args = args.map(a => encodeURIComponent(a));
    //Add to parameters
    var base_params = "?page=dapi&s=post&q=index&tags=rating:safe+sort:random+-spoilers+" + args.join("+");
    
    //XML response has the "count" property so we can see how many results there are for these tags
    let response = await bot.util.httpGetXml(url + base_params + "&limit=0").catch(async (err) => {
        bot.error(err);
        info.channel.send("something broke when fetching the post count");
    });
    
    if (!response) return;
    if (response.posts.count[0] === "0") {
        await updateStats(cmds.gelbooru[0], args, [], info.user, true);
        args = args.filter(a => a[0] != "-");
        info.channel.send("Nobody here but us chickens!" + (args.length === 1 ? " (" + args[0] + ")" : ""));
        return;
    }
    
    //Pick a random image between 0 and 20000, more than 20000 gives an error
    let pid = Math.floor((Math.random() * Math.min(20001, response.posts.count[0])));

    //Get the random image
    let posts = await bot.util.httpGetJson(url + base_params + `&json=1&limit=1&pid=${pid}`).catch(async (err) => {
        //if we got an empty response there were no posts with those tags
        if (err === "Empty response body.") {
            await updateStats(cmds.gelbooru[0], args, [], info.user, true);
            args = args.filter(a => a[0] != "-");
            info.channel.send("Nobody here but us chickens! <@95611335676526592>" + (args.length === 1 ? " (" + args[0] + ")" : ""));
        } else {
            bot.error(err);
            info.channel.send("something broke when fetching the images");
        }
    });
    if (!posts) return;

    //Data from the post
    var post = posts[Math.floor(Math.random() * posts.length)];
    var tags = post.tags.split(" ").filter(Boolean);
    var id = post.id;
    var score = post.score;
    var imgUrl = post.file_url;

    //Variables for stats
    var site = cmds.gelbooru[0];
    var artists = [];
    var copyrights = [];
    var characters = [];
    var searched = [];

    var timeOutTriggered = false;
    //Whether or not to go ahead and send the image without the tags
    var handled = false;
    var sentMessage;
    setTimeout(function () {
        timeOutTriggered = true;
        //Not handled yet
        if (!handled) {
            //Send message
            info.channel.send("[" + id + "+" + score + "p]" + imgUrl).then(function (msg) {
                sentMessage = msg;
            });
        }
    }, 1500);

    //Update stats and look up tags at the same time
    setTimeout(async function () {
        let data = await updateStats(site, args, tags, info.user, false);
        if (!data) {
            return;
        }
        handled = true;
        
        for (var m in tags) {
            var tag = data.sites[site].tags[tags[m]];
            if (tag) {
                //Decide what group the tag goes in
                if (tag.type === tagTypes[site]["artist"])
                    artists.push(tags[m]);
                else if (tag.type === tagTypes[site]["copyright"])
                    copyrights.push(tags[m]);
                else if (tag.type === tagTypes[site]["character"])
                    characters.push(tags[m]);
                if (data.userSearch.length === 1 && data.userSearch.indexOf(tags[m]) > -1)
                    searched.push(tags[m]);
            } else if (data.userSearch.indexOf(tags[m]) > -1) {
                //Get the searched non special tags
                searched.push(tags[m]);
            }
        }
        
        //Allow for up to 10 tags
        if (characters.length > 10)
            characters = limitTags(characters, 10);
        else if (characters.length === 0)
            characters = ["<N/A>"];
        if (copyrights.length > 10)
            copyrights = limitTags(copyrights, 10);
        else if (copyrights.length === 0)
            copyrights = ["<N/A>"];
        if (artists.length > 10)
            artists = limitTags(artists, 10);
        else if (artists.length === 0)
            artists = ["<N/A>"];


        var result = "`Art: " + artists.join(" ");
        result += "`  `Copyrights: " + copyrights.join(" ");
        result += "`\n`Characters: " + characters.join(" ");
        if (searched.length > 0 && searched.length < 10)
            result += "`  `Searched: " + searched.join(" ");
        result += "`\n [" + id + "+" + score + "p]" + imgUrl;


        //If timeout hasnt been triggered we need to send a new message
        if (!timeOutTriggered) {
            info.channel.send(result);
            //Otherwise edit the sent message
        } else {
            var editDelay = 0;
            if (!sentMessage) //Somehow timeout has triggered but message hasnt been set yet
                editDelay = 2500;
            setTimeout(function () {
                if (sentMessage)
                    sentMessage.edit(result);
                else
                    bot.error("Couldn't edit the message. sentMessage is null");
            }, editDelay);
        }
    }, delay);
}


function getTopTags(site, siteName) {
    var topArtist = { timesGotten: 0 };
    var topCopyright = { timesGotten: 0 };
    var topCharacter = { timesGotten: 0 };
    for (var tagName in site.tags) {
        var tag = site.tags[tagName];
        if (tagName === "original" || tagName === "artist_request" || tagName === "copyright_request")
            continue;

        if (tag.type === tagTypes[siteName].artist && tag.timesGotten > topArtist.timesGotten) {
            topArtist = {
                name: tagName,
                timesGotten: tag.timesGotten
            };
        } else if (tag.type === tagTypes[siteName].copyright && tag.timesGotten > topCopyright.timesGotten) {
            topCopyright = {
                name: tagName,
                timesGotten: tag.timesGotten
            };
        } else if (tag.type === tagTypes[siteName].character && tag.timesGotten > topCharacter.timesGotten) {
            topCharacter = {
                name: tagName,
                timesGotten: tag.timesGotten
            };
        }
    }
    return {
        topArtist: topArtist,
        topCopyright: topCopyright,
        topCharacter: topCharacter
    };
}

function contains(lst, val) {
    return lst.indexOf(val) > -1;
}

exports.commands = {
    tagsearch: {
        commands: ["!searchtag", "!tagsearch", "!st", "!ts"],
        description: "Look up tags",
        exec: async function (command, message) {
            if (command.arguments.length !== 1) return;
            var url = "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&name_pattern=" + encodeURIComponent(command.arguments[0]);
            let tags = await bot.util.httpGetJson(url).catch((err)=> {
                    bot.error("Error while getting the tags from gelbooru.");
                    bot.error(err);
            });
            if(!tags) 
                return;
            tags.sort((a, b) => b.count - a.count);

            var responseText = [];
            responseText.push("```");
            for (var i in tags) {
                if (i > 20) break;
                var tag = tags[i];
                if (tag.count > 9 || tags.length < 20)
                    responseText.push(tag.tag + " (" + tag.count + ")");
            }
            if (responseText.length === 1)
                responseText.push("No tags matched.");
            responseText.push("```");
            var response = new bot.RichEmbed()
                .addField("Tags matching \"" + command.arguments[0] + "\"", responseText.join("\n"));
            message.channel.send(response);
        }
    },
    search: {
        commands: ["!search", "!s"],
        description: "Search for stuff",
        exec: async function (command, message) {
            var args = command.arguments;
            if (!args.length) {
                args = lastSearches[message.author.id];
            } else {
                lastSearches[message.author.id] = args;
            }
            if (!args || args.length < 1)
                return;
            args = args.filter(Boolean);
            var firstArg = args.shift();
            //Stop brian from putting NTR all over the chat
            var brian = "112480170048274432";
            if (args.indexOf("netorare") !== -1 && message.author.id === brian ||
                args.indexOf("cheating") !== -1 && message.author.id === brian) {
                message.channel.send("no brian");
                return;
            }

            var info = {
                channel: message.channel,
                user: message.author.id
            };

            let data = await bot.datastore.get("user_" + message.author.id).catch(bot.error);
            if(!data) return;

            var fail = false;
            var blacklist_addition;
            if (data.search && data.search.blacklist && data.search.blacklist.length > 0) {
                fail = data.search.blacklist.some((t) => args.indexOf(t) > -1);
                args = args.concat(data.search.blacklist.map(b => "-" + b));
            }

            if (firstArg === "imfeelinglucky" || firstArg === "ifl") {
                    if (!data.searchstats || !data.searchstats.sites) {
                        return message.channel.send("No stats found. Do some searches first.");
                    }

                    var sites = data.searchstats.sites;
                    var site = "";
                    //No additional arguments, get a random site
                    if (args.length) {
                        //Check each site for the provided argument
                        for (var j in cmds) {
                            var cmd = cmds[j];
                            if (contains(cmd, args[0])) {
                                site = cmd[0];
                            }
                        }
                    }
                    //No site, get a random one
                    if (!site) {
                        var keys = Object.keys(sites);
                        site = keys[Math.floor(Math.random() * keys.length)];
                    }
                    //Get tag
                    var tags = Object.keys(sites[site].tags).map((tag) => sites[site].tags[tag].timesSearched ? tag : null).filter(Boolean);
                    if (tags.length === 0) tags = [""];
                    var tag = [tags[Math.floor(Math.random() * tags.length)], blacklist_addition].filter(Boolean);

                    //Search
                    if (contains(cmds.gelbooru, site))
                        return gbSearch(info, tag);
            } else if (contains(cmds.gelbooru, firstArg)) {
                if (fail) return message.channel.send("How about you don't search for a blacklisted tag?");
                return gbSearch(info, args);
            } else {
                var sites = "";
                for (var cmd in cmds)
                    sites += cmd + " ";
                message.channel.send("Available search targets are `" + sites + "`\nOr you can try `imfeelinglucky`");
            }
        }
    },
    blacklisttag: {
        commands: ["!blacklist"],
        description: "Remove tags from your search results automatically",
        exec: async function (command, message) {
            var args = command.arguments;

            let data = await bot.datastore.get("user_" + message.author.id).catch(bot.error);
            if(!data) return;

            if (!data.search) {
                data.search = {
                    blacklist: []
                };
            }

            if (!data.search.blacklist) {
                data.search.blacklist = [];
            }

            var i;
            var blacklist = data.search.blacklist;
            var arg = args.shift();
            if (!arg) {
                if (blacklist.length > 0) {
                    return message.channel.send("`" + blacklist.join(" ") + "`");
                } else {
                    return message.channel.send("Empty blacklist.");
                }
            }
            else if (arg === "remove" && args.length > 0) {
                if (blacklist.length > 0) {
                    var removed = [];
                    for (i in args) {
                        arg = args[i];
                        if (blacklist.indexOf(arg) > -1) {
                            removed.push(blacklist.splice(blacklist.indexOf(arg), 1)[0]);
                        }
                    }
                    if (removed.length === 0) {
                        return message.channel.send((args.length === 1 ? "That tag isn't" : "Those tags aren't" ) + " on your blacklist.");
                    } else {
                        message.channel.send("Removed tag" + (removed.length === 1 ? "" : "s") + " `" + removed.join(" ") + "` from your blacklist.");
                    }
                } else {
                    return message.channel.send("There are no tags in your blacklist.");
                }
            } else {
                var added = [];
                args = [arg].concat(args);
                for (i in args) {
                    arg = args[i];
                    if (blacklist.indexOf(arg) === -1) {
                        blacklist.push(arg);
                        added.push(arg);
                    }
                }
                if (added.length === 0) {
                    return message.channel.send((args.length === 1 ? "That tag is" : "Those tags are") + " already on your blacklist.");
                } else {
                    message.channel.send("Added tag" + (added.length === 1 ? "" : "s") + " `" + added.join(" ") + "` to your blacklist.");
                }
            }

            bot.datastore.set("user_" + message.author.id, data).catch();
        }
    },
    removesearchedtag: {
        commands: ["!ssremovetag", "!sstagremove", "!removetag", "!tagremove"],
        description: "Remove tags from your search stats",
        exec: async function (command, message) {
            var args = command.arguments;
            var mods = command.modifiers;
            if (!args.length) return;

            let data = await bot.datastore.get("user_" + message.author.id).catch(bot.error);
            if(!data) return;

            if (!data.searchstats || !data.searchstats.sites) {
                return message.channel.send("No stats found.");
            }

            var i, j;
            var sites = [];
            if (mods.length > 0) {
                for (i in mods) {
                    var mod = mods[i];
                    for (j in cmds) {
                        var cmd = cmds[j];
                        if (contains(cmd, mod)) {
                            if (data.searchstats.sites[cmd[0]]) {
                                sites.push(data.searchstats.sites[cmd[0]]);
                                break;
                            } else {
                                return message.channel.send("No stats found for " + cmd[0]);
                            }
                        }
                    }
                }
                if (!sites.length) return message.channel.send("No stats found for `" + mods.join(", ") + "`");
            }
            else {
                sites = Object.values(data.searchstats.sites);
            }
            var response = [];
            while (args.length) {
                var tag = args.shift();
                for (var i in sites) {
                    if (sites[i].tags[tag]) {
                        sites[i].tags[tag].timesSearched = 0;
                        response.push(tag);
                    }
                }
            }
            var last;
            if (response.length > 1) {
                last = response.pop();
            }

            try {
                await bot.datastore.set("user_" + message.author.id, data);
                message.channel.send("Removed `" + response.join(", ") + (last ? " and " + last : "") + "`");
            } catch(err) {
                message.channel.send("Couldn't remove `" + response.join(", ") + (last ? " and " + last : "") + "`");
            }
        }
    },
    searchstats: {
        commands: ["!searchstats", "!ss"],
        description: "Get your search stats",
        exec: async function (command, message) {
            var args = command.arguments;

            var firstArg = args.shift();

            if (contains(sscmds.global, firstArg)) {
                let data = await bot.datastore.get("search_stats").catch(bot.error);
                if(!data) return;
                
                if (!data.sites) {
                    return message.channel.send("No stats found.");
                }

                var top, site, response;
                if (args.length) {
                    for (var j in cmds) {
                        var cmd = cmds[j];
                        if (contains(cmd, args[0])) {
                            if (data.sites[cmd[0]]) {
                                site = data.sites[cmd[0]];
                                top = getTopTags(site, cmd[0]);

                                response = "```Stats for " + cmd[0];
                                response += "\nSearches: " + site.searches;
                                response += "\nChickens: " + site.chickens;
                                response += "\nTop artist: " + top.topArtist.name + "(" + top.topArtist.timesGotten + ")";
                                response += "\nTop character: " + top.topCharacter.name + "(" + top.topCharacter.timesGotten + ")";
                                response += "\nTop copyright: " + top.topCopyright.name + "(" + top.topCopyright.timesGotten + ")";
                                response += "```";
                                message.channel.send(response);
                                break;
                            } else {
                                message.channel.send("No stats found for " + cmd[0]);
                            }
                        }
                    }
                } else {
                    var totalSearches = 0;
                    var totalChickens = 0;
                    top = {
                        topArtist: { timesGotten: 0 },
                        topCopyright: { timesGotten: 0 },
                        topCharacter: { timesGotten: 0 }
                    };
                    for (var i in data.sites) {
                        site = data.sites[i];
                        if (site.searches)
                            totalSearches += site.searches;
                        if (site.chickens)
                            totalChickens += site.chickens;

                        var siteTop = getTopTags(site, i);
                        if (siteTop.topArtist.timesGotten > top.topArtist.timesGotten)
                            top.topArtist = siteTop.topArtist;
                        if (siteTop.topCopyright.timesGotten > top.topCopyright.timesGotten)
                            top.topCopyright = siteTop.topCopyright;
                        if (siteTop.topCharacter.timesGotten > top.topCharacter.timesGotten)
                            top.topCharacter = siteTop.topCharacter;
                    }
                    response = "```Stats for all sites";
                    response += "\nSearches: " + totalSearches;
                    response += "\nChickens: " + totalChickens;
                    response += "\nTop artist: " + top.topArtist.name + "(" + top.topArtist.timesGotten + ")";
                    response += "\nTop character: " + top.topCharacter.name + "(" + top.topCharacter.timesGotten + ")";
                    response += "\nTop copyright: " + top.topCopyright.name + "(" + top.topCopyright.timesGotten + ")";
                    response += "```";
                    message.channel.send(response);
                }
            } else {
                let data = await bot.datastore.get("search_stats").catch(bot.error);
                if(!data) return;
            
                if (!data.searchstats || !data.searchstats.sites) {
                    return message.channel.send("No stats found.");
                }

                if (args.length) {
                    for (var j in cmds) {
                        var cmd = cmds[j];
                        if (contains(cmd, args[0])) {
                            if (data.searchstats.sites[cmd[0]]) {
                                var site = data.searchstats.sites[cmd[0]];
                                var top = getTopTags(site, cmd[0]);

                                var response = "```Stats for " + message.author.username + " on " + cmd[0];
                                response += "\nSearches: " + site.searches;
                                response += "\nChickens: " + site.chickens;
                                response += "\nTop artist: " + top.topArtist.name + "(" + top.topArtist.timesGotten + ")";
                                response += "\nTop character: " + top.topCharacter.name + "(" + top.topCharacter.timesGotten + ")";
                                response += "\nTop copyright: " + top.topCopyright.name + "(" + top.topCopyright.timesGotten + ")";
                                response += "```";
                                message.channel.send(response);
                                break;
                            } else {
                                message.channel.send("No stats found for " + cmd[0]);
                            }
                        }
                    }
                } else {
                    var totalSearches = 0;
                    var totalChickens = 0;
                    top = {
                        topArtist: { timesGotten: 0 },
                        topCopyright: { timesGotten: 0 },
                        topCharacter: { timesGotten: 0 }
                    };
                    for (var i in data.searchstats.sites) {
                        site = data.searchstats.sites[i];
                        totalSearches += site.searches;
                        totalChickens += site.chickens;
                        var siteTop = getTopTags(site, i);
                        if (siteTop.topArtist.timesGotten > top.topArtist.timesGotten)
                            top.topArtist = siteTop.topArtist;
                        if (siteTop.topCopyright.timesGotten > top.topCopyright.timesGotten)
                            top.topCopyright = siteTop.topCopyright;
                        if (siteTop.topCharacter.timesGotten > top.topCharacter.timesGotten)
                            top.topCharacter = siteTop.topCharacter;
                    }
                    response = "```Stats for " + message.author.username;
                    response += "\nSearches: " + totalSearches;
                    response += "\nChickens: " + totalChickens;
                    response += "\nTop artist: " + top.topArtist.name + "(" + top.topArtist.timesGotten + ")";
                    response += "\nTop character: " + top.topCharacter.name + "(" + top.topCharacter.timesGotten + ")";
                    response += "\nTop copyright: " + top.topCopyright.name + "(" + top.topCopyright.timesGotten + ")";
                    response += "```";
                    message.channel.send(response);
                }
            }
        }
    }
};

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (searchString, position) {
        position = position || 0;
        return this.substr(position, searchString.length) === searchString;
    };
}