"use strict";
var __awaiter = this && this.__awaiter || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const DirectSong = require("./Song");
class DirectService {
    constructor(ytdlBinary) {
        if (!ytdlBinary) throw "No ytdlbinary provided.";
        this.search = false;
        this.regex = /https ?:\/\/.*\.(?:mp3|wav|webm|mp4|flac|ogg).*/i;
        this.ytdlBinary = ytdlBinary;
        this.type = "direct";
    }
    fetch(fetchable, searchType) {
        return __awaiter(this, void 0, void 0, function* () {
            const fetched = [];
            for (const song of fetchable.songs) {
                if (this.regex.test(song)) {
                    const info = {
                        filename: song.split("/").slice(-1)[0],
                        id: fetchable.songs.indexOf(song),
                        url: song
                    };
                    fetched.push(new DirectSong.default(this, info, this.ytdlBinary));
                } else if (song.indexOf("http") > -1) {
                    const info = {
                        filename: song,
                        id: fetchable.songs.indexOf(song),
                        url: song
                    };
                    fetched.push(new DirectSong.default(this, info, this.ytdlBinary));
                }
            }
            return fetched;
        });
    }
    fetchable(content) {
        const words = content.split(' ');
        const fetchable = {
            playlists: [],
            queries: [],
            songs: []
        };
        for (const elem of words) {
            fetchable.songs.push(elem);
        }
        
        return fetchable;
    }

    getSeekTo(inputUrl) {
        var lookFor = ["&t=", "#t=", "?t=", "#"];
        for (var i in lookFor) {
            var key = lookFor[i];
            var start = inputUrl.indexOf(key);
            if (start === -1) continue;
            start += key.length;
            var time = "";
            var char = "";
            for (var j = start; j < inputUrl.length; j++) {
                char = inputUrl[j];
                if (isNaN(char))
                    break;
                time += char;
            }
            return time;
        }
        return 0;
    }
    
    getSongInfo(requestURL, cb) {
        var https = require("https");
        var { URL } = require("url");
        var parsedUrl = new URL(requestURL);
        var options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname,
            headers: { "Range": "bytes=0-9" }
        };
        var id3size = 0;
        var request = https.get(options, function (response) {
            var data = '';
            response.on('data', function (chunk) {
                data += chunk;
            }); response.on('end', function () {
                var array = [];
                for (var i = 0; i < data.length; i++) {
                    array.push(data.charCodeAt(i));
                }
                if (array.length !== 10 || !data.startsWith("ID3"))
                    return cb("not id3v2: " + data.substr(0, 10));
                var offset = 6;
                var size1 = array[offset];
                var size2 = array[offset + 1];
                var size3 = array[offset + 2];
                var size4 = array[offset + 3];
                // 0x7f = 0b01111111
                var size = size4 & 0x7f
                    | (size3 & 0x7f) << 7
                    | (size2 & 0x7f) << 14
                    | (size1 & 0x7f) << 21;

                id3size = size + 10;
                
                options.headers.Range = "bytes=0-" + id3size;
                var realrequest = https.get(options, function (response) {
                    require("musicmetadata")(response, function (err, data) {
                        cb(null, {
                            metadataType: "ID3",
                            img: data.picture.length ? data.picture[0].data : null,
                            imgFormat: data.picture.length ? data.picture[0].format : null,
                            artist: data.artist,
                            albumartist: data.albumartist,
                            title: data.title,
                            duration: 0,
                            url: requestURL,
                            genre: data.genre,
                            year: data.year,
                            album: data.album,
                            disk: data.disk,
                            track: data.track
                        });
                    }).on("error", function (err) {
                        cb(err);
                    });
                });
                realrequest.on("error", function (err) {
                    cb(err);
                });
            });
        });
        request.on("error", function (err) {
            cb(err);
        });
    }
}
exports.default = DirectService;
