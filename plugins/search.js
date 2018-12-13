var bot = module.parent.exports;

const { google } = bot.secrets.keys && bot.secrets.keys.google ? require('googleapis') : null;
const customSearch = google.customsearch('v1').cse;

const searchEngineID = "002100658904403526277:rp_ixt2vd6i";

async function googleImageSearch(term, fileType) {
    var result = await customSearch.list({
        q: term,
        cx: searchEngineID,
        start: Math.floor(20*Math.random()),
        num: 1,
        searchType: "image",
        fileType: fileType,
        auth: bot.secrets.keys.google
    });

    return result.data.items && result.data.items[0].link;
} 
async function googleSearch(term, fileType) {
    var result = await customSearch.list({
        q: term,
        cx: searchEngineID,
        start: Math.floor(20*Math.random()),
        num: 1,
        auth: bot.secrets.keys.google
    });

    return result.data.items && result.data.items[0].link;
} 

var lastSearches = {
    //<user_id> : [<args>]
};

const isImplyingImageRegex = /^>(.+)\.(png|jpe?g|gif|bmp|webp|svg)$/;

const searchTargets = module.exports.searchTargets || {}
if(google != null) {
    searchTargets.google = {
        names: ["g", "google"],
        exec: async function (args, mods, message) {
            if(args) args.shift(); //Remove "g" or "google"
            if (args.length == 0) return;
            var search = args.join(" ");
            let result = await googleSearch(search).catch(bot.error);
            message.channel.send(`"${search}": ${result}`);
        }
    };
    searchTargets.googleimages = {
        names: ["gi", "googleimages"],
        exec: async function (args, mods, message) {
            if(args) args.shift(); //Remove "gi" or "googleimages"
            var search, fileType;
            if(!args) {
                var regexResult = isImplyingImageRegex.exec(message.content);
                var fileType = regexResult[2];
                var search = regexResult[1];
            } else if (args.length == 0) {
                return;
            } else {
                search = args.join(" ");
                fileType = mods.length ? mods[0] : null;
            }
            let imageUrl = await googleImageSearch(search, fileType).catch(bot.error);
            if(!imageUrl) return message.channel.send("Nobody here but us reptiles!");
            if(!fileType) {
                var regres = /\.(\w{3,4})$/.exec(imageUrl);
                if(regres.length > 1) {
                    fileType = regres[1];
                } else {
                    fileType = "pingas";
                }
            }
            message.channel.send(new bot.RichEmbed().setImage(imageUrl).setDescription(`[${search}.${fileType}](${imageUrl})`));
        }
    };
}

exports.commands = {
    search: {
        commands: ["!s", "!search"],
        description: "Search for stuff",
        exec: async function (command, message) {
            var args = command.arguments;
            var mods = command.modifiers;
            if (!args.length) {
                args = lastSearches[message.author.id];
            } else {
                lastSearches[message.author.id] = args;
            }
            var firstArg = args[0];
            for(const target of Object.values(searchTargets)) {
                if(target.names.indexOf(firstArg) > -1) {
                    return target.exec(args, mods, message);
                }
            }
        }
    },
    implyingimagesearch: {
        commands: [""],
        requirements: [bot.requirements.isUser, (msg) => isImplyingImageRegex.test(msg.content)],
        exec: async (message) => searchTargets.googleimages.exec(null, null, message)        
    }
};

exports.searchTargets = searchTargets;