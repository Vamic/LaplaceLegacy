const bot = module.parent.exports;

const DiscordPlaylist = require("./dj/playlist_extension").default;
const vdj = require("vdj");
const request = require("request");
const fs = require('fs');

const os = require('os');
const path = require("path");

const binName = os.platform().indexOf("win") === 0 ? "youtube-dl.exe" : "youtube-dl";
const ytdlPath = path.normalize(path.join(__dirname, "..", "binaries"));
const ytdlBinary = ytdlPath + "/" + binName;

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

if(!fs.existsSync(ytdlPath)) fs.mkdirSync(ytdlPath);
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

// Playlists

const keys = bot.secrets.keys;
bot.persistent.playlists = bot.persistent.playlists || {};
const playlists = bot.persistent.playlists;
const services = module.exports.services || {};

if(keys) {
    if(keys.google) {
        const ytService = new vdj.YouTubeService(keys.google);
        ytService.setSongDisplay = setSongDisplay;
        services[ytService.type] = ytService;
    } else {
        bot.log("No Google API key, will use DirectService for Youtube videos", "dj");
    }/*
    if(keys.soundcloud) {
        const scService = new cassette.SoundcloudService(keys.soundcloud);
        scService.setSongDisplay = setSongDisplay;
        services[scService.type] = scService;
    } else {
        bot.log("No Soundcloud API key, will use DirectService for Soundcloud songs", "dj");
    }*/
} else {
    bot.log("No API keys, will use DirectService for all songs", "dj");
}

function getPlaylist(guild) {
    if(!playlists[guild.id]) playlists[guild.id] = new DiscordPlaylist(bot.client.voice, guild.id, {
        services: Object.values(services),
        loop: false,
        autoplay: false,
        logger: console.log
    });
    return playlists[guild.id];
}

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
const DEFAULT_VOLUME = 10;
const MAX_VOLUME = 20;

var storedPlaylists = { playing: [] };
async function saveCurrentPlaylist(id) {
    var playlist = getPlaylist(bot.guilds.get(id));
    var tempSeek = playlist.current && playlist.current.seek || 0;
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

    return bot.util.save("dj-queues", storedPlaylists);
}

async function clearPlaylistSave(id) {
    delete storedPlaylists[id];

    if(storedPlaylists.playing.indexOf(id) > -1)
        storedPlaylists.playing.splice(storedPlaylists.playing.indexOf(id));

    return bot.util.save("dj-queues", storedPlaylists);
}

function loadLastPlaylists() {
    return bot.util.load("dj-queues").then(q => storedPlaylists = q || { playing: [] }).catch(bot.error);
}

function setVolume(id, volume) {
    if(!volume || volume < 0) volume = DEFAULT_VOLUME;
    if(volume > MAX_VOLUME) volume = MAX_VOLUME;
    if(volume > 0) volume = volume / 100;
    volumes[id] = volume;
    bot.log("Set volume to " + volume + " in guild:" + id);
    bot.util.save("dj-volumes", volumes);

    //Change vol if currently playing music
    var vc = bot.voice.connections.get(id);
    if(!vc || !vc.dispatcher) return;
    vc.dispatcher.setVolume(volume);
    return volume * 100;
}

function getStreamOptions(id) {
    if(!volumes[id])
        setVolume(id, DEFAULT_VOLUME);
    return {
        highWaterMark: 512,
        volume: volumes[id],
        bitrate: "auto"
    };
}

function initiateSongInfo(song, vc, requiresFull = true) {
    return new Promise(async (resolve) => {
        if(!song) return resolve(song);

        if(song.display && song.display.embed && (!requiresFull || requiresFull && song.info.full)) {
            setSongDisplayDescription(song, vc);
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
                song.display = { embed: new bot.MessageEmbed().setAuthor(song.live ? "Livestream" : "Unknown").setTitle(song.streamURL) };
            }

            song.info.addedBy = song.adder;

            setSongDisplayDescription(song, vc);
            resolve(song);
        }
    });
}

function getSongTime(song, vc) {
    if(vc && vc.dispatcher)
        return song.seek + vc.dispatcher.streamTime / 1000;
    else
        return song.seek;
}

function setSongDisplayDescription(song, vc) {
    song.info.currentTime = getSongTime(song, vc);
    var playtime = toHHMMSS(song.info.currentTime);
    if(song.info.duration > 0)
        playtime += "/" + toHHMMSS(song.info.duration);
    //let timestamp = song.getTimestamp(song.info.currentTime); TODO: this
    let description = playtime + " added by " + song.info.addedBy + "\n" + song.info.url;
    if(typeof song.display.embed.setDescription == "function") {
        song.display.embed.setDescription(description);
    } else {
        song.display.embed.description = description;
    }
}

function setSongDisplay(song) {
    var tags = song.info;
    var embed = new bot.MessageEmbed();
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
        song.display.files = [new bot.MessageAttachment(tags.img, thumbnailName)];
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

async function startPlaying(playlist, channel) {
    const guildId = playlist.guildID;
    if(!listening[guildId]) {
        listening[guildId] = true;
        listenToPlaylistEvents(playlist);
    }
    lastChannel[guildId] = channel.id;
    return await playlist.start(channel, getStreamOptions(guildId));
}

function listenToPlaylistEvents(playlist) {
    playlist.events.on("playing", function () {
        bot.user.setActivity((playlist.playing ? "► " : "❚❚ ") + playlist.current.title);
        if(!playlist.interval) {
            playlist.interval = setInterval(function () {
                if(!playlist.playing) {
                    clearInterval(playlist.interval);
                    playlist.interval = null;
                }
                saveCurrentPlaylist(playlist.guildID).catch(bot.error);
            }, 5000);
        }
    });
    playlist.events.on("ended", function (reason) {
        bot.user.setActivity("");
        clearInterval(playlist.interval);
        playlist.interval = null;
        clearPlaylistSave(playlist.guildID).catch(bot.error);
    });
    playlist.events.on("error", function (err) {
        bot.user.setActivity("");
        clearInterval(playlist.interval);
        playlist.interval = null;
        bot.error("Playlist error");
        bot.error(err);
    });
    playlist.events.on("streamError", function (err) {
        bot.user.setActivity("");
        clearInterval(playlist.interval);
        playlist.interval = null;
        bot.error("Playlist streamError");
        bot.error(err);
    });
    playlist.events.on("destroyed", function () {
        bot.user.setActivity("");
        clearInterval(playlist.interval);
        playlist.interval = null;
    });
}

async function queueSongs(id, input, service) {
    try {
        return await getPlaylist(bot.guilds.get(id)).add([input], { service: services[service] });
    }
    catch(err) {
        bot.error(err);
    }
}

async function reQueue(id, data) {
    let queue = data.songs;
    let channel = data.channel;
    let guild = bot.guilds.get(id);
    let playlist = getPlaylist(guild);

    playlist.destroy();

    for (const song of queue) {
        let songs = await queueSongs(id, song.URL, song.type).catch(bot.error);
        if(songs && songs.length) {
            songs[0].seek = song.seek;
            songs[0].adder = song.adder;
            songs[0].guild = guild;
            if(songs[0].type == "direct") {
                songs[0].live = Boolean(hardcodedLivestreams.find(u => songs[0].streamURL.indexOf(u) > -1));
            }
        } else {
            bot.error("Couldn't requeue " + song.URL);
        }
    }

    var voiceChannel = guild.channels.cache.get(channel);
    startPlaying(playlist, voiceChannel).catch(bot.error);
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
            message.delete({timeout:DELETE_TIME});
            const playlist = getPlaylist(message.guild);
            try {
                await message.member.voice.channel.join();
                message.channel.send("Here I am.").then(m => m.delete({timeout:DELETE_TIME}));
                if(playlist.current) {
                    await startPlaying(playlist, message.member.voice.channel).catch(err => {bot.error(err); success = false;});
                    lastChannel[message.guild.id] = message.member.voice.channel.id;
                }
            }
            catch (err) {
                bot.error(err);
                message.channel.send("Can't do that.").then(m => m.delete({timeout:DELETE_TIME}));
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
            getPlaylist(message.guild).pause();
            bot.voice.connections.get(message.guild.id).channel.leave();
            message.delete({timeout:DELETE_TIME});
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
            message.delete({timeout:DELETE_TIME});
            if((command.command === "!dj queue" || command.command === "!dj q") && command.arguments.length === 0) return exports.commands.showqueue.exec(command, message);

            var lines = command.arguments.join(" ").split(/\r?\n|\r/);
            var urls = [];
            var searches = [];
            for(var line of lines) {
                var searchWords = [];
                var args = line.split(" ");
                for(var arg of args) {
                    if(/https?:\/\/|\w+\.\w+\.\w+/g.test(arg)) {
                        urls.push(arg);
                    } else {
                        searchWords.push(arg);
                    }
                }
                if(searchWords.length) searches.push(searchWords.join(" "));
            }

            var playlist = getPlaylist(message.guild);

            let success = true;

            var fetchResult = await playlist.add(urls);
            var searchResult = await playlist.add(searches,  {
                playlistAddType: 'searches'
            });

            var added = fetchResult.added.concat(searchResult.added);
            for(var song of added) {
                song.adder = message.member.displayName;
            }
            
            if(added.length) {
                if(!playlist.playing) {
                    await startPlaying(playlist, message.member.voice.channel).catch(err => {bot.error(err); success = false;});
                }
                if(!success) {
                    message.channel.send("Couldn't start playing music.").then(m => m.delete({timeout:DELETE_TIME}));
                }
            }
            if(added.length === 1)
                message.channel.send(message.member.displayName + " added song: " + added[0].title + "\n<" + added[0].info.url + ">").then(m => m.delete({timeout:DELETE_TIME}));
            else {
                message.channel.send(message.member.displayName + " added " + added.length + " songs").then(m => m.delete({timeout:DELETE_TIME}));
            }
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
            message.channel.send("Skipped.").then(m => m.delete({timeout:DELETE_TIME}));
            //Destroy if it doesn't have a next song
            const playlist = getPlaylist(message.guild);
            if(!playlist.hasNext()) playlist.destroy();
            else {
                playlist.next();
                if(playlist.current) {
                    playlist.start(message.member.voice.channel, getStreamOptions(message.guild.id));
                    lastChannel[message.guild.id] = message.member.voice.channel.id;
                }
            }

            message.delete({timeout:DELETE_TIME});
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
            message.channel.send("Paused.").then(m => m.delete({timeout:DELETE_TIME}));
            let playlist = getPlaylist(message.guild);
            playlist.pause();
            bot.user.setPresence({ game: { name: (playlist.playing ? "► " : "❚❚ ") + playlist.current.title }, status: 'online' });
            message.delete({timeout:DELETE_TIME});
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
            let playlist = getPlaylist(message.guild);
            if(!playlist.current) {
                if(playlist.hasNext()) {
                    playlist.next();
                }
                else {
                    return message.reply("No songs in queue.");
                }
            }
            playlist.resume();
            if(!playlist.playing) {
                await playlist.start(message.member.voice.channel, getStreamOptions(message.guild.id));
                lastChannel[message.guild.id] = message.member.voice.channel.id;
            }
            bot.user.setPresence({ game: { name: (playlist.playing ? "► " : "❚❚ ") + playlist.current.title }, status: 'online' });
            message.channel.send("Resumed.").then(m => m.delete({timeout:DELETE_TIME}));
            message.delete({timeout:DELETE_TIME});
        }
    },
    showqueue: {
        commands: [
            "!dj list",
            "!queue"
        ],
        requirements: [bot.requirements.guild],
        exec: async function (command, message) {
            var playlist = getPlaylist(message.guild);
            if(!playlist.length) {
                return message.channel.send("No songs in queue.");
            }
            var vc = bot.voice.connections.get(message.guild.id);
            if(!vc.dispatcher) return bot.error("[DJ-showqueue] Error: No Dispatcher.");

            message.delete({timeout:DELETE_TIME});

            var overflow = 0;
            var responseArr = [];

            let nextSongs = playlist.slice(playlist.pos + 1);
            if(nextSongs.length > 10) {
                const temp = nextSongs.splice(0, 9);
                overflow = nextSongs.length;
                nextSongs = temp;
            }

            let songs = await Promise.all(nextSongs.map(song => initiateSongInfo(song, vc, false)));
            for(let song of songs) {
                responseArr.push("[" + song.info.title + "](" + song.info.url + ") added by " + song.adder);
            }

            if(overflow > 0) {
                responseArr.push(" . . . and " + overflow + " more.");
            }

            var embed = new bot.MessageEmbed();
            embed.setTitle("Coming up soon . . .");
            responseArr.length > 0 ? embed.setDescription(responseArr.join("\n"))
                                   : embed.setDescription("The sound of silence . . .");

            message.channel.send(embed).then(m => m.delete({timeout:DELETE_TIME*10}));
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
            message.delete({timeout:DELETE_TIME});
            const playlist = getPlaylist(message.guild);
            const vc = bot.voice.connections.get(message.guild.id);
            if(!vc.dispatcher) return bot.error("[DJ-showcurrent] Error: No dispatcher.");

            await initiateSongInfo(playlist.current, vc, true);
            
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
            getPlaylist(message.guild).shuffle();
            message.channel.send("Shuffled all songs.").then(m => m.delete({timeout:DELETE_TIME}));
            message.delete({timeout:DELETE_TIME});
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
                var setvolume = setVolume(message.guild.id, command.arguments[0]);
                message.channel.send("Set volume to " + setvolume);
            } else {
                message.channel.send("Volume is currently " + volumes[message.guild.id] * 100);
            }
            message.delete({timeout:DELETE_TIME});
        }
    },
    clearqueue: {
        commands: [
            "!dj clear",
            "!clear"
        ],
        requirements: [bot.requirements.guild, bot.requirements.botInVoice, bot.requirements.userInVoice],
        exec: function (command, message) {
            getPlaylist(message.guild).destroy();
            message.channel.send("Cleared all songs.").then(m => m.delete({timeout:DELETE_TIME}));
            message.delete({timeout:DELETE_TIME});
        }
    },
    updateytdl: {
        commands: ["!dj update"],
        exec: function(command, message) {
            downloadYTDL(function () {
                message.channel.send("Youtube-dl downloaded");
            });
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
