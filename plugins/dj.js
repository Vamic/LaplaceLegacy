const bot = module.parent.exports;

const proc = require("child_process");
const cassette = require("cassette");
const djsmusic = require("discord.js-music");
const ytdl = require('ytdl-core'); //For youtube service

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
        bot.error(err);
    });
    file.on('finish', function () {
        file.close(cb);
    });
    request(url).pipe(file);
};

var downloadYTDL = function (callback) {
    downloadFileTo(youtubeDlUrl, ytdlBinary, callback);
};

if(!fs.existsSync(ytdlBinary)) {
    bot.log("No youtube-dl found on startup. Downloading...");
    downloadYTDL(function () {
        bot.log("Youtube-dl downloaded");
    });
}

//Because there's not really a way to check if direct files are live or not
const hardcodedLivestreams = [
    "listen.moe/stream",
    "r-a-d.io/main.mp3",
    "twitch.tv"
]

// Services

const keys = bot.secrets.keys;
const services = module.exports.services || {};

//Register services in the order you want them checked, ergo dService last because it has a catchall regex

if(keys) {
    if(keys.google) {
        const ytService = new cassette.YouTubeService(keys.google);
        ytService.setSongDisplay = setSongDisplay;
        services[ytService.type] = ytService;
    } else {
        bot.log("No Google API key, will use DirectService for Youtube videos", "dj");
    }
    if(keys.soundcloud) {
        const scService = new cassette.SoundcloudService(keys.soundcloud);
        scService.setSongDisplay = setSongDisplay;
        services[scService.type] = scService;
    } else {
        bot.log("No Soundcloud API key, will use DirectService for Soundcloud songs", "dj");
    }
} else {
    bot.log("No API keys, will use DirectService for all songs", "dj");
}
if(!keys || !keys.google) bot.log("No Google API key, playing songs without links is disabled", "dj");

const dService = new cassette.DirectService(ytdlBinary);
dService.setSongDisplay = setSongDisplay;
services[dService.type] = dService;

var volumes = {
    //<GUILD_ID> : <0-1>
};
bot.util.load("dj-volumes").then(v => volumes = v || volumes).catch(bot.error);
var lastChannel = {
    //<GUILD_ID> : <VOICE_CHANNEL_ID>
};
var listening = {
    //<GUILD_ID> : <BOOLEAN>
};

const DELETE_TIME = 15000;
const DEFAULT_VOLUME = 50;

var storedPlaylists = { playing: [] };
async function saveCurrentPlaylist(id) {
    var playlist = bot.guilds.get(id).playlist;
    var tempSeek = playlist.current.seek;
    playlist.current.seek = Math.floor(getSongTime(playlist.current));
    if(!storedPlaylists[id]) storedPlaylists[id] = {};
    storedPlaylists[id].songs = playlist.map((song) => (
        {
            URL: song.URL,
            seek: song.live ? 0 : song.seek,
            adder: song.adder,
            type: song.type
        }
    ));
    playlist.current.seek = tempSeek;
    storedPlaylists[id].channel = lastChannel[id];
    if(playlist.playing && storedPlaylists.playing.indexOf(id) === -1)
        storedPlaylists.playing.push(id);
    else if(!playlist.playing && storedPlaylists.playing.indexOf(id) > -1)
        storedPlaylists.playing.splice(storedPlaylists.playing.indexOf(id));

    fs.writeFileSync("./tmp/dj/queues.json", JSON.stringify(storedPlaylists));
}

async function clearPlaylistSave(id) {
    var playlist = bot.guilds.get(id).playlist;
    delete storedPlaylists[id];

    if(storedPlaylists.playing.indexOf(id) > -1)
        storedPlaylists.playing.splice(storedPlaylists.playing.indexOf(id));

    fs.writeFileSync("./tmp/dj/queues.json", JSON.stringify(storedPlaylists));
}

function loadLastPlaylists() {
    return new Promise((resolve, reject) => {
        fs.readFile("./tmp/dj/queues.json", function (err, data) {
            try {
                if(err) reject(err);
                else resolve(storedPlaylists = JSON.parse(data));
            } catch(e) {
                resolve(storedPlaylists = { playing: [] });
            }
        })
    });
}

function setVolume(id, volume) {
    if(!volume) volume = DEFAULT_VOLUME;
    if(volume > 0) volume = volume / 100;
    volumes[id] = volume;
    bot.log("Set volume to " + volume + " in guild:" + id);
    bot.util.save("dj-volumes", volumes);

    //Change vol if currently playing music
    var vc = bot.voiceConnections.get(id);
    if(!vc || !vc.dispatcher) return;
    vc.dispatcher.setVolume(volume);
}

function getStreamOptions(id) {
    if(!volumes[id])
        setVolume(id, DEFAULT_VOLUME);
    return {
        seek: Math.min(300, bot.guilds.get(id).playlist.current ? bot.guilds.get(id).playlist.current.seek : 0),
        volume: volumes[id]
    };
}

function initiateSongInfo(song, requiresFull = true) {
    return new Promise(async (resolve) => {
        if(song.display && song.display.embed && (!requiresFull || requiresFull && song.info.full)) {
            setSongDisplayDescription(song);
            resolve(song);
        }
        else {
            try {
                if(!song["info.title"] || (!song.info.full && requiresFull)) {
                    song.info = await song.service.getSongInfo(song.URL);
                }
                services[song.type].setSongDisplay(song);
            } catch(err) {
                if(err.message.indexOf("not id3v2") == -1) bot.error(err);
                song.info = {};
                song.info.url = song.URL;
                song.info.title = song.streamURL;
                song.display = { embed: new bot.RichEmbed().setAuthor(song.live ? "Livestream" : "Unknown").setTitle(song.streamURL) };
            }

            song.info.addedBy = song.adder;

            var vc = bot.voiceConnections.get(song.guild.id);
            if(vc && vc.dispatcher)
                song.info.currentTime = vc.dispatcher.time / 1000;
            else
                song.info.currentTime = 0;

            setSongDisplayDescription(song);
            resolve(song);
        }
    });
}

function getSongTime(song) {
    if(!song.guild) return song.seek || 0;
    var vc = bot.voiceConnections.get(song.guild.id);
    if(vc && vc.dispatcher)
        return song.seek + vc.dispatcher.time / 1000;
    else
        return song.seek;
}

function setSongDisplayDescription(song) {
    song.info.currentTime = getSongTime(song);
    var playtime = toHHMMSS(song.info.currentTime);
    if(song.info.duration > 0)
        playtime += "/" + toHHMMSS(song.info.duration);
    //let timestamp = song.getTimestamp(song.info.currentTime); <-TODO
    song.display.embed.setDescription(playtime + " added by " + song.info.addedBy + "\n" + song.info.url);
}

function setSongDisplay(song) {
    var tags = song.info;
    var embed = new bot.RichEmbed();
    song.display = {};

    if(tags.metadataType === "youtube") {
        embed.setColor([150, 50, 50]);
        tags.icon = "https://cdn1.iconfinder.com/data/icons/logotypes/32/youtube-256.png"
    }
    if(tags.metadataType === "soundcloud") {
        embed.setColor([150, 80, 0]);
        tags.icon = "https://cdn2.iconfinder.com/data/icons/social-icon-3/512/social_style_3_soundCloud-128.png"
    }
    if(tags.metadataType === "ID3") {
        embed.setColor([75, 75, 75]);
    }

    if(tags.metadataType === "youtube" || tags.metadataType === "soundcloud") {
        embed.setAuthor(tags.metadataType[0].toUpperCase() + tags.metadataType.substr(1) + (song.live ? " [LIVE]" : ""), tags.icon);
        embed.setTitle(tags.title || tags.url);
    } else if(tags.metadataType === "ID3") {
        embed.setAuthor("Direct");
        var title = tags.title || tags.url.split("/").slice(-1)[0];
        embed.setTitle(title);
        if(tags.artist && tags.artist.length) {
            var artisttext = tags.artist.shift();
            if(tags.artist.length)
                artisttext += "ft. " + tags.artist.join(" and ");
            embed.addField("Artist", artisttext, true);
        }
        if(tags.album) {
            var albumtext = tags.album;
            if(tags.albumartist && tags.albumartist.length)
                albumtext += " ft. " + tags.albumartist.join(", ");
            if(tags.year)
                albumtext += " (" + tags.year + ")";
            embed.addField("Album", albumtext, true);
            if(tags.track && tags.track.no) {
                var tracktext = tags.track.no + "/" + tags.track.of;
                if(tags.disk && tags.disk.no) {
                    var disktext = tags.disk.no + "/" + tags.disk.of;
                    tracktext += " on Disk " + disktext;
                }
                embed.addField("Track", tracktext, true);
            }
        }
    }
    if(tags.genre && tags.genre.filter(Boolean).length) {
        embed.addField("Genre", tags.genre.join(", "), true);
    }
    if(tags.imgURL) {
        embed.setThumbnail(tags.imgURL);
    } else if(tags.img && tags.imgFormat) {
        var thumbnailName = "thumb." + tags.imgFormat;
        embed.setThumbnail("attachment://" + thumbnailName);
        song.display.files = [new bot.Attachment(tags.img, thumbnailName)];
    }
    song.display.embed = embed;
}

function toDoubleDigit(input) {
    if(input < 10) { return "0" + input; } else return input;
}

function toHHMMSS(input) {
    var sec_num = parseInt(input, 10);
    var minutes = Math.floor(sec_num / 60);
    var seconds = sec_num - minutes * 60;

    return toDoubleDigit(minutes) + ':' + toDoubleDigit(seconds);
}

function isValidURL(str) {
    const pattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
    return pattern.test(str);
}

function startPlaying(id, playlist, channel) {
    if(!listening[id]) {
        listening[id] = true;
        listenToPlaylistEvents(playlist);
    }
    lastChannel[id] = channel.id;
    return playlist.start(channel, getStreamOptions(id));
}

function listenToPlaylistEvents(playlist) {
    playlist.events.on("playing", function () {
        bot.user.setPresence({ game: { name: (playlist.playing ? "► " : "❚❚ ") + playlist.current.title }, status: 'online' });
        if(!playlist.interval) {
            playlist.interval = setInterval(function () {
                if(!playlist.playing) {
                    clearInterval(playlist.interval);
                    playlist.interval = null;
                }
                saveCurrentPlaylist(playlist.guild.id).catch(bot.error);
            }, 5000);
        }
    });
    playlist.events.on("ended", function (reason) {
        bot.user.setPresence({ game: {}, status: 'online' });
        clearInterval(playlist.interval);
        playlist.interval = null;
        clearPlaylistSave(playlist.guild.id).catch(bot.error);
    });
    playlist.events.on("error", function (err) {
        bot.user.setPresence({ game: {}, status: 'online' });
        clearInterval(playlist.interval);
        playlist.interval = null;
        bot.error("Playlist error");
        bot.error(err);
    });
    playlist.events.on("streamError", function (err) {
        bot.user.setPresence({ game: {}, status: 'online' });
        clearInterval(playlist.interval);
        playlist.interval = null;
        bot.error("Playlist streamError");
        bot.error(err);
    });
}

async function queueSongs(id, input, service) {
    return bot.guilds.get(id).playlist.add(input, [services[service]]);
}

async function reQueue(id, data) {
    let queue = data.songs;
    let channel = data.channel;
    let guild = bot.guilds.get(id);

    guild.playlist.destroy();

    let promises = queue.map(async (song) => {
        let songs = await queueSongs(id, song.URL, song.type).catch(bot.error);
        if(songs.length) {
            songs[0].seek = song.seek;
            songs[0].adder = song.adder;
            songs[0].guild = guild;
            if(songs[0].type == "direct") {
                songs[0].live = Boolean(hardcodedLivestreams.find(u => songs[0].streamURL.indexOf(u) > -1));
            }
        } else {
            bot.error("Couldn't requeue " + song.URL);
        }
    });

    await Promise.all(promises);

    var voiceChannel = guild.channels.get(channel);
    startPlaying(id, guild.playlist, voiceChannel);
    clearPlaylistSave(id).catch(bot.error);
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
        exec: async function (command, message) {
            message.delete(DELETE_TIME);
            try {
                await message.member.voiceChannel.join();
                message.channel.send("Here I am.").then(m => m.delete(DELETE_TIME));
                if(message.guild.playlist.current) {
                    message.guild.playlist.start(message.member.voiceChannel);
                    lastChannel[message.guild.id] = message.member.voiceChannel.id;
                }
            }
            catch (err) {
                bot.error(err);
                message.channel.send("Can't do that.").then(m => m.delete(DELETE_TIME));
            }
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
        exec: async function (command, message) {
            message.delete(DELETE_TIME);
            if((command.command === "!dj queue" || command.command === "!dj queue") && command.arguments.length === 0) return exports.commands.showqueue.exec(command, message);

            var foundServices = {};

            var search = "";

            command.arguments = command.arguments.map(a => a.replace(/\r?\n|\r/g, ""));

            for(const arg of command.arguments) {
                if(isValidURL(arg)) {
                    var found = false;
                    for(const type in services) {
                        if(services[type].regex.test(arg)) {
                            if(services[type]) {
                                if(!foundServices[type])
                                    foundServices[type] = "";
                                foundServices[type] += arg + " ";
                                found = true;
                                break;
                            }
                        }
                    }
                    if(!found) {
                        if(!foundServices["direct"])
                            foundServices["direct"] = "";
                        foundServices["direct"] += arg + " ";
                    }
                } else {
                    search += arg + " ";
                }
            }

            if(isValidURL(search)) {
                found = false;
                for(type in services) {
                    if(services[type].regex.test(search)) {
                        if(services[type]) {
                            if(!foundServices[type])
                                foundServices[type] = "";
                            foundServices[type] += search + " ";
                            found = true;
                            break;
                        }
                    }
                }
                if(!found) {
                    if(!foundServices["direct"])
                        foundServices["direct"] = "";
                    foundServices["direct"] += search;
                }
            } else if (services["youtube"]) {
                if(!foundServices["youtube"])
                    foundServices["youtube"] = "";
                foundServices["youtube"] += search;
            }

            var playlist = message.guild.playlist;
            var totalSongs = [];

            let success = true;
            for(type in foundServices) {
                let songs = await queueSongs(message.guild.id, foundServices[type], type)
                totalSongs = totalSongs.concat(songs);

                if(!songs.length) return;

                for(var i in songs) {
                    var song = songs[i];
                    playlist[playlist.indexOf(song)].adder = message.member.displayName;
                    playlist[playlist.indexOf(song)].guild = message.guild;
                    song.streamURL = encodeURI(song.streamURL);
                    if(type == "direct") {
                        song.live = Boolean(hardcodedLivestreams.find(u => song.streamURL.indexOf(u) > -1));
                    }
                }
                
                if(!playlist.playing) {
                    await startPlaying(message.guild.id, playlist, message.member.voiceChannel).catch(err => success = false);
                }
            }
            if(!success) {
                message.channel.send("Couldn't start playing music.").then(m => m.delete(DELETE_TIME));
            }
            else if(totalSongs.length === 1)
                message.channel.send(message.member.displayName + " added song: " + totalSongs[0].title + "\n<" + totalSongs[0].streamURL + ">").then(m => m.delete(DELETE_TIME));
            else
                message.channel.send(message.member.displayName + " added " + totalSongs.length + " songs").then(m => m.delete(DELETE_TIME));
        }
    },
    skipcurrent: {
        commands: [
            "!dj skip",
            "!dj s",
            "!skip"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice, bot.requirements.userInVoice],
        exec: function (command, message) {
            message.channel.send("Skipped.").then(m => m.delete(DELETE_TIME));
            //Destroy if it doesn't have a next song
            if(!message.guild.playlist.hasNext()) message.guild.playlist.destroy();
            else {
                message.guild.playlist.next();
                if(message.guild.playlist.current) {
                    message.guild.playlist.start(message.member.voiceChannel, getStreamOptions(message.guild.id));
                    lastChannel[message.guild.id] = message.member.voiceChannel.id;
                }
            }

            message.delete(DELETE_TIME);
        }
    },
    pausemusic: {
        commands: [
            "!dj pause",
            "!dj p",
            "!pause"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice, bot.requirements.userInVoice],
        exec: function (command, message) {
            message.channel.send("Paused.").then(m => m.delete(DELETE_TIME));
            message.guild.playlist.pause();
            bot.user.setPresence({ game: { name: (playlist.playing ? "► " : "❚❚ ") + playlist.current.title }, status: 'online' });
            message.delete(DELETE_TIME);
        }
    },
    resumemusic: {
        commands: [
            "!dj resume",
            "!dj r",
            "!resume"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice, bot.requirements.userInVoice],
        exec: async function (command, message) {
            let playlist = message.guild.playlist;
            if(!playlist.current) {
                if(message.guild.playlist.hasNext()) {
                    message.guild.playlist.next();
                }
                else {
                    return message.reply("No songs in queue.");
                }
            }
            playlist.resume();
            if(!playlist.playing) {
                await playlist.start(message.member.voiceChannel, getStreamOptions(message.guild.id));
                lastChannel[message.guild.id] = message.member.voiceChannel.id;
            }
            bot.user.setPresence({ game: { name: (playlist.playing ? "► " : "❚❚ ") + playlist.current.title }, status: 'online' });
            message.channel.send("Resumed.").then(m => m.delete(DELETE_TIME));
            message.delete(DELETE_TIME);
        }
    },
    showqueue: {
        commands: [
            "!dj list",
            "!queue"
        ],
        requirements: [bot.requirements.guild],
        exec: async function (command, message) {
            var playlist = message.guild.playlist;
            if(!playlist.length) {
                return message.channel.send("No songs in queue.");
            }
            var vc = bot.voiceConnections.get(message.guild.id);
            if(!vc.dispatcher) return bot.error("[DJ-showqueue] Error: No Dispatcher.");

            message.delete(DELETE_TIME);

            var overflow = 0;
            var responseArr = [];

            let nextSongs = playlist.slice(playlist.pos + 1);
            if(nextSongs.length > 10) {
                const temp = nextSongs.splice(0, 9);
                overflow = nextSongs.length;
                nextSongs = temp;
            }

            let songs = await Promise.all(nextSongs.map(song => initiateSongInfo(song, false)));
            for(let song of songs) {
                responseArr.push("[" + song.info.title + "](" + song.info.url + ") added by " + song.adder);
            }

            if(overflow > 0) {
                responseArr.push(" . . . and " + overflow + " more.");
            }

            var embed = new bot.RichEmbed();
            embed.setTitle("Coming up soon . . .");
            responseArr.length > 0 ? embed.setDescription(responseArr.join("\n"))
                                   : embed.setDescription("The sound of silence . . .");

            message.channel.send(embed);
            return;
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
        exec: async function (command, message) {
            message.delete(DELETE_TIME);
            var playlist = message.guild.playlist;
            var vc = bot.voiceConnections.get(message.guild.id);
            if(!vc.dispatcher) return bot.error("[DJ-showcurrent] Error: No dispatcher.");

            await initiateSongInfo(playlist.current, true);
            
            message.channel.send(playlist.current.display);
        }
    },
    shufflesongs: {
        commands: [
            "!dj shuffle",
            "!shuffle"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice, bot.requirements.userInVoice],
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
        requirements: [bot.requirements.guild, bot.requirements.userInVoice],
        exec: function (command, message) {
            if(!isNaN(command.arguments[0])) {
                setVolume(message.guild.id, command.arguments[0]);
                message.channel.send("Set volume to " + command.arguments[0]);
            } else {
                message.channel.send("Volume is currently " + volumes[message.guild.id] * 100);
            }
            message.delete(DELETE_TIME);
        }
    },
    clearqueue: {
        commands: [
            "!dj clear",
            "!clear"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice, bot.requirements.userInVoice],
        exec: function (command, message) {
            message.guild.playlist.destroy();
            message.channel.send("Cleared all songs.").then(m => m.delete(DELETE_TIME));
            message.delete(DELETE_TIME);
        }
    }
};

exports.hooks = {
    "ready": async function () {
        await loadLastPlaylists();
        if(storedPlaylists.playing && storedPlaylists.playing.length) {
            for(var i in storedPlaylists.playing) {
                var id = storedPlaylists.playing[i];
                var queue = storedPlaylists[id];
                reQueue(id, queue);
            }
        }
    }
};

exports.services = services;
