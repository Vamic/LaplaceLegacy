var bot = module.parent.exports;

var fs = require('fs');
var util = require('util');

const _ = () => {}
const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const mkdir = util.promisify(fs.mkdir);
const rename = util.promisify(fs.rename);

const imgurRegex = /^https:\/\/i\.imgur\.com\/(\w+\.\w{3,4})$/;

var sendImage = async function (data) {
    //Get filenames in path
    var images = [];
    try {
        var unfilteredFiles = await readdir(data.path).catch(_);
        for(var file of unfilteredFiles) {
            var stats = await stat(data.path + "/" + file);
            if(stats.isDirectory()) continue;
            images.push(file);
        }
    } catch(e) {
        await mkdir(data.path).catch(_);
    }
    //In case there are no files
    if (!images || !images.length) data.channel.send(`No images found in folder \`${data.path}\`.\nYou can add images with \`!ri add !command https://i.imgur.com/XxxXxxx.png\``);
    else {
        //Get random file
        var fileName = images[Math.floor(Math.random() * images.length)];
        //Combine to make path
        var filePath = data.path + "/" + fileName;
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
        },
        path: options.path
    };
    if (options.description) {
        command.description = options.description;
    }
    
    return command;
};
var commands = {};

// Commands
commands = {
    managereactimage: {
        commands: ["!reactimage", "!ri"],
        usage: "[add|remove] [reactcommand] [direct imgur link|filename]",
        exec: async function (command, message) {
            var args = command.arguments;
            if(args.length < 3) return message.reply("Usage: `!reactimage " + this.usage + "`");

            var type = args.shift().toLowerCase();
            var targetCommand = args.shift();
            var targetFolder = "";
            
            var commandNames = Object.keys(commands);
            var found = commandNames.find(x => x == targetCommand || x == "!" + targetCommand)
            targetFolder = found ? commands[found].path : "";
            if(!targetFolder) return message.reply("Couldn't find the command. `" + targetCommand + "`")

            var multipleArgs = args.length > 1;

            switch(type) {
                case "add":
                    var links = args.filter(x => imgurRegex.test(x)).filter(x => !x.endsWith("gifv"));
                    if(!links.length) return message.reply("Please provide " + (multipleArgs ? "" : "an ") + "imgur link" + (multipleArgs ? "s" : "") + ". (https://i.imgur.com/xxxxxxx.yyy)");
        
                    var added = [];
                    var failed = [];

                    for(var link of links) {
                        try {
                            var filename = imgurRegex.exec(link)[1];
                            await bot.util.httpDownloadFile(link, targetFolder + "/" + filename, true);
                            added.push(filename);
                        } catch(e) {
                            bot.error(e);
                            failed.push(link);
                        }
                    }
        
                    var response = `Added ${added.length} file${(added.length == 1 ? "" : "s")} to \`${targetFolder}\`: ${added.join(" ")}`;
                    if(failed.length) response += `${failed.length} failed: ${failed.join(" ")}`;

                    return message.reply(response);
                case "remove":
                    await mkdir(targetFolder + "/removed").catch(() => {});

                    args = args.join(" ").split(/\r?\n|\r/g);
                    var toRemove = args.filter(x => !/\/|\\/.test(x));
                    if(!toRemove.length) return message.reply("Please provide proper" + (multipleArgs ? "" : " a") + " filename" + (multipleArgs ? "s" : "") + " to remove.");
                    
                    var removed = [];
                    var failed = [];

                    for(var filename of toRemove) {
                        try {
                            await rename(targetFolder + "/" + filename, targetFolder + "/removed/" + filename);
                            removed.push(filename);
                        } catch(e) {
                            bot.error(e);
                            failed.push(filename);
                        }
                    }
                    var response = `Removed ${removed.length} file${(removed.length == 1 ? "" : "s")} from \`${targetFolder}\`: ${removed.join(" ")}`;
                    if(failed.length) response += `${failed.length} failed: ${failed.join(" ")}`;

                    return message.reply(response);
                default:
                    return message.reply("Usage: `!addreactimage " + exports.commands.usage + "`");
            }
        }
    },
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

exports.commands = commands;