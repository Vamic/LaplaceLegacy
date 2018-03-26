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

function getTags(site, unknownTags, knownTags, callback) {
    //Check our saved tags so we dont have to look up every single tag every single time
    if (!storedTags[site]) {
        fs.readFile("tmp/" + site + ".tags.json", function (err, data) {
            //If the file doesnt exist, create it
            if (err) {
                storedTags[site] = {};
            } else {
                storedTags[site] = JSON.parse(data);
            }
            return getTags(site, unknownTags, knownTags, callback);
        });
    //Check if we still have tags to look up
    } else if (unknownTags.length > 0) {
        //Gelbooru
        if (site === cmds.gelbooru[0]) {
            //Check next tag while removing it from unknown
            var nextTag = unknownTags.splice(0, 1)[0];
            //Check if we already have it saved
            if (storedTags[site][nextTag]) {
                knownTags[nextTag] = {
                    name: nextTag,
                    type: storedTags[site][nextTag].type
                };
                return getTags(site, unknownTags, knownTags, callback);
            }
            //We don't have the tag so look it up

            var url = "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&name=" + encodeURIComponent(nextTag);
            bot.util.httpGetJson(url, function (err, tags) {
                if (err) {
                    console.log("Error while getting the tag from gelbooru.");
                    console.log(err);
                    return getTags(site, unknownTags, knownTags, callback);
                }
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
                return setTimeout(function () {
                    return getTags(site, unknownTags, knownTags, callback);
                }, delay);
            });
        } else {
            callback("Unknown site provided.");
        }
    //We have stored tags and we dont need to look any more up so save what we have then return the tags
    } else {
        fs.writeFile("tmp/" + site + ".tags.json", JSON.stringify(storedTags[site]), function (err) {
            if (err) {
                bot.error(err);
                callback(err);
            } else {
                callback(null, knownTags);
            }
        });
    }
}

function updateStats(site, searchedTags, resultTags, user, chicken, callback) {
    //Get the stats
    bot.datastore.get("search_stats", function (err, data) {
        if (err)
            return;

        //First time initialization
        if (!data.sites) {
            data.sites = {
                sites: {}
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
        getTags(site, unknownTags, {}, function (err, foundTags) {
            if (err)
                return console.log(err);
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
            bot.datastore.set("search_stats", data);

            //Handle the user stats
            bot.datastore.get("user_" + user, function (err, userData) {
                if (err)
                    return;

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

                //Update stats for the site
                userData.searchstats.sites[site].searches++;
                if (chicken)
                    userData.searchstats.sites[site].chickens++;

                //Store the searched for tags, artists and copyrights
                for (i in resultTags) {
                    resultTag = resultTags[i];
                    var tag = data.sites[site].tags[resultTag];
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
                                if (!userData.searchstats.sites[site].tags[resultTag]) {
                                    userData.searchstats.sites[site].tags[resultTag] = {
                                        type: 0,
                                        timesGotten: 0,
                                        timesSearched: 0
                                    };
                                }
                                //Up the stats
                                userData.searchstats.sites[site].tags[resultTag].timesSearched++;
                            }
                        }
                        //Up the amount gotten on added tags
                        if (userData.searchstats.sites[site].tags[resultTag]) {
                            userData.searchstats.sites[site].tags[resultTag].timesGotten++;
                        }
                        //Artist/Copyright/Character tags
                    } else if (tag.type > 0 && tag.type < 5) {
                        if (!userData.searchstats.sites[site].tags[resultTag]) {
                            userData.searchstats.sites[site].tags[resultTag] = {
                                type: tag.type,
                                timesGotten: 0,
                                timesSearched: 0
                            };
                        }
                        //Add stats
                        userData.searchstats.sites[site].tags[resultTag].timesGotten++;
                        for (j in searchedTags) {
                            //Bla bla "xxx*" not enough to count
                            if (searchedTags[j].split("*")[0].length < 3)
                                continue;
                            if (resultTag.startsWith(searchedTags[j].split("*")[0])) {
                                userData.searchstats.sites[site].tags[resultTag].timesSearched++;
                            }
                        }
                    }
                }
                //Save it
                bot.datastore.set("user_" + user, userData);
                callback(null, data);
            });
        });
    });
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

function gbSearch(info, args) {
    var url = "https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=rating:safe+sort:random+-spoilers+" + encodeURIComponent(args.join("+")).replace(/%2B/g,"+");
    //Exclude unless searched for
    if (args.indexOf("game_cg") === -1)
        url += "+-game_cg";
    if (args.indexOf("comic") === -1)
        url += "+-comic";

    bot.util.httpGetJson(url, function (err, posts) {
        if (err) {
            //if we got an empty response there were no posts with those tags
            if (err === "Empty response body.") {
                return updateStats(cmds.gelbooru[0], args, [], info.user, true, function (err, data) {
                    info.channel.send("Nobody here but us chickens!");
                });
            } else {
                console.log(err);
                return info.channel.send("something broke when fetching the images");
            }
        }

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
        setTimeout(function () {
            updateStats(site, args, tags, info.user, false, function (err, data) {
                if (err) {
                    info.channel.send("An error occurred, check log. (1)");
                    bot.error(err);
                    return;
                }
                handled = true;
                for (var i in data.sites[site].tags) {
                    var tag = data.sites[site].tags[i];
                    if (tag.type > 0) {
                        //Filter out special tags from the ones we have in the post
                        for (var m in tags) {
                            if (tags[m] === i) {
                                //Decide what group the tag goes in
                                if (tag.type === tagTypes[site]["artist"])
                                    artists.push(tags[m]);
                                else if (tag.type === tagTypes[site]["copyright"])
                                    copyrights.push(tags[m]);
                                else if (tag.type === tagTypes[site]["character"])
                                    characters.push(tags[m]);
                            }
                        }
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
            });
        }, delay);
    });
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
        exec: function (command, message) {
            if (command.arguments.length !== 1) return;
            var url = "https://gelbooru.com/index.php?page=dapi&s=tag&q=index&json=1&name_pattern=" + encodeURIComponent(command.arguments[0]);
            bot.util.httpGetJson(url, function (err, tags) {
                if (err) {
                    console.log("Error while getting the tags from gelbooru.");
                    console.log(err);
                    return getTags(site, unknownTags, knownTags, callback);
                }
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
            });
        }
    },
    search: {
        commands: ["!search", "!s"],
        description: "Search for stuff",
        exec: function (command, message) {
            var args = command.arguments;
            if (!args || args.length < 1)
                return;
            args = args.filter(Boolean);
            var firstArg = args.splice(0, 1)[0];
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
            if (firstArg === "imfeelinglucky" || firstArg === "ifl") {
                bot.datastore.get("user_" + message.author.id, function (err, data) {
                    if (err)
                        return;

                    if (!data.searchstats || !data.searchstats.sites) {
                        return message.channel.send("No stats found.");
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
                    var tag = [tags[Math.floor(Math.random() * tags.length)]];

                    //Search
                    if (contains(cmds.gelbooru, site))
                        return gbSearch(info, tag);
                });
            } else if (contains(cmds.gelbooru, firstArg)) {
                return gbSearch(info, args);
            } else {
                var sites = "";
                for (var cmd in cmds)
                    sites += cmd + " ";
                message.channel.send("Available search targets are `" + sites + "`\nOr you can try `imfeelinglucky`");
            }
        }
    },
    searchstats: {
        commands: ["!searchstats", "!ss"],
        description: "Get your search stats",
        exec: function (command, message) {
            var args = command.arguments;

            var firstArg = args.splice(0, 1)[0];

            if (contains(sscmds.global, firstArg)) {
                bot.datastore.get("search_stats", function (err, data) {
                    if (err)
                        return;

                    if (!data.sites) {
                        return message.channel.send("No stats found.");
                    }

                    var top, site, messageOut;
                    if (args.length) {
                        for (var j in cmds) {
                            var cmd = cmds[j];
                            if (contains(cmd, args[0])) {
                                if (data.sites[cmd[0]]) {
                                    site = data.sites[cmd[0]];
                                    top = getTopTags(site, cmd[0]);

                                    messageOut = "```Stats for " + cmd[0];
                                    messageOut += "\nSearches: " + site.searches;
                                    messageOut += "\nChickens: " + site.chickens;
                                    messageOut += "\nTop artist: " + top.topArtist.name + "(" + top.topArtist.timesGotten + ")";
                                    messageOut += "\nTop character: " + top.topCharacter.name + "(" + top.topCharacter.timesGotten + ")";
                                    messageOut += "\nTop copyright: " + top.topCopyright.name + "(" + top.topCopyright.timesGotten + ")";
                                    messageOut += "```";
                                    message.channel.send(messageOut);
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
                        messageOut = "```Stats for all sites";
                        messageOut += "\nSearches: " + totalSearches;
                        messageOut += "\nChickens: " + totalChickens;
                        messageOut += "\nTop artist: " + top.topArtist.name + "(" + top.topArtist.timesGotten + ")";
                        messageOut += "\nTop character: " + top.topCharacter.name + "(" + top.topCharacter.timesGotten + ")";
                        messageOut += "\nTop copyright: " + top.topCopyright.name + "(" + top.topCopyright.timesGotten + ")";
                        messageOut += "```";
                        message.channel.send(messageOut);
                    }
                });
            } else {
                bot.datastore.get("user_" + message.author.id, function (err, data) {
                    if (err)
                        return;

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

                                    var messageOut = "```Stats for " + message.author.username + " on " + cmd[0];
                                    messageOut += "\nSearches: " + site.searches;
                                    messageOut += "\nChickens: " + site.chickens;
                                    messageOut += "\nTop artist: " + top.topArtist.name + "(" + top.topArtist.timesGotten + ")";
                                    messageOut += "\nTop character: " + top.topCharacter.name + "(" + top.topCharacter.timesGotten + ")";
                                    messageOut += "\nTop copyright: " + top.topCopyright.name + "(" + top.topCopyright.timesGotten + ")";
                                    messageOut += "```";
                                    message.channel.send(messageOut);
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
                        messageOut = "```Stats for " + message.author.username;
                        messageOut += "\nSearches: " + totalSearches;
                        messageOut += "\nChickens: " + totalChickens;
                        messageOut += "\nTop artist: " + top.topArtist.name + "(" + top.topArtist.timesGotten + ")";
                        messageOut += "\nTop character: " + top.topCharacter.name + "(" + top.topCharacter.timesGotten + ")";
                        messageOut += "\nTop copyright: " + top.topCopyright.name + "(" + top.topCopyright.timesGotten + ")";
                        messageOut += "```";
                        message.channel.send(messageOut);
                    }
                });
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