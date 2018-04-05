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

exports.commands = {
    testCommand: {
        commands: ["!test"],
        exec: function (command, message) {
            bot.log(command.arguments);
            bot.log(command.modifiers);
        }
    },
    poll: {
        commands: ["!poll"],
        usage: "!poll:time question goes here | choice1/choice2/...",
        exec: function (command, message) {
            if (command.arguments.length === 0 ||
                command.arguments.join("").indexOf("|") === -1)
                return message.reply("`" + this.usage + "`");

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
            var emojis, pollMessage;
            //Check if we have any choices
            if (poll.choices.length > 0) {
                //We've got one, what a poll
                if (poll.choices.length === 1) {
                    //Get a random emoji to vote with
                    emojis = getRandomEmojis(bot.emojis, 1);

                    data = {
                        emojis: emojis,
                        options: poll.choices
                    };

                    //Make a message, should probably make it sassy because this poll sucks
                    pollMessage = buildPollMessage(poll.question, message.author.username, data);

                    //Send & react
                    message.channel.send(pollMessage).then(function (msg) {
                        msg.react(emojis[0].id);

                        //No need to actually collect the reactions, who cares
                        setTimeout(function () {
                            data.emojis[0].votes = Math.ceil(Math.random() * 2000);
                            pollMessage = buildPollMessage(poll.question, message.author.username, data);
                            msg.edit(pollMessage);
                        }, time * 1000);
                    });
                //We've got more than one, amazing use of poll
                } else if (poll.choices.length < 6) {
                    //Get random emojis to vote with
                    emojis = getRandomEmojis(bot.emojis, poll.choices.length);

                    data = {
                        emojis: emojis,
                        options: poll.choices
                    };

                    pollMessage = buildPollMessage(poll.question, message.author.username, data);

                    message.channel.send(pollMessage).then(function (msg) {
                        //Put up option reactions in the correct order
                        var emojiIds = data.emojis.map(a => a.id);
                        reactInOrder(msg, emojiIds);

                        //Collect the results after some seconds
                        var collector = msg.createReactionCollector(
                            //Collect only the reactions we gave them
                            (reaction) => emojiIds.indexOf(reaction.emoji.id) > -1,
                            //End after previously decided time in seconds
                            { time: time * 1000 }
                        );
                        collector.on('end', (collected, reason) => {
                            //Add the votes to each option
                            for (var [key, reaction] of collected) {
                                var index = emojiIds.indexOf(reaction.emoji.id);
                                data.emojis[index].votes = reaction.count - 1; //Remove the bot from the count
                            }

                            //Edit
                            pollMessage = buildPollMessage(poll.question, message.author.username, data);
                            msg.edit(pollMessage);
                        });
                    });
                //T-that many? It won't fit!!!
                } else {
                    message.reply("Too much shit. Max 5 things for now.");
                }
            //We got nothing, what the fuck
            } else {
                message.reply("You need some choices. `" + this.usage + "`");
            }
        }
    }
};