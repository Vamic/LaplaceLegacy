var bot = module.parent.exports;

exports.commands = {
    kill: {
        commands: ["!kill", "-kill", "!die", "-die", "!quit", "-quit", "!exit", "-exit"]
        requirements: [bot.requirements.isAdmin],
        exec: function (command, message) {
            if (message.channel.type !== "dm")
                message.delete();
            bot.admin.kill();
        }
    },
    crash: {
        commands: ["!crash", "-crash"],
        requirements: [bot.requirements.isAdmin],
        exec: function (command, message) {
            throw "Manual crash from admin.";
        }
    },
    say: {
        commands: ["!say", "-say"],
        requirements: [bot.requirements.isAdmin],
        exec: function (command, message) {
            if (message.channel.type !== "dm")
                message.delete();
            message.channel.send(command.arguments.join(" "));
        }
    },
    listPlugins: {
        commands: ["!plugins", "-plugins"],
        requirements: [bot.requirements.isAdmin, bot.requirements.guild],
        exec: function (command, message) {
            message.delete();
            var disabled = bot.admin.disabled[message.guild.id];
            var plugins = bot.admin.plugins;
            var response = [];
            if (!disabled) disabled = {};
            for (var i in plugins) {
                var char = disabled[plugins[i]] ? "~~" : "";
                response.push(char + plugins[i] + char);
            }

            message.channel.send("Plugins:\n" + response.join("\n")).then(m => m.delete(15000));
        }
    },
    togglePlugins: {
        commands: ["!enable", "-enable", "!disable", "-disable"],
        requirements: [bot.requirements.isAdmin, bot.requirements.guild],
        exec: function (command, message) {
            message.delete();
            if (command.arguments.length === 0) return message.reply("This command requires arguments.").then(m => m.delete(5000));
            var i;
            var success = true;
            if (command.command === "-enable") {
                for (i in command.arguments) {
                    success = bot.admin.enablePlugin(command.arguments[i], message.guild.id) && success;
                }
            } else {
                for (i in command.arguments) {
                    success = bot.admin.disablePlugin(command.arguments[i], message.guild.id) && success;
                }
            }
            if (success) {
                message.reply(":thumbsup::skin-tone-1:").then(m => m.delete(5000));
            } else {
                message.reply(":thumbsdown::skin-tone-1:").then(m => m.delete(5000));
            }
        }
    },
    reloadPlugins: {
        commands: ["!reload", "-reload", "!reloadPlugin", "-reloadPlugin", "!reloadPlugins", "-reloadPlugins"],
        requirements: [bot.requirements.isAdmin],
        exec: function (command, message) {
            if (message.channel.type !== "dm")
                message.delete();

            //Reload all plugins
            if (command.command === "!reloadPlugins" ||
                command.command === "!reload" && command.arguments.length === 0) {
                bot.admin.reloadPlugins(function (err, result) {
                    if (err) {
                        message.reply("One or more plugins failed to load.").then(m => m.delete(5000));
                    } else {
                        message.reply("Plugins successfully reloaded.").then(m => m.delete(5000));
                    }
                });
            } else if (command.arguments.length > 0) {
                //Reloading specified plugins, probably should be in reloadPlugins
                var successes = 0;
                for (var i in command.arguments) {
                    if (bot.admin.reloadPlugin(command.arguments[i])) successes++;
                }
                if (successes === command.arguments.length) {
                    message.reply("Plugins successfully reloaded.").then(m => m.delete(5000));
                } else {
                    message.reply("One or more plugins failed to load.").then(m => m.delete(5000));
                }
            } else {
                message.reply("What?").then(m => m.delete(5000));
            }
        }
    }
};