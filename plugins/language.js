var bot = module.parent.exports;

const kuroshiro = require("kuroshiro");
kuroshiro.init();

exports.commands = {
    romanizeJapanese: {
        commands: ["!rom", "!romanize", "!romaji"],
        usage: ["!rom:(hira|kana|kata):(oku) japanese"],
        exec: function (command, message) {
            if (!command.arguments.length)
            {
                return message.channel.send("`!rom:(hira|kana|kata):(oku) japanese`");
            }
            let type = "romaji";
            let mode = "spaced";
            for(const mod of command.modifiers) {
                if (/^hira(?:gana)?$/.test(mod))
                    type = "hiragana"
                if (/^kana$/.test(mod))
                    type = "kana"
                else if (/^kata(?:kana)?$/.test(mod))
                    type = "katakana"

                if(/^oku(?:rigana)?$/.test(mod))
                    mode = "okurigana"
            }
            const result = kuroshiro.toRomaji(command.arguments.join(" "), {to: type, mode});
            let responseType = type[0].toUpperCase() + type.slice(1);
            responseType += (mode != "spaced") ? " (" + mode + ")" : "";
            return message.channel.send(responseType + ": " + result);
        }
    }
};