var bot = module.parent.exports;

let colors = require("./data/color-names.json");

exports.commands = {
    "!color": {
        description: "Changes your color to the provided hex color.",
        requirements: [bot.requirements.guild],
        usage: "[color name|RGB|RRGGBB]\nex: !color #55ff00",
        exec: async function (command, message) {
            var guild = message.guild;
            var roles = guild.roles;
            var member = message.member;

            let input = command.arguments.join(" ");
            let color = "";
            if(/^#?(?:[0-9a-fA-F]{3}){1,2}$/.test(input)) {
                input = input.replace("#", "");
                if(input.length == 3) {
                    color = input[0] + input[0] + input[1] + input[1] + input[2] + input[2];
                } else {
                    color = input;
                }
                color = "#" + color;
            } else if(colors[input]) {
                color = colors[input];
            } else {
                return message.reply("No color with that name found.");
            }

            var role = roles.find("name", member.id);
            if (role) {
                bot.log("Changing color for " + member.displayName + " to " + color);

                try {
                    await role.setColor(color);
                    await member.addRole(role);
                } catch(e) {
                    bot.error(e);
                    return message.reply(`Something went wrong.`);
                }
            } else {
                bot.log("Creating color role for " + member.displayName + "...");

                try {
                    let role = await guild.createRole({
                        name: member.id,
                        color: color
                    })
                    bot.log("Created color role " + role.name);
                    await member.addRole(role);
                } catch(e) {
                    bot.error(e);
                    return message.reply(`Something went wrong.`);
                }
            }
            return message.reply(`Your color is now ${color}.`);
        }
    }
};
