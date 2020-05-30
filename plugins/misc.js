var bot = module.parent.exports;

exports.commands = {
    testCommand: {
        commands: ["!test"],
        exec: function (command, message) {
            var url = "https://i.imgur.com/qRS5WHk.gifv";
            url = "https://cdn.discordapp.com/attachments/230828612318658560/449214032814276608/butterfly.webp";
            var em = new bot.MessageEmbed().setImage(url).setDescription(url);
            console.log(em);
            message.channel.send(em);
        }
    }
};