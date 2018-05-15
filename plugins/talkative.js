var bot = module.parent.exports;

const math = require('mathjs');

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
    yesnoquestion : {
        min: 1,
        max: 100,
        regex: /^(?:am|are|is|should|have|do(?:es)?|could|can|was)(?:n(?:´|`|'|’)?t)? | (?:(?:am|are|shall|will|can|did|has|is|should|ha(?:ve|d)|do(?:es)?|could|was|would)(?:(?:n(?:´|`|'|’)?t)?)|(?:ca|wo)n(?:´|`|'|’)?t) \w+\??$/igm,
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
    choicequestion : {
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
    wassaaaa : {
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
    thxm8 : {
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
    greeting : {
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
    love : {
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

const lenientMathRequirements = /\+|\*|%|\/|-|\^|>|<|=|!|\(|\)|\.|,|\[|]|deg|(det|sin|cos)/;
const lenientMathBlacklist = /'|`|´|"|(?!det|sin|cos\b)\b\w+ *\(|^\w+$/gi;
const strictMathWhitelist = /\+|\*|%|\/|-|\^|>|<|=|!| |[0-9]i?|ph?i|e|\(|\)|\.|,|\[|]|(?:format|deg|sqrt|det|sin|cos)\(|(?:(?:\w+ )?to(?: \w+)?)/gi;

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

function isMath(msg, cb) {
    if(!isNaN(msg.content)) return false;
    let input = msg.content.split(" ").filter(notLaplaceMention).join(" ");
    
    /*
    if(input.indexOf("!math")) {
        input = input.replace("!math", "");
        return !lenientMathBlacklist.test(input) && lenientMathRequirements.test(input);
    }
    */
    
    const notMath = input.replace(strictMathWhitelist, "");
    return notMath.length === 0;
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
                    if (cb) cb(null, obj); 
                    return success;
                }
            }
        }
    }
    if (cb) cb("empty message or no matches"); 
    return false;
}

exports.commands = {
    quickmaffs: {
        commands: [""],
        requirements: [bot.requirements.isUser, isMath],
        exec: function (message) {
            let input = message.content.split(" ").filter(notLaplaceMention).join(" ");
            if(!mentionsLaplace(message)) {
                const notMath = input.replace(strictMathWhitelist, "");
                if (notMath.length) return bot.error("quickmaffs triggered even though its not math");
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
            } catch (e) {
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