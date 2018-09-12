'use strict';
const fs = require('fs');
const Discord = require('discord.js');
const http = require('http');
const request = require('request');
const urlf = require('url');
const util = require('util');

//Juicy secrets, no looking
const secrets = require('./settings/secrets.json'); 

const client = new Discord.Client();

//Data storage
var datastoreURL = secrets.datastore ? secrets.datastore.url : null,
    datastoreKey = secrets.datastore ? secrets.datastore.key : null,
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

function saveDisabledPlugins() {
    return setDatastore("disabled_plugins", disabled).catch(error);
}

async function loadDisabledPlugins() {
    let data = await getDatastore("disabled_plugins").catch(error);
    if(!data) return;
    disabled = data;
}

function enablePlugin(pluginName, guildID) {
    if (!disabled[guildID]) disabled[guildID] = {};
    if (!disabled[guildID][pluginName]) return true;
    try {
        //Remove plugin from list of disabled
        delete disabled[guildID][pluginName];
        if (extensions[pluginName]) {
            for (var i in extensions[pluginName])
                enablePlugin(extensions[pluginName][i], guildID);
        }
        //Save changes
        saveDisabledPlugins();
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
        //Set the plugin to disabled
        disabled[guildID][pluginName] = true;
        if (extensions[pluginName]) {
            //Disable each plugin extending this one
            for (var i in extensions[pluginName])
                disablePlugin(extensions[pluginName][i], guildID);
        }
        //Save changes
        saveDisabledPlugins();
        return true;
    }
    catch (e) {
        error("Unable to disable plugin: " + pluginName);
        error(e.message);
        return false;
    }
}


function reloadPlugins() {
    return new Promise((resolve, reject) => {
        fs.readdir('plugins', function (err, files) {
            if (err) {
                error("Couldn't load plugins.");
                error(err);
                reject("Couldn't read plugins directory.");
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
                        var currentSuccess = reloadPlugin(plugin, true);
                        success = currentSuccess && success;
                        if (currentSuccess) successCount++;
                        else failCount++;
                    }
                }
                log("Reloaded " + successCount + " plugins, " + (success ? "none failed." : failCount + " failed."));
                if(!success)
                    return reject("Couldn't load some plugins. " + failCount + " failed.");
                return resolve();
            } catch (err) {
                error("Couldn't load plugins.");
                error(err);
                reject("Couldn't load one or more plugins");
            }
        });
    });
}

async function loadFromFile(key) {
    if(!/^[\w,\s.-]+$/.test(key)) throw "Illegal filename";
    let path = `./tmp/${key}.json`;
    if(!fs.existsSync(path)) return null;
    return JSON.parse(await util.promisify(fs.readFile)(path));
}

async function saveToFile(key, data) {
    if(!/^[\w,\s.-]+$/.test(key)) throw "Illegal filename";
    data = JSON.stringify(data);
    return util.promisify(fs.writeFile)(`./tmp/${key}.json`, data);
}

async function getDatastore(key) {
    if (datastore[key]) {
        //log("Returning cached Datastore for " + key);
        return JSON.parse(JSON.stringify(datastore[key])); // Make sure object is cloned
    } else {
        if(datastoreURL && datastoreKey) {
            var url = datastoreURL + "get?key=" + datastoreKey + "&datakey=" + key;
            try {
                let data = await httpGetJson(url, true);
                log("Got Datastore for " + key);
                datastore[key] = data;
                return JSON.parse(JSON.stringify(datastore[key])); // Make sure object is cloned
            } catch(err) {
                error("Error getting Datastore for " + key + ": " + err.message);
                throw err;
            }
        } else {
            let data = await loadFromFile("datastore").catch(error);
            if(data){
                datastore = data;
                if(datastore[key]) return JSON.parse(JSON.stringify(datastore[key]));
            } 
        }
        return {};
    }
}

async function setDatastore(key, data) {
    var sdata = JSON.stringify(data);
    datastore[key] = JSON.parse(sdata); // Make sure object is cloned
    if(datastoreURL && datastoreKey) {
        sdata = Buffer(sdata);
        try {
            let data = await httpPost(datastoreURL + "set?key=" + datastoreKey + "&datakey=" + key, sdata, true);
            //log("Set Datastore for " + key);
            return data;
        } catch(err) {
            error("Error setting Datastore for " + key + ": " + err.message);
            throw err;
        }
    } else {
        return saveToFile("datastore", datastore);
    }
}

function removePossiblyDangerousInformation(str) {
    return str.replace(/([?&]k(?:ey)*=).*?([&])/g, "$1[API KEY]$2");
}

function httpGet(url, silent, headers, _retries) {
    return new Promise((resolve, reject) => {
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
                    reject(err);
                } else {
                    return httpGet(url, silent, headers, retries + 1);
                }
            }
    
            resolve(body);
        });
    });
}

async function httpGetJson(url, silent, headers) {
    let data = await httpGet(url, silent, headers);

    var jsondata;
    try {
        jsondata = JSON.parse(data);
    } catch (ex) {
        if (data === "")
            throw("Empty response body."); //Used in search for gelbooru because no hits = nothing in response
        else
            throw(ex);
    }
    return jsondata;
}

async function httpGetXml(url, silent, headers) {
    let data = await httpGet(url, silent, headers);

    var { parseString } = require("xml2js").Parser({ mergeAttrs: true });

    if (!silent) log("[XML PARSE] " + removePossiblyDangerousInformation(url));
    return new Promise((resolve, reject) => {
        parseString(data, (err, res) => {
            if(err) reject(err);
            else resolve(res);
        });
    });
}

function httpPost(url, data, silent, headers) {
    return new Promise((resolve, reject) => {
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
                resolve(body);
            });
        });
    
        req.on("error", function (err) {
            error("[HTTP POST] " + removePossiblyDangerousInformation(url) + " error: " + err.message);
            reject(err);
        });
    
        req.write(data);
        req.end();
    });
}

function checkRequirements(requirements, message) {
    if (!requirements) return [true];
    for (var i = 0; i < requirements.length; i++) {
        if (!requirements[i](message)) return [false, requirements[i].name];
    }
    return [true];
}

function callHooks(hook) {
    log("Calling hook: \"" + hook + "\"");
    for (var i in hooks[hook]) {
        hooks[hook][i]();
    }
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
        httpGetXml: httpGetXml,
        httpPost: httpPost,
        save: saveToFile,
        load: loadFromFile
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
        extensions: extensions,
        kill: function () {
            log("Will die in a second.");
            setTimeout(function () {
                process.exit(0);
            }, 1000);
        }
    }
};

client.on('ready', async () => {
    log(`Logged in as ${client.user.tag}!`);
    //Set again as discord js didnt know what emojis we have until now
    module.exports.emojis = client.emojis;
    //ditto
    module.exports.user = client.user;

    if(!datastoreURL || !datastoreKey) {
        log("No datastore specified, data saved to it will be saved locally instead.", "info");
    }

    //Load em up
    await reloadPlugins().catch(error);
    await loadDisabledPlugins();
    module.exports.admin.disabled = disabled;

    commands["!help"] = {
        source: "",
        usage: "Shows this.",
        requirements: [requirements.isUser],
        exec: helpCommand
    };

    callHooks("ready");
});

client.on("error", (data) => {
    error(data.error);
});

client.on("voiceStateUpdate", (member, update) => {
    let action = {
        joined : null,
        left : null, 
        muted : false,
        unmuted : false,
        deafened : false,
        undeafened : false,
    }
    let guild = member.guild;
    
    if(update.voiceChannelID != member.voiceChannelID) {
        if(update.voiceChannelID) 
            action.joined = guild.channels.get(update.voiceChannelID);
        if(member.voiceChannelID)
            action.left = guild.channels.get(member.voiceChannelID);
    } else {
        if(!member.selfMute && update.selfMute || !member.serverMute && update.serverMute)
            action.muted = true;
        else if(member.selfMute && !update.selfMute || member.serverMute && !update.serverMute)
            action.unmuted = true;
            
        if(!member.selfDeaf && update.selfDeaf || !member.serverDeaf && update.serverDeaf)
            action.deafened = true;
        else if(member.selfDeaf && !update.selfDeaf || member.serverDeaf && !update.serverDeaf)
            action.undeafened = true;
    }

    let oldChannel = member.voiceChannelID ? guild.channels.get(member.voiceChannelID) : null;
    let newChannel = update.voiceChannelID ? guild.channels.get(update.voiceChannelID) : null;
    
    if(member.user == client.user) {
        //Bot state changed
        if(guild.voiceConnection) {
            if(!action.muted && !action.unmuted && !action.deafened && !action.undeafened)
                log("VoiceStateUpdate: Joined voice channel \"" + newChannel.name + "\"");
        } else {
            log("VoiceStateUpdate: Left voice channel \"" + oldChannel.name + "\"");
        }
    } else {
        //User state changed
        if(guild.voiceConnection) {
            if(action.left == guild.voiceConnection.channel) {
                //console.log("User left bot's voice channel");
            }
            if(action.joined == guild.voiceConnection.channel) {
                //console.log("User joined bot's voice channel");
            }
        }
    }
});

function checkCommands(msg) {
    let input = msg.content;
    let isAlexa = false;
    let alexaRegex = /^(?:laplace|alexa),? /i;
    if(alexaRegex.test(input)) {
        isAlexa = true;
        input = input.replace(alexaRegex, "!");
    }
    var msgCommand = input.split(" ")[0].split(":")[0].toLowerCase();
    var foundCmd, cmdUsed, softCmd, softCmdUsed;

    for (var cmd in commands) {
        if (msg.guild && disabled[msg.guild.id] && disabled[msg.guild.id][commands[cmd].source])
            continue;
        //If we get an exact match
        if (msgCommand === cmd || input.toLowerCase() === cmd) {
            foundCmd = commands[cmd];
            cmdUsed = cmd;
            break;
        //If it starts with the command, followed by a space or : or newline
        } else if (input.toLowerCase().startsWith(cmd)) {
            var char = input[cmd.length];
            if (/ |:|\r?\n|\r/.test(char)) {
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
        var [passes, requirement] = checkRequirements(foundCmd.requirements, msg);
        if (!passes) {
            log(cmdUsed + " triggered by " + msg.author.username + " with \"" + msg.content + "\" (Failed requirement '" + requirement + "') ")
            if (!requirement || requirement === "isUser" || requirement === "isBot" || isAlexa) return;
            return msg.reply("Nope, failed requirement: " + requirement);
        }
        var content = input.replace(cmdUsed, "");

        //Get arguments (words separated by spaces or newlines)
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
        log(cmdUsed + " triggered by " + msg.author.username + " with \"" + msg.content + "\"");
        foundCmd.exec(data, msg);
    }
    return foundCmd;
}

client.on('message', msg => {
    if (process.env["BOT_TESTING"] == "true") {
        if(!msg.guild || msg.guild.id != process.env["BOT_TEST_SERVER"])
            return;
        //msg.content = msg.content.substr(1);
    }

    if (!msg.author.bot) {
        if(checkCommands(msg))
            return;
    }

    //Catches messages that match custom requirements
    //example: message from another bot with embed with specific title
    if (Object.keys(rCommands).length) {
        for (var i in rCommands) {
            var rCmd = rCommands[i];
            if (msg.guild && disabled[msg.guild.id] && disabled[msg.guild.id][rCmd.source])
                continue;
            var [passes, requirement] = checkRequirements(rCmd.requirements, msg);
            if (passes) {
                log(i + " triggered by " + msg.author.username + " with \"" + msg.content + "\"");
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

log("Logging in to Discord");

client.login(process.env["TOKEN"] || secrets.token);
