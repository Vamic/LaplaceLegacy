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

const DELETE_TIME = 15000;
const DEFAULT_VOLUME = 50;
const END_REASONS = {
    PLAYLIST_EXHAUSTED: "Playlist exhausted.",
    LEAVING_CHANNEL: "Leaving voice channel.",
    SKIPPED: "The song has been skipped.",
    ERROR: "Something happened."
};

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

const services = {};
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
        seek: bot.guilds.get(id).playlist.current.seek,
        volume: volumes[id]
    };
}

function setSongInfo(song, cb) {
    song.service.getSongInfo(song.streamURL, function (err, info) {
        if (err) return bot.error(err);

        var vc = bot.voiceConnections.get(song.guild.id);
        info.currentTime = vc.dispatcher.time / 1000;
        info.addedBy = song.adder.displayName;

        song.info = info;
        
        setSongDisplay(song);
        cb();
    });
}

function setSongDisplayDescription(song) {
    var vc = bot.voiceConnections.get(song.guild.id);
    song.info.currentTime = vc.dispatcher.time / 1000;
    
    var playtime = toHHMMSS(song.info.currentTime) + "/";
    if (song.info.metadataType === "youtube" || song.info.metadataType === "soundcloud")
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
                albumtext += " ft. " + tags.albumartists.join(", ");
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
    if (tags.genre && tags.genre.length) {
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
    setSongDisplayDescription(song);
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
            message.guild.playlist.stop();
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
            if (command.command === "!dj queue" && command.arguments.length === 0) return exports.commands.showqueue.exec(command, message);

            var input = command.arguments.join(" ");
            var serviceType = "youtube";
            var foundService = services["youtube"];
            console.log(services);
            for (var type in services) {
                if (services[type].regex.test(input)) {
                    if (services[type]) {
                        foundService = services[type];
                        serviceType = type;
                        break;
                    }
                }
            }

            var playlist = message.guild.playlist;
            playlist.add(command.arguments.join(" "), [foundService]).then(function (songs) {
                if (!songs) return;
                for (var i in songs) {
                    var song = songs[i];
                    playlist[playlist.indexOf(song)].adder = message.member;
                    playlist[playlist.indexOf(song)].guild = message.guild;
                    playlist[playlist.indexOf(song)].seek = 0;
                    playlist[playlist.indexOf(song)].serviceType = serviceType;
                }
                if(songs.length === 1)
                    message.channel.send(message.member.displayName + " added song: " + songs[0].title + "\n<" + songs[0].streamURL + ">").then(m => m.delete(DELETE_TIME));
                else
                    message.channel.send(message.member.displayName + " added " + songs.length + " songs").then(m => m.delete(DELETE_TIME));
                message.delete(DELETE_TIME);
                if (!playlist.playing)
                    playlist.start(message.member.voiceChannel, getStreamOptions(message.guild.id));
            });
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
            var wasPlaying = message.guild.playlist.playing;
            if (!message.guild.playlist.hasNext()) {
                return message.guild.playlist.destroy();
            }
            message.guild.playlist.stop();
            message.guild.playlist.next();
            if (wasPlaying)
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
            var response = "Current: " + playlist.current.title + " **added by " + playlist.current.adder.displayName + "**";
            var count = 0;
            var overflow = 0;

            for (var i = playlist.pos + 1; i < playlist.length; i++) {
                count++;
                if (count > 19) {
                    overflow = playlist.length - i - 1;
                    if (overflow > 1)
                        break;
                    overflow = 0;
                }
                var song = playlist[i];
                response += "\n`" + song.title + "` **added by " + song.adder.displayName + "**";
            }
            if (overflow > 0) {
                response += "\n . . . and " + overflow + " more.";
            }
            message.channel.send(response).then(m => m.delete(DELETE_TIME*2));
            message.delete(DELETE_TIME);
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

                message.channel.send(playlist.current.display).then(m => m.delete(DELETE_TIME * 3));
            } else {
                setSongInfo(playlist.current, function () {
                    message.channel.send(playlist.current.display).then(m => m.delete(DELETE_TIME * 3));
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
