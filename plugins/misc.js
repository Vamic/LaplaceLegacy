var bot = module.parent.exports;

var getRandomEmojis = function (emojis, amount) {
    var result = [];
    var keys = Object.keys(emojis);
    while (amount > 0 && keys.length > 0) {
        var key = keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
        result.push({
            id: emojis[key],
            name: key
        });
        amount--;
    }
    return result;
};
var reactInOrder = function (msg, emojis, i) {
    if (!i) i = 0;
    if (!emojis[i]) return;
    msg.react(bot.emojis[emojis[i]]).then(function () {
        reactInOrder(msg, emojis, i + 1);
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

exports.commands = {
    testCommand: {
        commands: ["!test"],
        exec: function (command, info, rawMessage) {
            console.log(command.arguments);
            console.log(command.modifiers);
        }
    },
    poll: {
        commands: ["!poll"],
        use: "!poll:time question goes here | choice1/choice2/...",
        exec: function (command, info, rawMessage) {
            //Decide how long the poll will last
            var time = 20;
            var lowLim = 5;
            var upLim = 60;
            var mods = command.modifiers;
            if (mods.length > 0)
                if (mods[0] > 0)
                    if (mods[0] > upLim)
                        time = upLim;
                    else if (mods[0] < lowLim)
                        time = lowLim;
                    else
                        time = mods[0];

            //Get question & options
            var pollParts = command.arguments.join(" ").split("|");
            var poll = {
                question: pollParts[0],
                choices: pollParts[1].split("/").filter(Boolean)
            };
            //Check if we have any choices
            if (poll.choices.length > 0) {
                //We've got one, what a poll
                if (poll.choices.length === 1) {
                    //Get a random emoji to vote with
                    var emoji = getRandomEmojis(bot.emojis, 1);
                    info.channel.send(info.user + " created a poll: <:" + emoji + ":" + bot.emojis[emoji] + "> " + poll.choices[0]).then(function (msg) {
                        msg.react(bot.emojis[emoji]);
                    });
                //We've got more than one, amazing use of poll
                } else if (poll.choices.length < 6) {
                    //Get random emojis to vote with
                    var emojis = getRandomEmojis(bot.emojis, poll.choices.length);

                    data = {
                        emojis: emojis,
                        options: poll.choices
                    };

                    var pollMessage = buildPollMessage(poll.question, info.user, data);

                    info.channel.send(pollMessage).then(function (msg) {
                        //Put up option reactions in the correct order
                        var emojiNames = emojis.map(a => a.name);
                        reactInOrder(msg, emojiNames);

                        //Collect the results after some seconds
                        var collector = msg.createReactionCollector(
                            //Collect only the reactions we gave them
                            (reaction) => emojiNames.indexOf(reaction.emoji.name) > -1,
                            //End after previously decided time in seconds
                            { time: time * 1000 }
                        );
                        collector.on('end', (collected, reason) => {
                            data.emojis = [];
                            for (var [key, reaction] of collected) {
                                data.emojis.push({
                                    id: key,
                                    name: reaction.emoji.name,
                                    votes: reaction.count - 1 //Remove the bot from the count
                                });
                            }
                            pollMessage = buildPollMessage(poll.question, info.user, data);
                            msg.edit(pollMessage);
                        });
                    });
                //T-that many? It won't fit!!!
                } else {
                    rawMessage.reply("Too much shit. Max 5 things for now.");
                }
            //We got nothing, what the fuck
            } else {
                rawMessage.reply("You need some choices. `!poll:[time] question goes here | choice1/choice2/choice3`");
            }
        }
    }
};