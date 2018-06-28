var bot = module.parent.exports;

const math = require('mathjs');

const timezones = require("./data/timezones.json");
const tzAbbrevations = timezones.map(tz => tz.abbreviaton);

if(!Array.prototype.rand) {
    const rand = function () {
        return this[Math.floor(Math.random() * this.length)]
    }
    //Set enumerable to false so looping through arrays doesnt catch the rand function
    Object.defineProperty(Array.prototype, "rand", {
        value: rand,
        enumerable: false
    })
}

const general = {
    yesnoquestion: {
        min: 1,
        max: 100,
        regex: /^(?:am|are|(?:sha|wi)ll|can|did|is|(sh|w|c)ould|ha(?:ve|d)|do(?:es)?|(?:h|w)as)(?:n(?:´|`|'|’)?t)? | (?:(?:am|are|(?:sha|wi)ll|can|did|is|(sh|w|c)ould|ha(?:ve|d)|do(?:es)?|(?:h|w)as)(?:(?:n(?:´|`|'|’)?t)?)|(?:ca|wo)n(?:´|`|'|’)?t) \w+\??$/igm,
        responses: [
            "Yea",
            "Sure",
            "Yeh",
            "Yes",
            "No",
            "No",
            "Nope",
            "Nah"
        ],
        respond: (msg, responses) => {
            const response = responses.rand();
            msg.channel.send(response);
        }
    },
    choicequestion: {
        min: 1,
        max: 100,
        regex: /^(\w+ ?)*(, ?| ?or )(\w+ ?)+\??$/gi,
        responses: [
            "Totally ",
            "Probably ",
            "I'd say "
        ],
        respond: (msg, responses) => {
            const input = msg.content.replace(/\?$/, "").split(" ").filter(notLaplaceMention).join(" ");
            const options = input.split(/, ?| or /g);
            const response = responses.rand() + options.rand().replace(/\s\s+/g, ' ').trim() + ".";
            msg.channel.send(response);
        }
    },
    wassaaaa: {
        min: 1,
        max: 3,
        regex: /^(?:wh?at?(?:'|`|´| i)?s?s ?(?:u|a)p|sup)\??$/,
        responses: [
            "I wish I were a bird.",
            "Just chillin', relaxin' all cool. You?"
        ],
        respond: (msg, responses) => {
            const response = responses.rand();
            msg.channel.send(response);
        }
    },
    thxm8: {
        min: 1,
        max: 2,
        regex: /^(?:th(?:(?:a|e)nk)(?:s|e)|th(?:a|e)nk you|thx)$/,
        responses: [
            "No problem",
            "You're welcome",
            "Any time"
        ],
        respond: (msg, responses) => {
            const name = msg.member && msg.member.nickname ? msg.member.nickname : msg.author.username;
            const response = responses.rand();
            msg.channel.send(response + (bot.requirements.direct(msg) ? "." : " " + name + "."));
        }
    },
    greeting: {
        min: 1,
        max: 1,
        regex: /^(?:h?e(?:l|nl|y)l?o|h(?:ey|i)|yo)$/,
        responses: [
            "Hello",
            "Hey",
            "Hi"
        ],
        respond: (msg, responses) => {
            const name = msg.member && msg.member.nickname ? msg.member.nickname : msg.author.username;
            const response = responses.rand();
            msg.channel.send(response + (bot.requirements.direct(msg) ? "." : " " + name + "."));
        }
    },
    love: {
        min: 3,
        max: 3,
        regex: /^i love you$/,
        responses: [
            "Thank you.",
            "uwu",
            "That's nice.",
            "I know."
        ],
        respond: (msg, responses) => {
            const response = responses.rand();
            msg.channel.send(response);
        }
    }
}

const strictMathWhitelist = /\+|\*|%|\/|-|\^|>|<|=|!| |[0-9]i?|ph?i|e|\(|\)|\.|,|\[|]|(?:format|deg|sqrt|det|sin|cos)\(|(?:\w*? to \w*)/i;
const timezoneRegex = /^((?:1[0-2]|0?\d)(?::[0-5][0-9])? ?[AP]M |24:00 |(?:2[0-3]|[01]?[0-9])(?::[0-5][0-9])?)? ?([a-zA-Z]{1,4}|(?:GMT|UTC) ?[+-][01]?\d) to ([a-zA-Z]{1,4}|(?:GMT|UTC) ?[+-][01]?\d)$/i;

function isLaplaceMention(word) {
    return word.toLowerCase().indexOf("laplace") > -1
        || word.indexOf(bot.user.id) > -1
}

function notLaplaceMention(word) {
    return !isLaplaceMention(word);
}

function mentionsLaplace(msg) {
    return msg.content.toLowerCase().indexOf("laplace") > -1
        || msg.isMemberMentioned(bot.user)
        || bot.requirements.direct(msg);
}

function isMath(msg) {
    if(!isNaN(msg.content)) return false;
    let input = msg.content.split(" ").filter(notLaplaceMention).join(" ");
    const notMath = input.replace(strictMathWhitelist, "");
    return notMath.length === 0;
}

function isTimezone(msg) {
    let input = msg.content.split(" ").filter(notLaplaceMention).join(" ");
    const parts = timezoneRegex.exec(input.toUpperCase());
    return parts && tzAbbrevations.indexOf(parts[2]) > -1 && tzAbbrevations.indexOf(parts[3]) > -1;
}

function isGeneral(msg, cb) {
    const parts = msg.content.split(" ").filter(notLaplaceMention);
    if(parts.length) {
        for(const i in general) {
            const obj = general[i];
            if(parts.length < obj.min) continue;
            let success = false;
            let maxWords = parts.length > obj.max ? obj.max : parts.length;
            for(let i = 1; i <= maxWords; i++) {
                const words = parts.slice(0, i).join(" ");
                const success = obj.regex.test(words.toLowerCase());
                if(success) {
                    if(cb) cb(null, obj);
                    return success;
                }
            }
        }
    }
    if(cb) cb("empty message or no matches");
    return false;
}

async function calculateTimezoneDiff(options) {
    let result = {
        extramsg: "",
        offset: 0,
        time: options.time,
        dayoffset: 0,
        from: null,
        to: null
    };
    if(/(?:GMT|UTC) ?[+-][01]?\d/i.test(options.from)) {
        result.from = timezones.find(tz => tz.utc_relation.split(" ")[1] == options.from.replace(/UTC ?|GMT ?/i, ""));
    } else {
        result.from = timezones.find(tz => tz.abbreviaton == options.from && tz.alternate == false);
        if(!result.from)
            result.from = timezones.find(tz => tz.abbreviaton == options.from);
    }
    if(!result.from) {
        throw `Input timezone "${options.from}" was not found.`;
    }
    if(/(?:GMT|UTC) ?[+-][01]?\d/i.test(options.to)) {
        result.to = timezones.find(tz => tz.utc_relation.split(" ")[1] == options.to.replace(/UTC ?|GMT ?/i, ""));
    } else {
        result.to = timezones.find(tz => tz.abbreviaton == options.to && tz.alternate == false);
        if(!result.to)
            result.to = timezones.find(tz => tz.abbreviaton == options.to);
    }
    if(!result.to) {
        throw `Input timezone "${options.to}" was not found.`;
    }
    result.offset = result.to.offset - result.from.offset;
    if(!options.time) {
        return result;
    }
    let time = options.time.replace(/AM|PM/i, "");
    let hours = Number(time.split(":")[0])
    if(/PM/i.test(options.time)) hours += 12;
    let minutes = Number(time.split(":")[1] || 0);

    hours += Math.floor(result.offset);
    minutes += (result.offset % 1) * 60;

    //Transfer time between hours/minutes so minutes is in range 0-59
    if(minutes >= 60) {
        hours += Math.floor(minutes / 60);
        minutes = minutes % 60;
    } else if(minutes < 0) {
        hours--;
        minutes += 60;
    }

    //Transfer time between hours/days so hours is in range 0-23
    if(hours >= 24) {
        result.dayoffset = Math.floor(hours / 24);
        hours = hours % 24;
    }
    while(hours < 0) {
        result.dayoffset--;
        hours += 24;
    }

    //Make them two digits
    hours = hours < 10 ? "0" + hours : hours;
    minutes = minutes < 10 ? "0" + minutes : minutes;
    result.time = hours + ":" + minutes;

    return result;
}

exports.commands = {
    timezoneshenanigans: {
        commands: [""],
        requirements: [bot.requirements.isUser, isTimezone],
        exec: async function (message) {
            console.log(message.content);
            let input = message.content.split(" ").filter(notLaplaceMention).join(" ");
            let args = timezoneRegex.exec(input);
            let options = {
                time: "13:15 or 4PM",
                from: "GMT",
                to: "PST"
            };
            args.shift();
            options.time = args.shift();
            options.from = args.shift().toUpperCase();
            options.to = args.shift().toUpperCase();
            console.log(options);
            try {
                let result = await calculateTimezoneDiff(options);
                var em = new bot.RichEmbed();
                if(!result.time) {
                    var to_name = "`" + result.to.name + "`";
                    var fromname = "`" + result.from.name + "`";
                    var hours = Math.abs(result.offset);
                    var ahead_or_behind = result.offset < 0 ? "behind" : "ahead of";

                    em.setDescription(`${to_name} is ${hours} hours ${ahead_or_behind} ${fromname}`)
                        .addField("To", result.to.abbreviaton + " (" + result.to.locations.join(", ") + ")", true)
                        .addField("From", result.from.abbreviaton + " (" + result.from.locations.join(", ") + ")", true);
                }
                else {
                    var old_time = options.time + " " + result.from.abbreviaton;
                    var new_time = result.time + " " + result.to.abbreviaton;
                    var previous_or_next = result.dayoffset == -1 ? "previous" : result.dayoffset == 1 ? "next" : "same";

                    em.setDescription(`**${old_time}** is **${new_time}**, the ${previous_or_next} day.`)
                        .addField("From", result.from.abbreviaton + " (" + result.from.locations.join(", ") + ")", true)
                        .addField("To", result.to.abbreviaton + " (" + result.to.locations.join(", ") + ")", true);
                }
                message.channel.send(em);
            }
            catch(err) {
                bot.error(err);
                if(typeof err == "string") message.channel.send(err);
                else throw err;
            }
        }
    },
    advancedmaffs: {
        commands: ["!math"],
        requirements: [bot.requirements.isUser],
        exec: function (command, message) {
            let input = command.arguments.filter(notLaplaceMention).join(" ");
            try {
                let result = math.eval(input);
                if(result && result.entries) {
                    if(!result.entries.length) return;
                    result = result.entries[0];
                }
                if(typeof result === 'object') {
                    const split = (result.toString()).split(" ");
                    result = Math.round(split[0] * 100) / 100 + " " + split[1] || "";
                }
                else if(typeof result === 'number')
                    result = Math.round(result * 10000) / 10000;
                const response = "`" + input + "` is **" + result + "**";
                const suffix = typeof result === 'number' ? "   _advanced maffs_" : "";
                message.channel.send(response.replace(/\s\s+/g, ' ') + suffix);
            } catch(e) {
                message.channel.send("Bzz: " + e);
            }
        }
    },
    quickmaffs: {
        commands: [""],
        requirements: [bot.requirements.isUser, isMath],
        exec: function (message) {
            let input = message.content.split(" ").filter(notLaplaceMention).join(" ");
            if(!mentionsLaplace(message)) {
                const notMath = input.replace(strictMathWhitelist, "");
                if(notMath.length) return bot.error("quickmaffs triggered even though its not math");
            }
            input = input.replace(/c (to|in) f/gi, "celsius to fahrenheit")
                .replace(/f (to|in) c/gi, "fahrenheit to celsius")
            try {
                let result = math.eval(input);
                if(result && result.entries) {
                    if(!result.entries.length) return;
                    result = result.entries[0];
                }
                if(typeof result === 'object') {
                    const split = (result.toString()).split(" ");
                    result = Math.round(split[0] * 100) / 100 + " " + split[1];
                }
                else if(typeof result === 'number')
                    result = Math.round(result * 10000) / 10000;
                const response = "`" + input + "` is **" + result + "**";
                const suffix = typeof result === 'number' ? "   _quick maffs_" : "";
                message.channel.send(response.replace(/\s\s+/g, ' ') + suffix);
            } catch(e) {
                bot.error("[quickmaffs]" + e);
            }
        }
    },
    general: {
        commands: [""],
        requirements: [bot.requirements.isUser, mentionsLaplace, isGeneral],
        exec: function (message) {
            isGeneral(message, (err, obj) => {
                if(err) return bot.error(err);
                obj.respond(message, obj.responses);
            });
        }
    }
};