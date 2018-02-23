'use strict';
const fs = require('fs');
const Discord = require('discord.js');
const client = new Discord.Client();
const secrets = require('./secrets.json'); //Juicy secrets, no looking
var plugins = [];
var commands = {};

var log = function (msg) {
    console.log(msg);
};

var reloadPlugin = function (pluginName) {
    try {
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

        //Go through commands
        for (i in plugin.commands) {
            var command = plugin.commands[i];
            //Check all the ways to invoke the command
            for (j in command.commands) {
                //Add them to the main list of commands
                if (commands[command.commands]) {
                    log("Duplicate command found and skipped: plugin=" + pluginName + " command=" + command.commands);
                } else {
                    commands[command.commands[j]] = {
                        source: pluginName,
                        exec: command.exec
                    };
                }
            }
        }
        return true;
    }
    catch (e) {
        log("Unable to load plugin: " + pluginName);
        log(e.message);
        return false;
    }
};
var reloadPlugins = function (cb) {
    fs.readdir('plugins', function (err, files) {
        if (err) {
            log("Couldn't load plugins.");
            log(err);
            if (cb)
                cb("Couldn't load one or more plugins", false);
        }
        try {
            var success = true;
            //Reset plugin variables
            plugins = [];
            commands = {};

            //Load plugins
            for (var i in files) {
                //Load .js files
                if (files[i].length > 3 && files[i].endsWith(".js")) {
                    //Get filename
                    var plugin = files[i].substr(0, files[i].length - 3);
                    success = success && reloadPlugin(plugin);
                }
            }
            if(!success && cb)
                cb("Couldn't load one or more plugins", false);
            else if (cb)
                cb(null, true);
        } catch (err) {
            log("Couldn't load plugins.");
            log(err);
            if (cb)
                cb("Couldn't load one or more plugins", false);
        }
    });
};

//Load em up
reloadPlugins();

module.exports = {
    reloadPlugins: reloadPlugins,
    reloadPlugin: reloadPlugin,
    emojis: {}
};


var setupEmojis = function () {
    for (var [key, value] of client.emojis) {
        module.exports.emojis[value.name] = key;
    }
};


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    setupEmojis();
});

client.on('message', msg => {
    if (msg.author.bot) return;


    //msg.mentions.MessageMentions.everyone
    //
    for (var cmd in commands) {
        if (msg.content.startsWith(cmd)) {
            //Get arguments (words separated by spaces)
            var args = msg.content.split(" ");
            //Take out the modifiers (words separated by : directly after the command)
            var modifiers = args.splice(0, 1)[0].replace(cmd, "").split(":");
            //Remove empty elemenst
            args = args.filter(Boolean);
            modifiers = modifiers.filter(Boolean);
            var data = {
                command: cmd,
                arguments: args,
                modifiers: modifiers
            };
            var info = {
                msgId: msg.id,
                tts: msg.tts,
                channel: msg.channel,
                user: msg.author.username
            };
            commands[cmd].exec(data, info, msg);
            
        }
    }
});

client.login(secrets.token);
