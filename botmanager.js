const fork = require('child_process').fork;
const settings = require('./secrets.json').botmanager;
const Discord = require("discord.js");
const fs = require('fs'); //Used to check if the startpoint points to a start

var botManagerName = "Bot Manager";
const bots = {
    laplace: {              //Object name is used in commands, recommended to be the same as name property but lowercase
        name: "Laplace",    //Display name in reports and console
        restarting: false,  //Makes the log quieter when restarting
        quick_restarts: 0,  //Amount of restarts done automatically within the min_uptime time limit in a row
        max_restarts: 2,    //Amount of quick_restarts before bot stops restarting automatically
        restart_delay: 500, //Amount of time before an auto restart happens
        start_time: 0,      //Last time started, used with min_uptime to determine uptime
        min_uptime: 10000,  //Milliseconds before bot is considered successfully started
        listening: false,   //If we're listening to the process events already
        process: null       //The child process from forking
    }
};

const client = new Discord.Client();
var reportChannel; //Discord.JS Channel where reports are sent

function log(text) {
    //Make botmanager messages easy to distinguish (Yellow)
    console.log("\x1b[33m[" + botManagerName + ".log] " + text + "\x1b[0m");
}
function error(text) {
    //Make errors red and spooky
    console.log("\x1b[31m[" + botManagerName +".err]\x1b[0m" + text);
}

function _report(embed) {
    reportChannel.send(embed);
}

function reportError(title, desc) {
    let e = new Discord.RichEmbed();
    e.setColor('#DB1111');
    e.setTitle(title);
    e.setDescription(desc);
    e.setFooter(botManagerName + ": Bot monitoring");
    _report(e);
}

function reportInfo(title, desc) {
    let e = new Discord.RichEmbed();
    e.setColor('#0FBA4D');
    e.setTitle(title);
    e.setDescription(desc);
    e.setFooter(botManagerName + ": Bot monitoring");
    _report(e);
}

function setup(bot) {
    if (bot.process && !bot.listening) {
        bot.listening = true;
        bot.process.on('exit', function (code, signal) {
            bot.listening = false;
            bot.process = null;
            if (code !== 0) { //Auto restart when code isnt 0
                if (bot.quick_restarts >= bot.max_restarts) {
                    reportError("RESTART LIMIT REACH", bot.name + " crashed within " + bot.min_uptime / 1000 + " seconds " + bot.max_restarts + " times in a row.");
                    log(bot.name + " has exited after " + bot.max_restarts + " restarts");
                } else {
                    if (Date.now() < bot.start_time + bot.min_uptime)
                        bot.quick_restarts++;
                    setTimeout(() => restart(bot), bot.restart_delay);
                }
            } else {
                reportInfo("Process stopped", bot.name + " was manually stopped");
                log(bot.name + " stopped.");
            }
        });

        bot.process.on('error', function (err) {
            reportError(bot.name + " got an error.", err);
            error(err);
        });
    }
}

function start(bot) {
    if (!bot.process || bot.process.killed) {
        bot.start_time = Date.now();
        bot.process = fork(settings.startpoint, [], { execArgv: [] });
        setup(bot);
        if (bot.restarting) reportInfo(bot.name + " restarted.", bot.name + " has been restarted and is now online again.");
        else                reportInfo(bot.name + " online.", bot.name + " has been started");
        bot.restarting = false;
    } else {
        error(bot.name + " was instructed to start but is already running.");
    }
}

function stop(bot) {
    if (bot.process && !bot.process.killed) {
        bot.process.kill();
        reportInfo(bot.name + " offline.", bot.name + " has shut down");
    } else if (!bot.restarting) {
        error(bot.name + " was instructed to stop but is not running.");
    }
}

function restart(bot) {
    bot.restarting = true;
    stop(bot);
    start(bot);
}

const commands = ["start", "stop", "restart"];
function attemptCommand(botname, command) {
    if (bots[botname]) {
        switch (command) {
            case commands[0]:
                bots[botname].quick_restarts = 0;
                start(bots[botname]);
                break;
            case commands[1]:
                stop(bots[botname]);
                break;
            case commands[2]:
                bots[botname].quick_restarts = 0;
                restart(bots[botname]);
                break;
        }
    } else if (botname === botManagerName.toLowerCase()) {
        reportInfo("Shutting down", "Will shut down in a second.");
        for (var bot in bots) {
            stop(bots[bot]);
        }
        setTimeout(() => process.exit(), 1000);
    }
}

client.on('ready', () => {
    log("Logged in as " + client.user.username + "#" + client.user.discriminator);
    botManagerName = client.user.username;

    var i, botname, command;

    if (!settings.reportchannel) {
        return error("No report channel specified.");
    }
    else if (!settings.startpoint) {
        return error("No startpoint found for the bot.");
    }
    else {
        reportChannel = client.channels.get(settings.reportchannel);
        if (!reportChannel) {
            return error("Report channel couldn't be found.");
        }
        if (!fs.existsSync(settings.startpoint)) {
            return error("Startpoint doesn't point to a file.");
        }

        log("Settings are in order.");
    }
        
    client.on("disconnect", (errMsg, code) => {
        if (errMsg || code) {
            error("[#" + code + "]" + errMsg);
            //setTimeout(() => bot.connect(), 1000);
        }
        log("Discord Bot Disconnected");
    });
    
    client.on("message", message => {
        if (message.channel === reportChannel) {
            var messagePieces = message.content.split(" ");
            if (messagePieces.length <= 2) {
                if (messagePieces[0] === "help") {
                    reportInfo("Help", "[botname] [command]\n`Commands: " + commands.join(" ") + "\nBots: " + Object.keys(bots).join(" ") + "`");
                }
                else if (messagePieces.length === 2) {
                    for (i in messagePieces) {
                        if (commands.indexOf(messagePieces[i]) > -1) {
                            command = messagePieces.splice(i, 1)[0];
                            botname = messagePieces[0];
                            attemptCommand(botname, command);
                        }
                    }
                }
            }
        }
    });

    log("Ready.");
    if (settings.autostart) {
        for (i in bots) {
            start(bots[i]);
        }
    }
});

if (settings && settings && settings.token) {
    client.login(settings.token);
} else {
    error("No login token for " + botManagerName + ".");
}
