"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const Song = require("cassette").Song;
const fs = require("fs");
const spawn = require("child_process").spawn;
class DirectSong extends Song {
    constructor(service, info, ytdlBinary) {
        super(service);
        this.type = 'direct';
        this.title = info.filename;
        this.trackID = info.id;
        this.streamURL = info.url;
        this.ytdlBinary = ytdlBinary
    }
    stream() {
        const ytdl = spawn(this.ytdlBinary, ["--no-playlist", "-f", "bestaudio/best/worst", "-o", "-", this.streamURL], { maxBuffer: Infinity });
        return ytdl.stdout;
    }
    next() {
        return __awaiter(this, void 0, void 0, function* () {
            return null;
        });
    }
}
exports.default = DirectSong;
