var bot = module.parent.exports;

const kuroshiro = require("kuroshiro");
const google = bot.secrets.keys && bot.secrets.keys.google ? require('google-translate')(bot.secrets.keys.google) : null;
kuroshiro.init();

let languages;

async function translate(options) {
    if(!languages) {
        languages = await new Promise((resolve, reject) => {
            google.getSupportedLanguages((err, data) => {
                if(err) reject(err);
                return resolve(data);
            })
        }).catch(bot.error);
    }
    return new Promise((resolve, reject) => {
        let then = (err, data) => {
            if(err) reject(err);
            else resolve(data);
        }
        if(languages && languages.indexOf(options.to) == -1)
           return reject("No such language: " + options.to);
        if(!options.from) {
            google.translate(options.input, options.to, then);
        } else {
            if(languages && languages.indexOf(options.from) == -1)
                return reject("No such language: " + options.from);
            google.translate(options.input, options.from, options.to, then);
        }
    });
}

exports.commands = {
    translate: {
        commands: ["!trans", "!translate"],
        usage: ["!trans rotfrukt"],
        requirements: [() => google != null],
        exec: async function (command, message) {
            let input = command.arguments.join(" ");
            if(!input) {
                return message.channel.send("Usage: `" + this.usage + "`");
            }
            let mods = command.modifiers;
            let to = mods.shift() || "en";
            let from;
            if(mods.length > 0)
            {
                from = to;
                to = mods.shift();
            }

            let then = (err, data) => {
                if(err){
                    bot.error(err);
                    return message.channel.send("Got some error. Nice.");
                };
                if(!from) from = data.detectedSourceLanguage;
                let response = `Translated (${from}-${to}): ${data.translatedText}`;
                message.channel.send(response);
            }

            try {
                let data = await translate({input, from, to});
                if(!from) from = data.detectedSourceLanguage;
                let response = `Translated (${from}-${to}): ${data.translatedText}`;
                message.channel.send(response);
            }
            catch(err) {
                bot.error(err);
                if(typeof err == "string")
                    return message.channel.send(err);
                message.channel.send("Got some error. Nice.");
            }
        }
    },
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
                else if (/^kata(?:kana)?$/.test(mod))
                    type = "katakana"
                if(/^oku(?:rigana)?$/.test(mod))
                    mode = "okurigana"
            }
            const result = kuroshiro.convert(command.arguments.join(" "), {to: type, mode});
            let responseType = type[0].toUpperCase() + type.slice(1);
            responseType += (mode != "spaced") ? " (" + mode + ")" : "";
            return message.channel.send(responseType + ": " + result);
        }
    }
};