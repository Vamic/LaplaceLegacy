var bot = module.parent.exports;

const trusted = bot.secrets.admins;

exports.commands = {
    kill: {
        commands: ["-kill", "-die", "-quit", "-exit"],
        exec: function (command, message) {
            if (trusted.indexOf(message.author.id) === -1) return;

            bot.admin.kill();
        }
    },
    reloadPlugins: {
        commands: ["-reload", "-reloadPlugin", "-reloadPlugins"],
        exec: function (command, message) {
            if (trusted.indexOf(message.author.id) === -1) return;

            //Reload all plugins
            if (command.command === "-reloadPlugins" ||
                command.command === "-reload" && command.arguments.length === 0) {
                bot.admin.reloadPlugins(function (err, result) {
                    if (err) {
                        message.reply("One or more plugins failed to load.");
                    } else {
                        message.reply("Plugins successfully reloaded.");
                    }
                });
            } else if (command.arguments.length > 0) {
                //Reloading specified plugins, probably should be in reloadPlugins
                var successes = 0;
                for (var i in command.arguments) {
                    if (bot.admin.reloadPlugin(command.arguments[i])) successes++;
                }
                if (successes === command.arguments.length) {
                    message.reply("Plugins successfully reloaded.");
                } else {
                    message.reply("One or more plugins failed to load.");
                }
            } else {
                message.reply("What?");
            }
        }
    }
};