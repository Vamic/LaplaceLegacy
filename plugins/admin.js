var bot = module.parent.exports;

exports.commands = {
    kill: {
        commands: ["!kill", "-kill", "!die", "-die", "!quit", "-quit", "!exit", "-exit"],
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
            var extensions = bot.admin.extensions;
            var plugins = bot.admin.plugins;
            var response = [];
            if (!disabled) disabled = {};
            for (const plugin of plugins) {
                //Decide the style
                let style = disabled[plugin] ? "~~" : "**";
                //Check if it has extensions or is an extension
                if (Object.keys(extensions).find(e => extensions[e].includes(plugin))) {
                    //Ignore extensions because they get listed under the extended plugin
                    continue;
                }
                //Show the plugin name
                response.push(style + plugin + style.split("").reverse().join(""));
                //Show each extension
                extensions[plugin] && extensions[plugin].forEach(p => {
                    let style = "*" + (disabled[p] ? "~~" : "");
                    response.push("   - " + style + p + style.split("").reverse().join(""));
                });
            }

            message.channel.send(new bot.MessageEmbed().setDescription("Plugins:\n" + response.join("\n")));
        }
    },
    togglePlugins: {
        commands: ["!enable", "-enable", "!disable", "-disable"],
        requirements: [bot.requirements.isAdmin, bot.requirements.guild],
        exec: function (command, message) {
            if (command.arguments.length === 0) return message.reply("`" + command.command + " plugin1 plugin2`").then(m => m.delete({timeout:10000}));
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
                message.reply(":thumbsup::skin-tone-1:").then(m => m.delete({timeout:5000}));
            } else {
                message.reply(":thumbsdown::skin-tone-1:").then(m => m.delete({timeout:5000}));
            }
        }
    },
    reloadPlugins: {
        commands: ["!reload", "-reload", "!reloadPlugin", "-reloadPlugin", "!reloadPlugins", "-reloadPlugins"],
        requirements: [bot.requirements.isAdmin],
        exec: async function (command, message) {
            if (message.channel.type !== "dm")
                message.delete();

            //Reload all plugins
            command.command = command.command.substr(1);
            if (command.command === "reloadPlugins" ||
                command.command === "reload" && command.arguments.length === 0) {
                try{
                    await bot.admin.reloadPlugins();
                    message.reply("Plugins successfully reloaded.").then(m => m.delete({timeout:5000}));
                } catch(error) {
                    if(typeof error == "string") message.reply(error).then(m => m.delete({timeout:5000}));
                    else throw error;
                }
            } else if (command.arguments.length > 0) {
                //Reloading specified plugins, probably should be in reloadPlugins
                var successes = 0;
                for (var i in command.arguments) {
                    if (bot.admin.reloadPlugin(command.arguments[i])) successes++;
                }
                if (successes === command.arguments.length) {
                    message.reply("Plugins successfully reloaded.").then(m => m.delete({timeout:5000}));
                } else {
                    message.reply("One or more plugins failed to load.").then(m => m.delete({timeout:5000}));
                }
            } else {
                message.reply("What?").then(m => m.delete({timeout:5000}));
            }
        }
    },
    invitelink: {
        commands: ["!invite", "-invite"],
        requirements: [bot.requirements.isAdmin],
        exec: async function (command, message) {
            let link = `<https://discordapp.com/api/oauth2/authorize?client_id=${bot.user.id}&permissions=0&scope=bot>`;
            message.reply(link);
        }
    }
};