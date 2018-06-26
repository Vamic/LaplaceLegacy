'use strict';
const fs = require('fs');
const Discord = require('discord.js');
const http = require('http');
const request = require('request');
const urlf = require('url');

//Juicy secrets, no looking
const secrets = require('./settings/secrets.json'); 

const client = new Discord.Client();

//Data storage
var datastoreURL = secrets.datastore.url,
    datastoreKey = secrets.datastore.key,
    datastore = {}; //the cache

//Other
var plugins = [],
    hooks = {},
    disabled = {},
    extensions = {},
    commands = {},
    helpCommands = {},
    rCommands = {};

var requirements = {
    isAdmin: (msg) => secrets.admins.indexOf(msg.author.id) > -1,
    isUser: (msg) => !msg.author.bot,
    isBot: (msg) => msg.author.bot,
    guild: (msg) => msg.guild,
    direct: (msg) => !msg.guild,
    botInVoice: (msg) => msg.guild && client.voiceConnections.get(msg.guild.id),
    botNotInVoice: (msg) => !(msg.guild && client.voiceConnections.get(msg.guild.id)),
    userInVoice: (msg) => msg.member && msg.member.voiceChannel,
    userNotInVoice: (msg) => !(msg.member && msg.member.voiceChannel)
};


//Functions

var log = function (msg, type) {
    if (!type) type = "log";
    if(typeof msg === "string")
        return console.log("[Laplace." + type + "] " + msg);
        
    console.log("[Laplace." + type + "]");
    console.log(msg);
};
var warn = function (msg) {
    log(msg, "warn");
};
var error = function (msg) {
    log(msg, "err");
};

function reloadPlugin(pluginName, shush) {
    try {
        //Delete from cache so its actually reloading
        delete require.cache[require.resolve("./plugins/" + pluginName + ".js")];
        var i, j;
        //Get plugin
        var plugin = require("./plugins/" + pluginName + ".js");
        //Add plugin to the list
        if (plugins.indexOf(pluginName) < 1) plugins.push(pluginName);
        //Remove old commands
        for (i in commands) {
            if (commands[i].source === pluginName) {
                delete commands[i];
            }
        }
        //Check if this plugin is extending another
        if (plugin.extends) {
            if (!extensions[plugin.extends]) extensions[plugin.extends] = [];
            if (extensions[pluginName] && extensions[pluginName].indexOf(plugin.extends) > -1)
                warn("Infinite extensions detected between: " + pluginName + " and " + plugin.extends + "\n Ignored extensions from " + pluginName);
            else if (!extensions[plugin.extends] || extensions[plugin.extends].indexOf(pluginName) === -1)
                extensions[plugin.extends].push(pluginName);
        }
        else {
            helpCommands[pluginName] = {};
        }

        //Go through commands
        for (i in plugin.commands) {
            var command = plugin.commands[i];
            //If no commands are defined, use the name of the property
            if (!command.commands)
                command.commands = [i];

            //Initialize requirements
            if (!command.requirements) command.requirements = [];

            //Commands can be triggered by bots OR users
            if (command.requirements.indexOf(requirements.isBot) === -1)
                command.requirements.push(requirements.isUser);

            //Command that only requires the requirements met, often including custom requirements
            if (command.commands[0] === "") {
                if (!command.requirements) continue;
                rCommands[i] = {
                    source: pluginName,
                    requirements: command.requirements,
                    usage: command.usage,
                    exec: command.exec
                };
                continue;
            }

            if (helpCommands[pluginName]) {
                helpCommands[pluginName][command.commands[0]] = {
                    requirements: command.requirements,
                    usage: command.usage
                };
            }

            //Check all the ways to invoke the command
            for (j in command.commands) {
                var cmdName = command.commands[j].toLowerCase();
                //Add them to the main list of commands
                if (commands[cmdName]) {
                    if (!plugin.extends) //Ignore dupes when we're extending
                        error("Duplicate command found and skipped: plugin=" + pluginName + " command=" + command.commands[j]);
                } else {
                    commands[cmdName] = {
                        source: pluginName,
                        requirements: command.requirements,
                        usage: command.usage,
                        exec: command.exec
                    };
                }
            }
        }

        //Add hooks
        for (i in plugin.hooks) {
            if (!hooks[i]) hooks[i] = [];
            hooks[i].push(plugin.hooks[i]);
        }

        if (!shush) log("Loaded " + pluginName);
        if (extensions[pluginName]) {
            for (i in extensions[pluginName]) {
                var extensionPlugin = extensions[pluginName][i];
                if (!shush) log("Extending " + pluginName);
                reloadPlugin(extensionPlugin);
            }
        }
        return true;
    }
    catch (e) {
        error("Unable to load plugin: " + pluginName);
        error(e.message);
        return false;
    }
}

function enablePlugin(pluginName, guildID) {
    if (!disabled[guildID]) disabled[guildID] = {};
    if (!disabled[guildID][pluginName]) return true;
    try {
        delete disabled[guildID][pluginName];
        reloadPlugin(pluginName);
        if (extensions[pluginName]) {
            for (var i in extensions[pluginName])
                enablePlugin(extensions[pluginName][i]);
        }
        return true;
    }
    catch (e) {
        error("Unable to enable plugin: " + pluginName);
        error(e.message);
        return false;
    }
}

function disablePlugin(pluginName, guildID) {
    if (!disabled[guildID]) disabled[guildID] = {};
    if (disabled[guildID][pluginName]) return true;
    if (pluginName === "admin") return false;
    try {
        disabled[guildID][pluginName] = true;
        if (extensions[pluginName]) {
            for (var i in extensions[pluginName])
                disablePlugin(extensions[pluginName][i]);
        }

        var extending = require("./plugins/" + pluginName + ".js").extends;
        delete require.cache[require.resolve("./plugins/" + pluginName + ".js")];

        if (extending) {
            if (!disabled[guildID][extending])
                reloadPlugin(extending);
        }
        return true;
    }
    catch (e) {
        error("Unable to disable plugin: " + pluginName);
        error(e.message);
        return false;
    }
}


function reloadPlugins(callback) {
    fs.readdir('plugins', function (err, files) {
        if (err) {
            error("Couldn't load plugins.");
            error(err);
            if (callback)
                callback("Couldn't load one or more plugins", false);
        }
        try {
            var success = true;
            var successCount = 0;
            var failCount = 0;
            //Reset plugin variables
            module.exports.admin.plugins = plugins = [];
            commands = {};

            //Load plugins
            for (var i in files) {
                //Load .js files
                if (files[i].length > 3 && files[i].endsWith(".js")) {
                    //Get filename
                    var plugin = files[i].substr(0, files[i].length - 3);
                    if (!disabled[plugin]) {
                        var currentSuccess = reloadPlugin(plugin, true);
                        success = currentSuccess && success;
                        if (currentSuccess) successCount++;
                        else failCount++;
                    }
                }
            }
            log("Reloaded " + successCount + " plugins, " + (success ? "none failed." : failCount + " failed."));
            if(!success && callback)
                callback("Couldn't load one or more plugins", false);
            else if (callback)
                callback(null, true);
        } catch (err) {
            error("Couldn't load plugins.");
            error(err);
            if (callback)
                callback("Couldn't load one or more plugins", false);
        }
    });
}

//Load em up
reloadPlugins();

function callHooks(hook) {
    log("Calling hook: \"" + hook + "\"");
    for (var i in hooks[hook]) {
        hooks[hook][i]();
    }
}


function getDatastore(key, callback) {
    if (datastore[key]) {
        log("Returning cached Datastore for " + key);
        callback(null, JSON.parse(JSON.stringify(datastore[key]))); // Make sure object is cloned
    } else {
        var url = datastoreURL + "get?key=" + datastoreKey + "&datakey=" + key;
        httpGetJson(url, function (err, data) {
            if (err) {
                error("Error getting Datastore for " + key + ": " + err.message);
                callback(err);
                return;
            }

            log("Got Datastore for " + key);
            datastore[key] = data;
            callback(null, JSON.parse(JSON.stringify(datastore[key]))); // Make sure object is cloned
        }, true);
    }
}

function setDatastore(key, data, callback) {
    var sdata = JSON.stringify(data);
    datastore[key] = JSON.parse(sdata); // Make sure object is cloned
    sdata = Buffer(sdata);
    httpPost(datastoreURL + "set?key=" + datastoreKey + "&datakey=" + key, sdata, function (err) {
        if (err) {
            error("Error setting Datastore for " + key + ": " + err.message);
            if (callback) callback(err);
            return;
        }
        log("Set Datastore for " + key);
        if (callback) callback();
    }, true);
}

function removePossiblyDangerousInformation(str) {
    return str.replace(/([?&]k(?:ey)*=).*?([&])/g, "$1[API KEY]$2");
}

function httpGet(url, callback, silent, headers, _retries) {
    if (!silent) log("[HTTP GET]" +
        (_retries ? " (retry #" + _retries + ") " : " ") +
        removePossiblyDangerousInformation(url));

    if (!headers) headers = {};

    request({
        url: url,
        headers: headers
    }, function (err, response, body) {
        if (err) {
            var retries = _retries ? _retries : 0;
            error("[HTTP GET] " + removePossiblyDangerousInformation(url) +
                " (" + retries + "/3 retries) error: " + err.message);
            if (retries === 3) {
                error("[HTTP GET] Failed: " + err.message + "(" + err + ")");
                callback(err);
            } else {
                httpGet(url, callback, silent, headers, retries + 1);
            }
            return;
        }

        callback(null, body);
    });
}

function httpGetJson(url, callback, silent, headers) {
    httpGet(url, function (err, data) {
        if (err) {
            callback(err);
            return;
        }
        if (!silent) log("[JSON PARSE] " + removePossiblyDangerousInformation(url));
        var jsondata;
        try {
            jsondata = JSON.parse(data);
        } catch (ex) {
            if (data === "")
                callback("Empty response body."); //Used in search for gelbooru because no hits = nothing in response
            else
                callback(ex);
            return;
        }
        callback(null, jsondata);
    }, silent, headers);
}

function httpPost(url, data, callback, silent, headers) {
    var purl = urlf.parse(url);
    if (!silent) log("[HTTP POST] " + removePossiblyDangerousInformation(url));
    var post_options = {
        hostname: purl.hostname,
        port: 80,
        path: purl.path,
        method: 'POST',
        headers: {
            "User-Agent": "node.js",
            "Content-Type": "text/plain",
            "Content-Length": data.length
        }
    };

    if (headers) {
        for (var i in headers) {
            post_options.headers[i] = headers[i];
        }
    }

    var req = http.request(post_options, function (res) {
        var body = "";
        res.on("data", function (chunk) {
            body += chunk;
        });
        res.on("end", function () {
            callback(null, body);
        });
    });

    req.on("error", function (err) {
        error("[HTTP POST] " + removePossiblyDangerousInformation(url) + " error: " + err.message);
        callback(err);
    });

    req.write(data);
    req.end();
}

function checkRequirements(requirements, message) {
    if (!requirements) return [true];
    for (var i = 0; i < requirements.length; i++) {
        if (!requirements[i](message)) return [false, requirements[i].name];
    }
    return [true];
}

module.exports = {
    log: log,
    error: error,
    user: client.user,
    emojis: client.emojis,
    guilds: client.guilds,
    voiceConnections: client.voiceConnections,
    Attachment: Discord.Attachment,
    RichEmbed: Discord.RichEmbed,
    secrets: {
        keys: secrets.keys,
        admins: secrets.admins
    },
    requirements: requirements,
    util: {
        httpGet: httpGet,
        httpGetJson: httpGetJson,
        httpPost: httpPost
    },
    datastore: {
        get: getDatastore,
        set: setDatastore,
        cache: datastore
    },
    admin: {
        reloadPlugins: reloadPlugins,
        reloadPlugin: reloadPlugin,
        enablePlugin: enablePlugin,
        disablePlugin: disablePlugin,
        plugins: plugins,
        disabled: disabled,
        kill: function () {
            log("Will die in a second.");
            setTimeout(function () {
                process.exit(0);
            }, 1000);
        }
    }
};


client.on('ready', () => {
    log(`Logged in as ${client.user.tag}!`);
    //Set again as discord js didnt know what emojis we have until now
    module.exports.emojis = client.emojis;
    //ditto
    module.exports.user = client.user;

    commands["!help"] = {
        source: "",
        usage: "Shows this.",
        exec: helpCommand
    };

    callHooks("ready");
});

function checkCommands(msg) {
    var msgCommand = msg.content.split(" ")[0].split(":")[0].toLowerCase();
    var foundCmd, cmdUsed, softCmd, softCmdUsed;

    for (var cmd in commands) {
        if (msg.guild && disabled[msg.guild.id] && disabled[msg.guild.id][commands[cmd].source])
            continue;
        //If we get an exact match
        if (msgCommand === cmd || msg.content.toLowerCase() === cmd) {
            foundCmd = commands[cmd];
            cmdUsed = cmd;
            break;
        //If it starts with the command, followed by a space or :
        } else if (msg.content.toLowerCase().startsWith(cmd)) {
            var char = msg.content[cmd.length];
            if (char === " " || char === ":") {
                softCmd = commands[cmd];
                softCmdUsed = cmd;
            }
        }
    }

    if (softCmd && !foundCmd) {
        foundCmd = softCmd;
        cmdUsed = softCmdUsed;
    }

    if (foundCmd) {
        var reqs = checkRequirements(foundCmd.requirements, msg);
        if (!reqs[0]) {
            if (reqs[1] === "isUser" || reqs[1] === "isBot") return;
            return msg.reply("Nope, failed requirement: " + reqs[1]);
        }
        var content = msg.content.replace(cmdUsed, "");

        //Get arguments (words separated by spaces)
        var args = content.split(" ");
        //Take out the modifiers (words separated by : directly after the command)
        var modifiers = args.splice(0, 1)[0].split(":");

        //Remove empty elemenst
        args = args.filter(Boolean);
        modifiers = modifiers.filter(Boolean);
        var data = {
            command: cmdUsed,
            arguments: args,
            modifiers: modifiers
        };
        foundCmd.exec(data, msg);
    }
}

client.on('message', msg => {
    if (process.env["BOT_TESTING"]) {
        if(!msg.guild || msg.guild.id != process.env["BOT_TEST_SERVER"])
            return;
        msg.content = msg.content.substr(1);
    }

    if (!msg.author.bot) {
        checkCommands(msg);
    }

    //Catches messages that match custom requirements
    //example: message from another bot with embed with specific title
    if (Object.keys(rCommands).length) {
        for (var i in rCommands) {
            var rCmd = rCommands[i];
            if (msg.guild && disabled[msg.guild.id] && disabled[msg.guild.id][rCmd.source])
                continue;
            var reqs = checkRequirements(rCmd.requirements, msg);
            if (reqs[0]) {
                rCmd.exec(msg);
                return;
            }
        }
    }
    
    if (msg.author.bot) {
        checkCommands(msg);
    }
});

function helpCommand(command, message) {
    var response = new Discord.RichEmbed();
    var plugin, commands, fieldText, cmd;

    response.setTitle("Help command for helpful helping.");
    if (command.arguments.length === 0) {
        fieldText = [];
        for (var i in plugins) {
            plugin = plugins[i];
            if (plugin === "admin") continue;
            fieldText.push("**" + plugin + "**");
        }
        if (fieldText.join("").length) {
            fieldText.push("`use !help [plugin name] to see commands`");
            response.addField("Plugins", fieldText.join("\n"));
        }
    } else {
        var content = command.arguments.join(" ");
        var pIndex = plugins.indexOf(content);
        if (pIndex > -1) {
            plugin = plugins[pIndex];
            commands = helpCommands[plugin];
            fieldText = [];
            for (cmd in commands) {
                fieldText.push("**" + cmd + "**   " + (commands[cmd].usage ? "`" + commands[cmd].usage + "`" : ""));
            }
            if (fieldText.join("").length)
                response.addField(plugin, fieldText.join("\n"));
        }
    }
    message.author.send(response);
}

client.login(secrets.token);
