var bot = module.parent.exports;
const VNDB = require('vndb-api')

// Create a client
const vndb = new VNDB('Laplace', {
    minConnection: 0
});

exports.commands = {
    vndbquote: {
        commands: ["!vndb quote", "!vn quote", "!vndb q", "!vn q"],
        exec: async function (command, message) {
            console.log(vndb);
            try {
                var result = await vndb.query(`get quote basic (id>=1) {"results":1}`);
                var quote = result.items[0];
                message.channel.send(new bot.MessageEmbed()
                    .setDescription(`_"${quote.quote}"_`)
                    .addFields(
                        { name: '\u200B', value: `[${quote.title}](https://vndb.org/v${quote.id})` },
                    ));
            }
            catch (err) {
                console.log("err", err);
            }
        }
    }
};
