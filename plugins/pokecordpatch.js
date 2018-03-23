var bot = module.parent.exports;

const unclaimed = {};

function wildRequirement(msg) {
    if (msg.author.id !== "365975655608745985") return false;
    var embed = msg.embeds[0];
    if (!embed || embed.title !== "A wild pokémon has appeared!") return false;
    if (!embed.image && !embed.image.url) return false;

    return true;
}

function catchRequirement(msg) {
    if (msg.author.id !== "365975655608745985") return false;
    if (msg.content.indexOf("Congratulations") === -1 || msg.content.indexOf("You caught a") === -1) return false;

    return true;
}

exports.commands = {
    pokecordwild: {
        commands: [""],
        requirements: [bot.requirements.guild, bot.requirements.isBot, wildRequirement],
        exec: function (message) {
            var url = message.embeds[0].image.url;
            var pokemon = url.split("/").splice(-1)[0].split("-")[0].replace(".png", "");
            var time = Date.now();
            var embed = new bot.RichEmbed();
            embed.setTitle("A wild pokémon has appeared!");
            embed.setDescription("Use p!catch <Pokemon>");
            embed.setThumbnail(url);
            message.delete();
            message.channel.send(embed).then(function (newMessage) {
                unclaimed[time] = {
                    pokemon: pokemon,
                    msg: newMessage
                };
                setTimeout(function () {
                    if (unclaimed[time]) {
                        unclaimed[time].msg.delete().catch((err) => bot.error(err));
                        delete unclaimed[time];
                    }
                }, 120000);
            });
        }
    },
    pokecordcatch: {
        commands: [""],
        requirements: [bot.requirements.guild, bot.requirements.isBot, catchRequirement],
        exec: function (message) {
            var pokemonIndex = message.content.indexOf("caught a ") + "caught a ".length;
            var pokemon = message.content.substr(pokemonIndex).replace("!", "");
            for (var i in unclaimed) {
                if (unclaimed[i].pokemon.endsWith(pokemon)) {
                    unclaimed[i].msg.delete();
                    delete unclaimed[i];
                }
            }
        }
    },
    pokechase: {
        commands: ["p!chase", "p!shoo"],
        requirements: [bot.requirements.guild],
        exec: function (command, message) {
            if (command.arguments.length !== 1) return;
            var pokemon = command.arguments[0].toLowerCase();
            for (var i in unclaimed) {
                var item = unclaimed[i];
                if (item.pokemon.toLowerCase().endsWith(pokemon)) {
                    item.msg.delete();
                    delete item;
                    message.channel.send("You chased away the " + command.arguments[0] + ".");
                }
            }
        }
    }
};