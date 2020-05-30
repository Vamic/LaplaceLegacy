var bot = module.parent.exports;

var getRandomEmojis = function (emojiCollection, amount) {
    var result = [];
    while (amount > 0) {
        var randoms = emojiCollection.random(amount);
        for (var i in randoms) {
            result.push({
                id: randoms[i].id,
                name: randoms[i].name
            });
        }
        amount -= result.length;
    } 
    return result;
};
var reactInOrder = function (msg, emojiIds, i) {
    if (!i) i = 0;
    if (!emojiIds[i]) return;
    msg.react(emojiIds[i]).then(function () {
        reactInOrder(msg, emojiIds, i + 1);
    });
};
var buildPollMessage = function (question, user, data) {
    var emojis = data.emojis;
    var options = data.options;
    var result = user + " created a poll: " + question;
    for (var i in data.options) {
        var emoji = emojis[i];
        result += "\n<:" + emoji.name + ":" + emoji.id + "> " + options[i];
        if (emoji.votes) {
            result += " got " + emoji.votes + " votes!";
        }
    }
    return result;
};

var toRegionalIndicator = function(character) {
    if (character && /^[a-zA-Z0-9]$/.test(character)){
        if (/^\d$/.test(character)){
            return String.fromCharCode(character.charCodeAt(0), 0x20E3);
        }
        return String.fromCodePoint(0x1F185 + character.charCodeAt(0));
    }
    return null;
}

exports.commands = {
    reacttomessage: {
        commands: ["!react"],
        requirements: [bot.requirements.guild],
        exec: async function (command, message) {
            const args = command.arguments;
            if (args.length < 2)
                return message.channel.send("!react message_id emoji emoji2 etc");
            //get message
            try {
                const targetMessage = await message.channel.messages.fetch(args.shift());
                const emojis = [];
                for(const arg of args) {
                    const isWord = /^[a-zA-Z0-9]+$/.test(arg);
                    if (isWord) {
                        for(var i = 0 ; i < arg.length; i++) {
                            const emoji = toRegionalIndicator(arg[i]);
                            if(!emoji || emojis.indexOf(emoji) > -1) continue;
                            emojis.push(emoji);
                        }
                    } else {
                        const regexResult = /:(\d+)>$/.exec(arg);
                        const emoji = regexResult ? await bot.emojis.get(regexResult[1]) : arg;
                        if(emojis.indexOf(emoji) > -1) continue;
                        emojis.push(emoji);
                    }
                }
                if (!emojis.length) throw "no emojis";
                if (emojis.length > 15) throw "too many emojis cmon now";
                for(const emoji of emojis) {
                    await targetMessage.react(emoji);
                }
            } catch (e) {
                bot.error(e);
            }
        }
    }
};