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
        exec: async function (command, message) {
            var args = command.arguments;
            var userId = message.author.id;
            let data = await bot.datastore.get("todo_" + userId).catch(bot.error);
            if(!data) return;

            //Guy doesn't have a todo
            if (!data.todo) {
                message.reply("Maybe another time.");
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
                    
                    try {
                        await bot.datastore.set("todo_" + userId, data);
                        message.channel.send(response)
                    } catch(err) {
                        message.channel.send("Couldn't save the list.");
                    }
                } else {
                    message.channel.send("What");
                }
            }
        }
    },
    todo: {
        usage: "[text to add] or [index to remove] or [two indices to swap]",
        commands: ["!todo"],
        exec: async function (command, message) {
            var args = command.arguments;
            var userId = message.author.id;
            let data = await bot.datastore.get("todo_" + userId).catch(bot.error);
            if(!data) return;
            
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
                    
                    try {
                        await bot.datastore.set("todo_" + userId, data);
                        message.channel.send("Moved items.");
                    } catch(err) {
                        bot.error(err);
                        message.channel.send("Couldn't save the list.");
                    }
                } else {
                    const item = args.join(" ");
                    data.todo.notes.push(item);
                    const index = data.todo.notes.indexOf(item);
                    
                    try {
                        await bot.datastore.set("todo_" + userId, data);
                        message.channel.send(`Added \`${item}\` to index ${index}.`);
                    } catch(err) {
                        bot.error(err);
                        message.channel.send("Couldn't save the list.");
                    }
                }
            } else {
                var response = "";
                for (var i = 0; i < data.todo.notes.length; i++)
                    response += i + ": " + data.todo.notes[i] + "\n";
                message.channel.send("```\n" + response + "```");
            }
        }
    },
    newlist: {
        usage: "[list name]",
        commands: ["!newlist"],
        exec: async function (command, message) {
            var args = command.arguments;
            var userId = message.author.id;
            if (args.length > 0) {
                let storageName = "lists_" + userId;
                let data = await bot.datastore.get(storageName).catch(bot.error);
                if(!data) return;
    
                //Check if initialized
                if (!data.lists) {
                    data.lists = {};
                }

                data.lists[args[0]] = [];

                try {
                    await bot.datastore.set(storageName, data);
                    message.channel.send("List added.");
                } catch(err) {
                    message.channel.send("Couldn't save the list.");
                }
            }
        }
    },
    lists: {
        commands: ["!list", "!lists"],
        usage: "[list name] [add|delete|move] [thing(s)|index(es)|indexes]\nex: \n!list bestgirls add shinobu\nmichiru\n!list shoppinglist remove 0 2 3 4\n!list add [name of new list]",
        description: "Lists are fun!",
        exec: async function (command, message) {
            var args = command.arguments;
            var userId = message.author.id;
            var storageName = "lists_" + userId;
            var i;

            let data = await bot.datastore.get(storageName).catch(bot.error);
            if(!data) return;

            //Check if initialized
            if (!data.lists) {
                data.lists = {};
            }

            let response = "";
            let save = false;
            if (!args.length) {
                if (Object.keys(data.lists).length === 0)
                    response = "No lists here. Use !list add [listname]";
                else
                    response = Object.keys(data.lists).join(", ");
                return message.channel.send("```\n" + response + "\n```");
            }
            let firstArg = args[0];
            let listName = firstArg;
            if(contains(cmds.add, firstArg) || contains(cmds.remove, firstArg))
                listName = args[1] || ":thinking:";

            //Check if list exists
            if (args.length === 1 && data.lists[listName]) {
                if (data.lists[listName]) {
                    for (i = 0; i < data.lists[listName].length; i++) {
                        response += i + ": " + data.lists[listName][i] + "\n";
                    }
                }
            }
            else if (!data.lists[listName]
                && !contains(cmds.add, firstArg)
                && !contains(cmds.remove, firstArg)) {
                response = "404 - List not found.";
            }
            else {
                //Add a new list
                if (contains(cmds.add, firstArg) && args.length === 2) {
                    if (!data.lists[listName]) {
                        data.lists[listName] = [];
                        save = true;
                        response = "Added new list " + listName;
                    }
                    else {
                        response = "List " + listName + " already exists.";
                    }
                    //Remove a list
                } else if (contains(cmds.remove, firstArg) && args.length === 2) {
                    delete data.lists[listName];

                    save = true;
                    response = "Removed list " + listName;

                    //Add item(s) to list
                } else if (contains(cmds.add, args[1])) {
                    //Get rid of "(listnamename) add"
                    var array = args.splice(2, args.length - 2);
                    //Put the spaces back, and split on newlines
                    array = array.join(" ").split("\n");

                    data.lists[listName] = data.lists[listName].concat(array);

                    save = true;
                    response = array.length + " items added to " + firstArg;

                    //Remove item from list
                } else if (contains(cmds.remove, args[1])) {
                    let toRemove = args.splice(2, args.length - 2).sort((a,b) => b-a);
                    let removed = [];
                    while(toRemove.length) {
                        let i = toRemove.shift();
                        if(data.lists[listName][i]) {
                            removed.push(data.lists[listName].splice(i, 1));
                        }
                    }
                    save = true;
                    response = "Removed:\n" + removed.join("\n");

                    //Switch two items
                } else if (contains(cmds.move, args[1])) {
                    if (!data.lists[listName][args[2]] || !data.lists[listName][args[3]])
                        response = "Can't relocate item " + args[2] + " and " + args[3] + ".";
                    else {
                        var temp = data.lists[listName][args[2]];
                        data.lists[listName][args[2]] = data.lists[listName][args[3]];
                        data.lists[listName][args[3]] = temp;
                        save = true;
                        response = "Moved items";
                    }
                } else {
                    response = "What";
                }
            }

            //Update list
            if (save) {
                try {
                    await bot.datastore.set(storageName, data);
                } catch(err) {
                    return message.channel.send("Couldn't save the list.");
                }
            } 
            if (response.length) {
                bot.send.paginatedEmbed(message.channel, response.split("\n"), 15, new bot.RichEmbed().setTitle(`List: ${listName}`));
            } else {
                return message.channel.send("List is empty.");
            }
        }
    }
};