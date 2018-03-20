var bot = module.parent.exports;

exports.commands = {
    kill: {
        commands: ["-kill", "-die", "-quit", "-exit"],
        requirements: [bot.requirements.isAdmin],
        exec: function (command, message) {

            message.delete();
            bot.admin.kill();
        }
    },
    say: {
        commands: ["-say", "!say"],
        requirements: [bot.requirements.isAdmin],
        exec: function (command, message) {
            message.delete();
            message.channel.send(command.arguments.join(" "));
        }
    },
    reloadPlugins: {
        commands: ["-reload", "-reloadPlugin", "-reloadPlugins"],
        requirements: [bot.requirements.isAdmin],
        exec: function (command, message) {
            message.delete();

            //Reload all plugins
            if (command.command === "-reloadPlugins" ||
                command.command === "-reload" && command.arguments.length === 0) {
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