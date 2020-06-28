var bot = module.parent.exports;

class ConnectFourColumn extends Array {
    constructor(args) {
        super(args);
        Object.defineProperty(this,'nextSpace',{
            value: 1,
            enumerable: false,
            iterable: false,
            writable: true
        });
    }
}

class ConnectFourBoard {
    constructor() {
        this.columns = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣"];
        this.circles = {
            red: "🔴",
            blue: "🔵",
            white: "⚪"
        };
        this.redsMove = false;
        this.board = this.initializeBoard();
    }

    initializeBoard() {
        var board = [];
        for (var x = 0; x < 7; x++) {
            board.push(new ConnectFourColumn());
            for (var y = 0; y < 6; y++) {
                board[x].push(this.circles.white);
            }
        }
        return board;
    }

    playMove(column) {
        if (this.board[column].nextSpace == 7) return false;
        this.board[column][this.board[column].nextSpace] = this.redsMove ? this.circles.red : this.circles.blue;
        this.redsMove = !this.redsMove;
        this.board[column].nextSpace++;
        return true;
    }

    toMessage() {
        var board = this.board;
        board = Object.keys(board[0]).map(function(c) {
            return board.map(function(r) { return r[c]; });
        }).reverse();
        return board.map(x => x.join(" "));
    }
}

exports.commands = {
    connectfour: {
        commands: ["!c4", "!connectfour"],
        exec: async function (command, message) {
            const game = new ConnectFourBoard();
            const replyMessage = await message.channel.send(game.toMessage());
            const filter = (reaction, user) => !user.bot && game.columns.indexOf(reaction.emoji.name) !== -1;
            collector = replyMessage.createReactionCollector(filter, { time: 60000 });

            collector.on("collect", async reaction => {
                if (game.playMove(game.columns.indexOf(reaction.emoji.name))) {
                    await replyMessage.edit(game.toMessage());
                }
            });

            for (var col of game.columns) {
                await replyMessage.react(col);
            }
        }
    }
};