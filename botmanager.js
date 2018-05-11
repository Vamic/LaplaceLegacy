const fork = require('child_process').fork;
const settings = require('./secrets.json').botmanager;
const Discord = require("discord.js");
const fs = require('fs'); //Used to check if the startpoint points to a start

var botManagerName = "BotManager";
var botManagerPaused = false;
const bots = {
    laplace: {              //Object name is used in commands, recommended to be the same as name property but lowercase
        name: "Laplace",    //Display name in reports and console
        restarting: false,  //Makes the log quieter when restarting
        quick_restarts: 0,  //Amount of restarts done automatically within the min_uptime time limit in a row
        max_restarts: 2,    //Amount of quick_restarts before bot stops restarting automatically
        restart_delay: 1000, //Amount of milliseconds before an auto restart happens
        start_time: 0,      //Last time started, used with min_uptime to determine uptime
        min_uptime: 10000,  //Milliseconds before bot is considered successfully started
        listening: false,   //If we're listening to the process events already
        process: null,      //The child process from forking
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
    return reportChannel.send(embed);
}

function reportError(title, desc) {
    let e = new Discord.RichEmbed();
    e.setColor('#DB1111');
    e.setTitle(title);
    e.setDescription(desc);
    e.setFooter(botManagerName + ": Bot monitoring");
    return _report(e);
}

function reportInfo(title, desc) {
    let e = new Discord.RichEmbed();
    e.setColor('#0FBA4D');
    e.setTitle(title);
    e.setDescription(desc);
    e.setFooter(botManagerName + ": Bot monitoring");
    return _report(e);
}

process.on("uncaughtException", (err) => {
    reportError(botManagerName + " crashed.", err);
    for (var bot in bots) {
        stop(bots[bot]);
    }
    setTimeout(() => process.exit(), 1000);
});


function isAlive(bot) {
    return bot.process && !bot.process.killed;
}

function formatCrashResponse(bot) {
    if (bot.quick_restarts >= bot.max_restarts) {
        log(bot.name + " has exited after " + bot.max_restarts + " restarts");
        if (bot.max_restarts > 0) {
            return {
                title: bot.name + " reached the restart limit",
                description: bot.name + " crashed within " + (bot.min_uptime / 1000) + " seconds " + bot.max_restarts + " times in a row."
            };
        }
        else {
            return {
                title: bot.name + " crashed",
                description: bot.name + " crashed and is not allowed automatic restarts.\nRun `" + bot.name + " restart` to get it back online."
            };
        }
    } else {
        return {
            title: bot.name + " crashed",
            description: bot.name + " crashed and will restart. " + bot.quick_restarts + "/" + bot.max_restarts + " restarts."
        };
    }
}

function handleStatusMessage(type, bot, args) {
    switch (type) {
        case "initial":
            clearTimeout(bot.success_timeout);
            var restarting = bot.restarting;
            bot.success_timeout = setTimeout((restarting, bot) => {
                if (isAlive(bot)) {
                    handleStatusMessage("success", bot, { restarting });
                }
            }, bot.min_uptime, restarting, bot);
            if (bot.status_message) return false;
            bot.status_message = "waiting";
            if (args.report_type == "error")
                reportError(args.title, args.description).then(msg => {
                    bot.status_message = msg;
                });
            else
                reportInfo(args.title, args.description).then(msg => {
                    bot.status_message = msg;
                });
            break;
        case "success":
            var editMessage = function (restarting) {
                var newEmbed = new Discord.RichEmbed(bot.status_message.embeds[0]);
                delete newEmbed.footer.embed;
                newEmbed.setColor("#0FBA4D");

                if (args.restarting) {
                    newEmbed.setTitle(bot.name + " restarted.");
                    newEmbed.setDescription(bot.name + " has been restarted and is now online again.");
                }
                else {
                    newEmbed.setTitle(bot.name + " online.");
                    newEmbed.setDescription(bot.name + " has been started.");
                }

                bot.status_message.edit(newEmbed);
                delete bot.status_message;
            }
            if (bot.status_message && bot.status_message !== "waiting") editMessage(args.restarting);
            else if (bot.status_message === "waiting") {
                bot.status_message = "handled";
                var interval = setInterval((callback, args) => {
                    if (bot.status_message && bot.status_message !== "handled") {
                        callback(args);
                        clearInterval(interval);
                    }
                }, 500, editMessage, args.restarting);
                setTimeout(() => clearInterval(interval), 20000);
            } else {
                return false;
            }
            break;
        case "crash":
            clearTimeout(bot.success_timeout);
            var editMessage = function (final) {
                var newEmbed = new Discord.RichEmbed(bot.status_message.embeds[0]);
                delete newEmbed.footer.embed;
                newEmbed.setColor("#DB1111");
                
                var final = bot.quick_restarts >= bot.max_restarts;

                var reponse = formatCrashResponse(bot);
                newEmbed.setTitle(reponse.title);
                newEmbed.setDescription(reponse.description);

                bot.status_message.edit(newEmbed);
                if (final) delete bot.status_message;
            }
            if (bot.status_message && bot.status_message !== "waiting") editMessage();
            else if (bot.status_message === "waiting") {
                bot.status_message = "handled";
                var interval = setInterval((callback, args) => {
                    if (bot.status_message && bot.status_message !== "handled") {
                        callback(args);
                        clearInterval(interval);
                    }
                }, 500, editMessage);
                setTimeout(() => clearInterval(interval), 20000);
            } else {
                return false;
            }
            break;
    }
    return true;
}

function setup(bot) {
    if (bot.process && !bot.listening) {
        bot.listening = true;
        bot.process.on('exit', function (code, signal) {
            bot.listening = false;
            bot.process = null;
            if (code) {
                var status_handled = handleStatusMessage("crash", bot);
                if (bot.quick_restarts >= bot.max_restarts) {
                    if (!status_handled) {
                        var response = formatCrashResponse(bot);
                        reportError(response.title, response.description);
                    }
                } else {
                    if (Date.now() < bot.start_time + bot.min_uptime)
                        bot.quick_restarts++;
                    else
                        bot.quick_restarts = 0;
                    setTimeout(() => restart(bot), bot.restart_delay);
                    if (!status_handled) {
                        var message = formatCrashResponse(bot);
                        handleStatusMessage("initial", bot, {
                            title: message.title,
                            description: message.description,
                            report_type: "error"
                        });
                    }
                }
            } else {
                if (bot.restarting) {
                    start(bot);
                } else {
                    reportInfo("Process stopped", bot.name + " was manually stopped");
                    log(bot.name + " stopped.");
                }
            }
        });

        bot.process.on('error', function (err) {
            reportError(bot.name + " got an error.", err);
            error(err);
        });

        bot.process.stderr.on('data', err => {
            error("[stderr] " + bot.name + " got an error." + err);
            reportError(bot.name + " got an error.", err);
        });
    }
}

function start(bot) {
    if (!isAlive(bot)) {
        bot.start_time = Date.now();
        bot.process = fork(settings.startpoint, [], {
            execArgv: [],
            stdio: [process.stdin, process.stdout, 'pipe', 'ipc'] //Give it its own stderr so we can listen to it
        });
        setup(bot);
        var restarting = bot.restarting;
        handleStatusMessage("initial", bot, {
            title: bot.name + " starting.",
            description: bot.name + " is starting up..."
        });                        
        bot.restarting = false;
        log(bot.name + " started.");
    } else {
        error(bot.name + " was instructed to start but is already running.");
    }
}

function stop(bot) {
    if (isAlive(bot)) {
        bot.process.kill();
        log(bot.name + " stopped.");
    } else if (!bot.restarting) {
        error(bot.name + " was instructed to stop but is not running.");
    }
}

function restart(bot) {
    bot.restarting = true;
    if (!isAlive(bot))
        start(bot);
    else
        stop(bot);
}

const commands = ["start", "stop", "restart"];
const hiddencommands = ["pause", "unpause", "resume"];
function attemptCommand(botname, command) {
    if (bots[botname] && !botManagerPaused) {
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
        if (!botManagerPaused) {
            switch (command) {
                case commands[0]:
                    reportInfo("??", "?????");
                    break;
                case commands[1]:
                    reportInfo("Shutting down", "Will shut down in a second.");
                    for (var bot in bots) {
                        stop(bots[bot]);
                    }
                    setTimeout(() => process.exit(), 1000);
                    break;
                case commands[2]:
                    reportInfo("Can't do that.", botManagerName + " doesn't have a way to restart yet.");
                    break;
                case hiddencommands[0]:
                    reportInfo("Paused command handling", botManagerName + " will not respond until `unpause` is run.");
                    botManagerPaused = true;
                    break;
            }
        } else {
            switch (command) {
                case hiddencommands[1]:
                case hiddencommands[2]:
                    reportInfo("Resumed command handling", botManagerName + " will begin normal operation.");
                    botManagerPaused = false;
                    break;
            }
        }
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
                        if (commands.indexOf(messagePieces[i]) > -1 || hiddencommands.indexOf(messagePieces[i]) > -1) {
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
