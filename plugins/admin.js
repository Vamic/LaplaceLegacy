var bot = module.parent.exports;

const trusted = ['95611335676526592'];

exports.commands = {
    reloadPlugins: {
        commands: ["-reload", "-reloadPlugin", "-reloadPlugins"],
        exec: function (command, info, rawMessage) {
            if (command.command === "-reloadPlugins" ||
                command.command === "-reload" && command.arguments.length === 0) {
                //Reloading all plugins
                bot.reloadPlugins(function (err, result) {
                    if (err) {
                        rawMessage.reply("One or more plugins failed to load.");
                    } else {
                        rawMessage.reply("Plugins successfully reloaded.");
                    }
                });
            } else if (command.arguments.length > 0) {
                //Reloading specified plugins
                var successes = 0;
                for (var i in command.arguments) {
                    if (bot.reloadPlugin(command.arguments[i])) successes++;
                }
                if (successes === command.arguments.length) {
                    rawMessage.reply("Plugins successfully reloaded.");
                } else {
                    rawMessage.reply("One or more plugins failed to load.");
                }
            } else {
                rawMessage.reply("What?");
            }
        }
    }
};