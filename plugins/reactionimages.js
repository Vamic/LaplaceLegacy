var bot = module.parent.exports;

var fs = require('fs');

var sendImage = function (data) {
    //Get filenames in path
    var images = fs.readdirSync(data.path);
    //In case there are no files
    if (!images || !images.length) data.channel.send("No images found.");
    else {
        //Get random file
        var fileName = images[Math.floor(Math.random() * images.length)];
        //Combine to make path
        var filePath = data.path + "\\" + fileName;
        //Make discord.js attachment
        var attachment = new bot.Attachment(filePath, fileName);
        //Send file with the appropriate text or none depending on input
        if (data.arguments.length > 0 && data.message) {
            var msg = "- " + data.username + " " + data.message + " " + data.arguments.join(" ") + " -";
            data.channel.send(msg, attachment)
                .catch(bot.error);
        }
        else
            data.channel.send(attachment)
                .catch(bot.error);
    }
};

var getCommand = function (options) {
    var command = {
        exec: function (command, message) {
            //Delete user message
            message.delete();
            //Replace with image
            sendImage({
                message: options.message,
                path: options.path,
                arguments: command.arguments,
                channel: message.channel,
                username: message.author.username
            });
        }
    };
    if (options.description) {
        command.description = options.description;
    }
    return command;
};

// Commands
exports.commands = {
    "!lewd": getCommand({
        path: "images/lewd",
        description: ["Whoa, l-lewd~"]
    }),
    "!smug": getCommand({
        path: "images/smug",
        description: ["Heh, too young"]
    }),
    "!pat": getCommand({
        path: "images/pat",
        description: ["Pap pap"],
        message: "gently pats"
    }),
    "!pet": getCommand({
        path: "images/pat",
        message: "gently pets"
    }),
    "!hug": getCommand({
        path: "images/hug",
        description: ["Haggu hagguu"],
        message: "hugs"
    }),
    "!sleep": getCommand({
        path: "images/sleep",
        description: ["Zzz"],
        message: "tells"
    }),
    "!cry": getCommand({
        path: "images/cry",
        description: ["Waaaahh"],
        message: "cries on"
    }),
    "!triggered": getCommand({
        path: "images/triggered",
        description: ["TRIGGERED"],
        message: "gets triggered by"
    }),
    "!sweat": getCommand({
        path: "images/sweat",
        description: ["oh geez"]
    }),
    "!ugh": getCommand({
        path: "images/ugh",
        description: ["gdi"]
    }),
    "!lolicon": getCommand({
        path: "images/lolicon",
        description: ["prove it"]
    }),
    "!excalibur": getCommand({
        path: "images/excalibur",
        description: ["......"]
    })
};
