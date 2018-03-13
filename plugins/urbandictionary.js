var bot = module.parent.exports;

exports.commands = {
    define: {
        commands: ["!define", "!what's", "!whats"],
        exec: function (command, message) {
            if (!command.arguments.length) {
                message.channel.send(info.channel, "Huh. Give me something to define.");
                return;
            }
            bot.util.httpGetJson("http://api.urbandictionary.com/v0/define?term=" +
                encodeURIComponent(command.arguments.join(" ")), function (err, data) {
                    if (err) {
                        message.channel.send("Something went wrong.");
                        return;
                    }
                    if (data.list.length < 1) {
                        message.channel.send("Not even I know what that is! Are you sure it exists? :0");
                        return;
                    }

                    var text = "**[" + data.list[0].word + "]**\n\n" + data.list[0].definition;

                    message.channel.send(text);
                }
            );
        }
    }
};
