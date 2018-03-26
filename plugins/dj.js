const bot = module.parent.exports;

const proc = require("child_process");
const cassette = require("cassette");
const djsmusic = require("discord.js-music");
const ytdl = require('ytdl-core'); //For youtube service

//Check and Download youtube-dl binary

const request = require("request");
const fs = require('fs');

const os = require('os');
const path = require("path");

const binName = os.platform().indexOf("win") === 0 ? "youtube-dl.exe" : "youtube-dl";
var ytdlBinary = path.normalize(path.join(__dirname, "..", "binaries", binName));

// Where to download the latest YTDL
var youtubeDlUrl = "https://yt-dl.org/latest/" + binName;

var downloadFileTo = function (url, dest, cb) {
    var file = fs.createWriteStream(dest);
    file.on('error', function (err) {
        console.log(err);
    });
    file.on('finish', function () {
        file.close(cb);
    });
    request(url).pipe(file);
};

var downloadYTDL = function (callback) {
    downloadFileTo(youtubeDlUrl, ytdlBinary, callback);
};

if (!fs.existsSync(ytdlBinary)) {
    bot.log("No youtube-dl found on startup. Downloading...");
    downloadYTDL(function () {
        bot.log("Youtube-dl downloaded");
    });
}

// Services

const keys = bot.secrets.keys;
const ytService = new cassette.YouTubeService(keys.youtube);
const scService = new cassette.SoundcloudService(keys.soundcloud);
const DirectService = require("./services/direct/Service.js");
const dService = new DirectService.default(ytdlBinary);

var volumes = {
    //<GUILD_ID> : <0-1>
};
var listening = {
    //<GUILD_ID> : <BOOLEAN>
};

const DELETE_TIME = 15000;
const DEFAULT_VOLUME = 50;

ytService.regex = /(https?:\/\/(www\.)?youtube\.\w{2,3}\/)|(http:\/\/(www\.)?youtu\.be\/)/i;
scService.regex = /https?:\/\/(www\.)*soundcloud.com\/.*?\/./i;
//bcService.regex = /https?:\/\/(.*?)\.bandcamp.com\/track\/./i;

ytService.type = "youtube";
scService.type = "soundcloud";

ytService.getSongInfo = function (url, cb) {
    ytdl.getInfo(url, { filter: "audioonly" }, function (err, info) {
        if (err) cb(err);
        else {
            cb(null, {
                metadataType: "youtube",
                imgURL: info.thumbnail_url,
                title: info.title,
                duration: info.length_seconds,
                url: info.video_url,
                icon: "https://cdn1.iconfinder.com/data/icons/logotypes/32/youtube-256.png"
            });
        }
    });
};

ytService.getSeekTo = function (url) {
    var lookFor = ["&t=", "?t="];
    for (var i in lookFor) {
        var key = lookFor[i];
        var start = url.indexOf(key);
        if (start === -1) continue;
        start += key.length;
        var time = "";
        var char = "";
        for (var j = start; j < url.length; j++) {
            char = url[j];
            if (isNaN(char))
                break;
            time += char;
        }
        return time;
    }
    return 0;
};

scService.getSongInfo = function (url, cb) {
    url = url.replace("/stream", "?client_id=" + keys.soundcloud);
    bot.util.httpGetJson(url, function (err, info) {
        if (err) cb(err);
        else {
            cb(null, {
                metadataType: "soundcloud",
                imgURL: info.artwork_url,
                title: info.title,
                duration: info.duration / 1000,
                url: info.permalink_url,
                genre: [info.genre],
                icon: "https://cdn2.iconfinder.com/data/icons/social-icon-3/512/social_style_3_soundCloud-128.png"
            });
        }
    });
};

scService.getSeekTo = function (url) {
    return dService.getSeekTo(url);
};

dService.setSongDisplay = setSongDisplay;
scService.setSongDisplay = setSongDisplay;
ytService.setSongDisplay = setSongDisplay;

const services = module.exports.services ? module.exports.services : {};
services[dService.type] = dService;
services[ytService.type] = ytService;
services[scService.type] = scService;

function setVolume(id, volume) {
    if (!volume) volume = DEFAULT_VOLUME;
    if (volume >= 0 && volume <= 100) volume = volume / 100;
    volumes[id] = volume;
    bot.log("Set volume to " + volume + " in guild:" + id);

    var vc = bot.voiceConnections.get(id);
    if (!vc || !vc.dispatcher) return;
    vc.dispatcher.setVolume(volume);
}

function getStreamOptions(id) {
    if (!volumes[id])
        setVolume(id, 50);
    return {
        seek: bot.guilds.get(id).playlist.current ? bot.guilds.get(id).playlist.current.seek : 0,
        volume: volumes[id]
    };
}

function initiateSongInfo(song, cb) {
    if (song.display && song.display.embed) cb(null, song);
    else song.service.getSongInfo(song.streamURL, function (err, info) {
        if (!info) info = {};

        var vc = bot.voiceConnections.get(song.guild.id);
        info.currentTime = vc.dispatcher.time / 1000;
        info.addedBy = song.adder.displayName;

        song.info = info;

        if (err) {
            song.info = {};
            song.info.addedBy = song.adder.displayName;
            song.info.url = song.streamURL;
            song.info.title = song.streamURL;
            song.display = { embed: new bot.RichEmbed().setAuthor("Unknown").setTitle(song.streamURL) };
        } else {
            services[song.type].setSongDisplay(song);
        }
        
        setSongDisplayDescription(song);
        cb(err, song);
    });
}

function setSongDisplayDescription(song) {
    var vc = bot.voiceConnections.get(song.guild.id);
    song.info.currentTime = vc.dispatcher.time / 1000;
    
    var playtime = toHHMMSS(song.info.currentTime) + "/";
    if (song.info.duration > 0)
        playtime += toHHMMSS(song.info.duration);
    else
        playtime += "?";
    song.display.embed.setDescription(playtime + " added by " + song.info.addedBy + "\n" + song.info.url);
}

function setSongDisplay(song) {
    var tags = song.info;
    var embed = new bot.RichEmbed();
    var playtime = toHHMMSS(tags.currentTime) + "/";
    song.display = {};

    if (tags.metadataType === "youtube") embed.setColor([150, 50, 50]); 
    if (tags.metadataType === "soundcloud") embed.setColor([150,80, 0]);
    if (tags.metadataType === "ID3") embed.setColor([75, 75, 75]);

    if (tags.metadataType === "youtube" || tags.metadataType === "soundcloud") {
        embed.setAuthor(tags.metadataType[0].toUpperCase() + tags.metadataType.substr(1), tags.icon);
        embed.setTitle(tags.title || tags.url);
    } else if (tags.metadataType === "ID3") {
        embed.setAuthor("Direct");
        var title = tags.title || tags.url.split("/").slice(-1)[0];
        embed.setTitle(title);
        if (tags.artist.length) {
            var artisttext = tags.artist.splice(0, 1)[0];
            if (tags.artist.length)
                artisttext += "ft. " + tags.artist.join(" and ");
            embed.addField("Artist", artisttext, true);
        }
        if (tags.album) {
            var albumtext = tags.album;
            if (tags.albumartist.length)
                albumtext += " ft. " + tags.albumartist.join(", ");
            if (tags.year)
                albumtext += " (" + tags.year + ")";
            embed.addField("Album", albumtext, true);
            if (tags.track.no) {
                var tracktext = tags.track.no + "/" + tags.track.of;
                if (tags.disk.no) {
                    var disktext = tags.track.no + "/" + tags.track.of;
                    tracktext += " on Disk " + disktext;
                }
                embed.addField("Track", tracktext, true);
            }
        }
    }
    if (tags.genre && tags.genre.filter(Boolean).length) {
        embed.addField("Genre", tags.genre.join(", "), true);
    }
    if (tags.imgURL) {
        embed.setThumbnail(tags.imgURL);
    } else if (tags.img && tags.imgFormat) {
        var thumbnailName = "thumb." + tags.imgFormat;
        embed.setThumbnail("attachment://" + thumbnailName);
        song.display.files = [new bot.Attachment(tags.img, thumbnailName)];
    }
    song.display.embed = embed;
}

function toDoubleDigit(input) {
    if (input < 10) { return "0" + input; } else return input;
}

function toHHMMSS(input) {
    var sec_num = parseInt(input, 10);
    var minutes = Math.floor(sec_num / 60);
    var seconds = sec_num - minutes * 60;
    
    return toDoubleDigit(minutes) + ':' + toDoubleDigit(seconds);
}

function isValidURL(str) {
    var pattern = /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g;
    return pattern.test(str);
}

exports.commands = {
    joinchannel: {
        commands: [
            "!dj join",
            "!dj j",
            "!join",
            "!summon"
        ],
        requirements: [bot.requirements.guild, bot.requirements.userInVoice],
        exec: function (command, message) {
            message.delete(DELETE_TIME);
            message.member.voiceChannel.join().then(function () {
                message.channel.send("Here I am.").then(m => m.delete(DELETE_TIME));
                if (message.guild.playlist.current)
                    message.guild.playlist.start(message.member.voiceChannel);
            });
        }
    },
    leavechannel: {
        commands: [
            "!dj leave",
            "!dj l",
            "!leave"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            message.guild.playlist.pause();
            bot.voiceConnections.get(message.guild.id).channel.leave();
            message.delete(DELETE_TIME);
        }
    },
    addtoqueue: {
        commands: [
            "!dj queue",
            "!dj q",
            "!play"
        ],
        requirements: [bot.requirements.guild, bot.requirements.userInVoice],
        exec: function (command, message) {
            message.delete(DELETE_TIME);
            if (command.command === "!dj queue" && command.arguments.length === 0) return exports.commands.showqueue.exec(command, message);
                  
            var foundServices = {};

            var search = "";

            for (var i in command.arguments) {
                var arg = command.arguments[i];
                if (isValidURL(arg)) {
                    var found = false;
                    for (var type in services) {
                        if (services[type].regex.test(arg)) {
                            if (services[type]) {
                                if(!foundServices[type])
                                    foundServices[type] = "";
                                foundServices[type] += arg + " ";
                                found = true;
                                break;
                            }
                        }
                    }
                    if (!found) {
                        if (!foundServices["direct"])
                            foundServices["direct"] = "";
                        foundServices["direct"] += arg + " ";
                    }
                } else {
                    search += arg + " ";
                }
            }

            if (isValidURL(search)) {
                found = false;
                for (type in services) {
                    if (services[type].regex.test(search)) {
                        if (services[type]) {
                            if (!foundServices[type])
                                foundServices[type] = "";
                            foundServices[type] += search + " ";
                            found = true;
                            break;
                        }
                    }
                }
                if (!found) {
                    if (!foundServices["direct"])
                        foundServices["direct"] = "";
                    foundServices["direct"] += search;
                }
            } else {
                if (!foundServices["youtube"])
                    foundServices["youtube"] = "";
                foundServices["youtube"] += search;
            }

            var playlist = message.guild.playlist;
            var totalSongs = [];
            var count = 0;

            for (type in foundServices) {
                playlist.add(foundServices[type], [services[type]]).then(function (songs) {
                    totalSongs = totalSongs.concat(songs);
                    count++;
                    if (count === Object.keys(foundServices).length) {
                        if (totalSongs.length === 1)
                            message.channel.send(message.member.displayName + " added song: " + totalSongs[0].title + "\n<" + totalSongs[0].streamURL + ">").then(m => m.delete(DELETE_TIME));
                        else
                            message.channel.send(message.member.displayName + " added " + totalSongs.length + " songs").then(m => m.delete(DELETE_TIME));
                    }

                    if (!songs.length) return;

                    for (var i in songs) {
                        var song = songs[i];
                        playlist[playlist.indexOf(song)].adder = message.member;
                        playlist[playlist.indexOf(song)].guild = message.guild;
                        var input = foundServices[songs.type];
                        if (isValidURL(input))
                            playlist[playlist.indexOf(song)].seek = foundService.getSeekTo(input);
                        else
                            playlist[playlist.indexOf(song)].seek = 0;
                    }

                    if (!playlist.playing)
                        playlist.start(message.member.voiceChannel, getStreamOptions(message.guild.id)).then(function () {
                            var vc = bot.voiceConnections.get(message.guild.id);
                            if (!listening[message.guild.id]) {
                                listening[message.guild.id] = true;
                                playlist.events.on("playing", function () {
                                    bot.user.setPresence({ game: { name: playlist.current.title }, status: 'online' });
                                });
                                playlist.events.on("ended", function (reason) {
                                    bot.user.setPresence({ game: {}, status: 'online' });
                                });
                                playlist.events.on("error", function (err) {
                                    bot.user.setPresence({ game: {}, status: 'online' });
                                    bot.error(err);
                                });
                                playlist.events.on("streamError", function (err) {
                                    bot.user.setPresence({ game: {}, status: 'online' });
                                    bot.error(err);
                                });
                            }
                        });
                });
            }
        }
    },
    skipcurrent: {
        commands: [
            "!dj skip",
            "!dj s",
            "!skip"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            message.channel.send("Skipped.").then(m => m.delete(DELETE_TIME));
            if (!message.guild.playlist.hasNext()) message.guild.playlist.destroy();
            message.guild.playlist.next();
            if (message.guild.playlist.current)
                message.guild.playlist.start(message.member.voiceChannel, getStreamOptions(message.guild.id));

            message.delete(DELETE_TIME);
        }
    },
    pausemusic: {
        commands: [
            "!dj pause",
            "!dj p",
            "!pause"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            message.channel.send("Paused.").then(m => m.delete(DELETE_TIME));
            message.guild.playlist.pause();
            message.delete(DELETE_TIME);
        }
    },
    resumemusic: {
        commands: [
            "!dj resume",
            "!dj r",
            "!resume"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            message.channel.send("Resumed.").then(m => m.delete(DELETE_TIME));
            message.guild.playlist.resume();
            if (!message.guild.playlist.playing)
                message.guild.playlist.start(message.channel, getStreamOptions(message.guild.id));
            message.delete(DELETE_TIME);
        }
    },
    showqueue: {
        commands: [
            "!dj list",
            "!queue"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            var playlist = message.guild.playlist;
            if (!playlist.current) return bot.error("[DJ-showcurrent] Error: No Current song.");
            var vc = bot.voiceConnections.get(message.guild.id);
            if (!vc.dispatcher) return bot.error("[DJ-showcurrent] Error: No Dispatcher.");
            
            if (playlist.current.display) {
                message.delete(DELETE_TIME);
                playlist.current.info.currentTime = vc.dispatcher.time / 1000;
                setSongDisplayDescription(playlist.current);

                _sendQueue(message);
            } else {
                message.delete(DELETE_TIME);
                initiateSongInfo(playlist.current, function (err) {
                    if(err) bot.error(err);
                    _sendQueue(message);
                });
            }
            function _sendQueue(message) {
                var response = playlist.current.display;

                var count = 0;
                var overflow = 0;

                var waiting = 0;

                var responseArr = [];

                for (var i = playlist.pos + 1; i < playlist.length; i++) {
                    count++;
                    if (count > 9) {
                        overflow = playlist.length - i - 1;
                        if (overflow > 1)
                            break;
                        overflow = 0;
                    }
                    var song = playlist[i];
                    waiting++;
                    initiateSongInfo(song, function (err, returnedSong) {
                        if(err) bot.error(err);
                        waiting--;
                        responseArr.push("[" + returnedSong.info.title + "](" + returnedSong.info.url + ") added by " + returnedSong.adder.displayName);
                    });
                }
                var interval = setInterval(function () {
                    if (waiting === 0) {
                        if (overflow > 0) {
                            responseArr.push(" . . . and " + overflow + " more.");
                        }
                        if (responseArr.length) {
                            var queueField = response.embed.fields.map((field) => field.name === "Queue" ? field : null).filter(Boolean);
                            if (queueField.length) {
                                queueField[0].value = responseArr.join("\n");
                            } else {
                                response.embed.addField("Queue", responseArr.join("\n"));
                            }
                        }
                        message.channel.send(response).then(m => m.delete(DELETE_TIME * 3));
                        clearInterval(interval);
                        return;
                    }
                }, 300);
            }
        }
    },
    showcurrent: {
        commands: [
            "!dj np",
            "!dj current",
            "!dj playing",
            "!np",
            "!current"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            message.delete(DELETE_TIME);
            var playlist = message.guild.playlist;
            var vc = bot.voiceConnections.get(message.guild.id);
            if (!vc.dispatcher) return bot.error("[DJ-showcurrent] Error: No dispatcher.");
            if (playlist.current.display) {
                playlist.current.info.currentTime = vc.dispatcher.time / 1000;
                setSongDisplayDescription(playlist.current);

                var display = playlist.current.display;

                //Remove Queue if its in there
                var queueField = display.embed.fields.map((field) => field.name === "Queue" ? field : null).filter(Boolean);
                if (queueField.length) {
                    var index = display.embed.fields.indexOf(queueField[0]);
                    display.embed.fields.splice(index, 1);
                }

                message.channel.send(display).then(m => m.delete(DELETE_TIME * 3));
            } else {
                initiateSongInfo(playlist.current, function (err) {
                    message.channel.send(playlist.current.display).then(m => m.delete(DELETE_TIME * 3));
                    if(err) bot.error(err);
                });
            }
        }
    },
    shufflesongs: {
        commands: [
            "!dj shuffle",
            "!shuffle"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            message.guild.playlist.shuffle();
            message.channel.send("Shuffled all songs.").then(m => m.delete(DELETE_TIME));
            message.delete(DELETE_TIME);
        }
    },
    volumechange: {
        commands: [
            "!dj volume",
            "!dj vol",
            "!dj v",
            "!volume",
            "!vol"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            if (!isNaN(command.arguments[0])) {
                setVolume(message.guild.id, command.arguments[0]);
                message.channel.send("Set volume to " + command.arguments[0]).then(m => m.delete(DELETE_TIME));
            } else {
                message.channel.send("Volume is currently " + volumes[message.guild.id]*100).then(m => m.delete(DELETE_TIME));
            }
            message.delete(DELETE_TIME);
        }
    },
    clearqueue: {
        commands: [
            "!dj clear",
            "!clear"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice],
        exec: function (command, message) {
            message.guild.playlist.destroy();
            message.channel.send("Cleared all songs.").then(m => m.delete(DELETE_TIME));
            message.delete(DELETE_TIME);
        }
    }
};

exports.services = services;
