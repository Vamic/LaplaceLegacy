var bot = module.parent.exports;

var cmds = {
    add: ["add", "a"],
    remove: ["remove", "delete", "r", "d"],
    move: ["move", "swap", "switch", "m", "s"]
};

function contains(lst, val) {
    return lst.indexOf(val) !== -1;
}

exports.commands = {
    do: {
        usage: "[index/indices to remove]",
        commands: ["!do"],
        exec: function (command, message) {
            var args = command.arguments;
            var userId = message.author.id;
            bot.datastore.get("todo_" + userId, function (err, data) {
                if (err)
                    return;

                //Guy doesn't have a todo
                if (!data.todo) {
                    message.reply("No.");
                } else if (args.length > 0) {
                    var toRemove = [];
                    for (var i = 0; i < args.length; i++) {
                        var arg = args[i];
                        //index is number && is in bounds
                        if (!isNaN(arg) && data.todo.notes[arg]) {
                            toRemove.push(arg);
                        }
                    }
                    if (toRemove.length > 0) {
                        var removed = [];

                        //Remove in descending order 
                        toRemove.sort((a, b) => b - a);
                        for (var j = 0; j < toRemove.length; j++) {
                            removed.push(data.todo.notes.splice(toRemove[j], 1));
                        }

                        //Build response: "youve done 1, 2 and 3."
                        var response = "You have done " + removed.join(", ");
                        if (removed.length > 1) {
                            var pos = response.lastIndexOf(", ");
                            response = response.substr(0, pos) + " and " + response.substr(pos + 2);
                        }
                        response += ".";
                        
                        bot.datastore.set("todo_" + userId, data, function (err, data) {
                            if (err)
                                message.channel.send("Couldn't save the list.");
                            else
                                message.channel.send(response);
                        });
                    } else {
                        message.channel.send("What");
                    }
                }
            });
        }
    },
    todo: {
        usage: "[text to add] or [index to remove] or [two indices to swap]",
        commands: ["!todo"],
        exec: function (command, message) {
            var args = command.arguments;
            var userId = message.author.id;
            bot.datastore.get("todo_" + userId, function (err, data) {
                if (err)
                    return;

                //First time initialization
                if (!data.todo) {
                    data.todo = {
                        notes: []
                    };
                }

                if (args.length) {
                    if (args.length === 2 && args[0] > -1 && args[1] > -1) {
                        if (!data.todo.notes[args[0]] || !data.todo.notes[args[1]])
                            return message.channel.send("Can't relocate item " + args[0] + " and " + args[1] + ".");
                        var temp = data.todo.notes[args[0]];
                        data.todo.notes[args[0]] = data.todo.notes[args[1]];
                        data.todo.notes[args[1]] = temp;
                        bot.datastore.set("todo_" + userId, data, function (err, data) {
                            if (err)
                                message.channel.send("Couldn't save the list.");
                            else
                                message.channel.send("Moved items.");
                        });
                    } else {
                        data.todo.notes.push(args.join(" "));
                        bot.datastore.set("todo_" + userId, data, function (err, data) {
                            if (err)
                                message.channel.send("Couldn't save the list.");
                            else
                                message.channel.send("Added.");
                        });

                    }
                } else {
                    var response = "";
                    for (var i = 0; i < data.todo.notes.length; i++)
                        response += i + ": " + data.todo.notes[i] + "\n";
                    message.channel.send("```\n" + response + "```");
                }
            });
        }
    },
    newlist: {
        usage: "[list name]",
        commands: ["!newlist"],
        exec: function (command, message) {
            var args = command.arguments;
            var userId = message.author.id;
            if (args.length > 0) {
                var storageName = "lists_" + userId;
                bot.datastore.get(storageName, function (err, data) {
                    if (err)
                        return;

                    //Check if initialized
                    if (!data.lists) {
                        data.lists = {};
                    }

                    data.lists[args[0]] = [];

                    bot.datastore.set(storageName, data, function (err, data) {
                        if (err)
                            message.channel.send("Couldn't save the list.");
                        else
                            message.channel.send("List added.");
                    });
                });
            }
        }
    },
    lists: {
        commands: ["!list", "!lists"],
        usage: "[list name] [add|delete|move] [thing(s)|index(es)|indexes]\nex: \n!list bestgirls add shinobu\nmichiru\n!list shoppinglist remove 0 2 3 4\n!list add [name of new list]",
        description: "Lists are fun!",
        exec: function (command, message) {
            var args = command.arguments;
            var userId = message.author.id;
            var storageName = "lists_" + userId;
            var i;
            bot.datastore.get(storageName, function (err, data) {
                if (err)
                    return;

                //Check if initialized
                if (!data.lists) {
                    data.lists = {};
                }

                var response = "";
                var send = false;
                if (args.length) {
                    var list = args[0];
                    var firstArg = args[0];

                    //Check if list exists
                    if (args.length === 1 && data.lists[firstArg]) {
                        if (data.lists[firstArg]) {
                            for (i = 0; i < data.lists[firstArg].length; i++) {
                                response += i + ": " + data.lists[firstArg][i] + "\n";
                            }
                        }
                    }
                    else if (!data.lists[firstArg]
                        && !contains(cmds.add, firstArg)
                        && !contains(cmds.remove, firstArg)) {
                        response = "404 - List not found.";
                    }
                    else {
                        //Add a new list
                        if (contains(cmds.add, firstArg) && args.length === 2) {
                            if (!data.lists[args[1]]) {
                                data.lists[args[1]] = [];
                                send = true;
                                response = "Added new list " + args[1];
                            }
                            else {
                                response = "List " + args[1] + " already exists.";
                            }
                            //Remove a list
                        } else if (contains(cmds.remove, firstArg) && args.length === 2) {
                            delete data.lists[args[1]];

                            send = true;
                            response = "Removed list " + args[1];

                            //Add item(s) to list
                        } else if (contains(cmds.add, args[1])) {
                            //Get rid of "(listnamename) add"
                            var array = args.splice(2, args.length - 2);
                            //Put the spaces back, and split on newlines
                            array = array.join(" ").split("\n");

                            data.lists[firstArg] = data.lists[firstArg].concat(array);

                            send = true;
                            response = "Added to " + firstArg;

                            //Remove item from list
                        } else if (contains(cmds.remove, args[1])) {
                            var indexes = args.splice(2, args.length - 2);
                            for (var i = 0; i < indexes.length; i++) {
                                if (indexes[i] > -1 && indexes[i] < data.lists[firstArg].length)
                                    response += data.lists[firstArg].splice(indexes[i], 1) + "\n";
                            }
                            send = true;
                            response = "Removed:\n" + response;

                            //Switch two items
                        } else if (contains(cmds.move, args[1])) {
                            if (!data.lists[firstArg][args[2]] || !data.lists[firstArg][args[3]])
                                response = "Can't relocate item " + args[2] + " and " + args[3] + ".";
                            else {
                                var temp = data.lists[firstArg][args[2]];
                                data.lists[firstArg][args[2]] = data.lists[firstArg][args[3]];
                                data.lists[firstArg][args[3]] = temp;
                                send = true;
                                response = "Moved items";
                            }
                        } else {
                            response = "What";
                        }
                    }

                    //Update list
                    if (send) {
                        bot.datastore.set(storageName, data, function (err, data) {
                            if (err)
                                message.channel.send("Couldn't save the list.");
                            else
                                message.channel.send("```\n" + response + "\n```");
                        });
                    } else if (response.length) {
                        message.channel.send("```\n" + response + "```");
                    }

                    //List all lists
                } else {
                    if (Object.keys(data.lists).length === 0)
                        response = "No lists here. Use !list add [listname]";
                    else
                        response = Object.keys(data.lists).join(", ");
                    message.channel.send("```\n" + response + "\n```");
                }
            });
        }
    }
};