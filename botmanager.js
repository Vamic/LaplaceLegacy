const { fork, spawn } = require('child_process');
const settings = require('./settings/botmanager.json');
const Discord = require("discord.js");
const fs = require('fs'); //Used to check if the startpoint points to a start

var botManagerName = settings.name || "Botmanager";
var botManagerPaused = false;
var git_result;
const bots = {};
for(var bot of settings.bots) {
    if (!bot.name || bot[bot.name] || bot.name === settings.name) {
        error("Skipping bot: No name provided.");
        continue;
    }
    
    if (!fs.existsSync(bot.startpoint)) {
        error("Skipping [" + bot.name + "] : Startpoint doesn't point to a file.");
        continue;
    }

    bots[bot.name.toLowerCase()] = {
        name: bot.name,     //Display name in reports and console
        startpoint: bot.startpoint,
        autostart: bot.autostart,
        env: bot.env,
        max_restarts: isNaN(bot.max_restarts) ? 2 : bot.max_restarts,       //Amount of quick_restarts before bot stops restarting automatically
        restart_delay: isNaN(bot.restart_delay) ? 1000 : bot.restart_delay, //Amount of milliseconds before an auto restart happens
        min_uptime: isNaN(bot.min_uptime) ? 10000 : bot.min_uptime,         //Milliseconds before bot is considered successfully started
        quick_restarts: 0,  //Amount of restarts done automatically within the min_uptime time limit in a row
        start_time: 0,      //Last time started, used with min_uptime to determine uptime
        listening: false,   //If we're listening to the process events already
        restarting: false,  //Makes the log quieter when restarting
        process: null,      //The child process from forking
    }
}

const client = new Discord.Client();
var reportChannel; //Discord.JS Channel where reports are sent

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
                var newEmbed = new Discord.MessageEmbed(bot.status_message.embeds[0]);
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
                var newEmbed = new Discord.MessageEmbed(bot.status_message.embeds[0]);
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
                    setTimeout(() => restart(bot, true), bot.restart_delay);
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
            reportError(bot.name + " got an error.", err);
            error("[stderr]");
            error(err);
        });
    }
}

function start(bot) {
    if (!isAlive(bot)) {
        bot.start_time = Date.now();
        bot.process = fork(bot.startpoint, [], {
            env: bot.env ? bot.env : {},
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

function restart(bot, force) {
    if (isAlive(bot)){
        bot.restarting = true;
        stop(bot);
    }
    else {
        if(force)
            start(bot);
        else
            reportInfo(bot.name + " is not on.", "Tried to restart a bot that is not on, use `start "+ bot.name +"` to turn it on.");
    }
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

    //Defaults to the username of the discord account if no name is set in settings
    if (!settings.name)
        botManagerName = client.user.username;

    var i, botname, command;

    if (!settings.reportchannel) {
        return error("No report channel specified.");
    }
    else {
        reportChannel = client.channels.cache.get(settings.reportchannel);
        if (!reportChannel) {
            return error("Report channel couldn't be found.");
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
            var pieces = message.content.split(" ");
            if (pieces.length <= 3) {
                if (pieces[0] === "help") {
                    reportInfo("Help", "[botname] [command]\n`Commands: " + commands.join(" ") + "\nBots: " + Object.keys(bots).join(" ") + "`");
                }
                else if (pieces[0] === "git") {
                    if(pieces.length < 2)
                        message.channel.send("gud");
                    else if(pieces[1]  === "pull") {
                        const branch = pieces[2] ? pieces[2] : "";
                        
                        gitPull(branch);
                    }
                }
                else if (pieces.length === 2) {
                    for (i in pieces) {
                        if (commands.indexOf(pieces[i]) > -1 || hiddencommands.indexOf(pieces[i]) > -1) {
                            command = pieces.splice(i, 1)[0];
                            botname = pieces[0];
                            attemptCommand(botname, command);
                            break; 
                        }
                    }
                }
            }
        }
    });

    client.on("error", (data) => {
        error(data.error);
    });

    log("Ready.");
    
    for (i in bots) {
        if(bots[i].autostart) start(bots[i]);
    }
});

function gitPull(branch) {
    const args = ['pull', 'origin'];
    if (typeof branch === "string" && branch.length > 0) args.push(branch);
    const git = spawn('git', args, {
            execArgv: [],
            stdio: [process.stdin, 'pipe', 'pipe', 'ipc']
        });
    git_result = [];

    git.stdout.on('data', function(data){
        git_result.push(data);
        log(data);
    });

    git.stderr.on('data', function(data){
        reportError("[git.stderr]", data);
        error(data);
    });

    git.on('error', function (err) {
        reportError("Git got an error.", err);
        error(err);
    });
    
    git.on('close', function() {
        reportInfo("Git finished", git_result.join("\n"));
        log("Git finished:\n" + git_result.join("\n"));
    });
}

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

function reportError(title, desc = "\u200b") {
    let e = new Discord.MessageEmbed();
    e.setColor('#DB1111');
    e.setTitle(title);
    e.setDescription(desc);
    e.setFooter(botManagerName + ": Bot monitoring");
    return _report(e);
}

function reportInfo(title, desc = "\u200b") {
    let e = new Discord.MessageEmbed();
    e.setColor('#0FBA4D');
    e.setTitle(title);
    e.setDescription(desc);
    e.setFooter(botManagerName + ": Bot monitoring");
    return _report(e);
}

if (settings && settings && settings.token) {
    client.login(settings.token);
} else {
    error("No login token for " + botManagerName + ".");
}
