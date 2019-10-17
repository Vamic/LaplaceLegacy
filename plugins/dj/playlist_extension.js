const EventEmitter = require('events');
const Playlist = require("vdj").Playlist;
class DiscordPlaylist extends Playlist {
    ensureVoiceConnection(channel) {
      if (channel.connection) return Promise.resolve(channel.connection);
  
      if (!channel) throw new Error("No channel provided");
      if (!channel.joinable) throw new Error("Missing permissions to join channel.");
      if (!channel.speakable) throw new Error("Missing permissions to speak in channel.");
      return channel.join();
    }
  
    constructor(guild, options) {
      super(options);
      this.guild = guild;
      this.events = new EventEmitter();
      this.playing = false;
    }
  
    get _dispatcher() {
      return this.guild.voiceConnection ? this.guild.voiceConnection.dispatcher : null;
    }
  
    stop() {
      return this._end('temp');
    }
  
    destroy() {
      return this._end('terminal');
    }
  
    pause() {
      if (this._dispatcher) this._dispatcher.pause();
      this.events.emit('pause');
    }
  
    resume() {
      if (this._dispatcher) this._dispatcher.resume();
      this.events.emit('resume');
    }
  
    async start(channel, options) {
      await this.ensureVoiceConnection(channel);
      await this._start(options);
    }
  
    async _start(options) {
      this.stop();
  
      if (!this.current) {
        this.events.emit('error', new Error("No current song."));
        return;
      }
  
      const stream = await this.current.stream();
      stream.once('error', (e) => {
        this.playing = false;
        this.events.emit('streamError', e);
        this._end();
      });
  
      if (!this.guild.voiceConnection) {
        this.events.emit('error', new Error("No voice connection."));
        return;
      }
  
      const dispatcher = this.guild.voiceConnection.playStream(stream, options);
      this.playing = true;
      this.events.emit('playing');
  
      dispatcher.once('end', async (reason) => {
        this.playing = false;
        this.events.emit('ended', reason);
  
        if (reason === 'temp') return;
        if (reason === 'terminal') return this._destroy();
  
        const next = await this.next();
        if (!next) return this._destroy();
  
        await this._start(options);
      });
    }
  
    _end(reason = 'terminal') {
      if (this._dispatcher) this._dispatcher.end(reason);
    }
  
    _destroy() {
      if (this.guild.voiceConnection) this.guild.voiceConnection.disconnect();
      this.events.emit('destroyed');
    }
}
exports.default = DiscordPlaylist;