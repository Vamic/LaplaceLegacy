var bot = module.parent.exports;

exports.commands = {
    "!color": {
        description: "Changes your color to the provided hex color.",
        usage: "#112233",
        exec: function (command, message) {
            var guild = message.guild;
            if (!guild) {
                message.channel.send("The fuck do you want me to do?");
            } else {
                var roles = guild.roles;
                var member = message.member;

                var role = roles.find("name", member.id);
                if (role) {
                    bot.log("Changing color for " + member.displayName + "...");

                    role.setColor(command.arguments[0]).catch(bot.error);
                    member.addRole(role);
                } else {
                    bot.log("Creating color role for " + member.displayName + "...");

                    guild.createRole({
                        name: member.id,
                        color: command.arguments[0]
                    }).then(function (role) {
                        bot.log("Created color role " + role.name);
                        member.addRole(role);
                    }).catch(bot.error);
                }
            }
        }
    }
};
