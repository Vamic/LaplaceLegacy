'use strict';
const fs = require('fs');
const Discord = require('discord.js');
const http = require('http');
const request = require('request');
const urlf = require('url');

//Juicy secrets, no looking
const secrets = require('./secrets.json'); 

const client = new Discord.Client();

//Data storage
var datastoreURL = secrets.datastore.url,
    datastoreKey = secrets.datastore.key,
    datastore = {}; //the cache

//Other
var plugins = [],
    commands = {};


//Functions
var log = function (msg) {
    console.log(msg);
};
var error = function (msg) {
    log(msg);
};

function reloadPlugin(pluginName) {
    //Delete from cache so its actually reloading
    delete require.cache[require.resolve("./plugins/" + pluginName + ".js")];
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
                    error("Duplicate command found and skipped: plugin=" + pluginName + " command=" + command.commands);
                } else {
                    commands[command.commands[j]] = {
                        source: pluginName,
                        exec: command.exec
                    };
                }
            }
        }
        log("Loaded " + pluginName);
        return true;
    }
    catch (e) {
        error("Unable to load plugin: " + pluginName);
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
            //Reset plugin variables
            module.exports.admin.plugins = plugins = [];
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

module.exports = {
    log: log,
    error: error,
    emojis: client.emojis,
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
        kill: function () {
            log("Will die in a second.");
            setTimeout(function () {
                process.exit(0);
            }, 1000);
        },
        plugins: plugins
    }
};


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    //Set again as discord js didnt know what emojis we have until now
    module.exports.emojis = client.emojis;
});

client.on('message', msg => {
    if (msg.author.bot) return;

    //msg.mentions.MessageMentions.everyone
    //
    var msgCommand = msg.content.split(" ")[0].split(":")[0];

    for (var cmd in commands) {
        if (msgCommand === cmd) {
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
            commands[cmd].exec(data, msg);
            
        }
    }
});

client.login(secrets.token);
