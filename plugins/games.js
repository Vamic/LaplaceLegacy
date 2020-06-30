var bot = module.parent.exports;

class ConnectFourColumn extends Array {
    constructor(args) {
        super(args);
        Object.defineProperty(this, 'nextSpace', {
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
        this.moveHistory = [];
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

    playMove(column, playerName) {
        if (this.board[column].nextSpace == 7) return false;
        let circle = this.redsMove ? this.circles.red : this.circles.blue;
        this.board[column][this.board[column].nextSpace] = circle;
        this.redsMove = !this.redsMove;
        this.board[column].nextSpace++;
        this.moveHistory.push(`${playerName} placed ${circle} in column ${column + 1}`);
        if (this.moveHistory.length > 6) this.moveHistory.shift();
        return true;
    }

    toMessage() {
        var board = this.board;
        board = Object.keys(board[0]).map(function (c) {
            return board.map(function (r) { return r[c]; });
        }).reverse();
        board.pop(); //for some reason theres an empty row last? /shrug
        return board.map((x, i) => x.join(" ") + " | " + (this.moveHistory[i] || ""));
    }
}

exports.commands = {
    connectfour: {
        commands: ["!c4", "!connectfour"],
        exec: async function (command, message) {
            const game = new ConnectFourBoard();
            const replyMessage = await message.channel.send(game.toMessage());
            const filter = (reaction, user) => !user.bot && game.columns.indexOf(reaction.emoji.name) !== -1;
            collector = replyMessage.createReactionCollector(filter, { time: 30 * 60 * 1000 });

            collector.on("collect", async (reaction, user) => {
                collector.resetTimer();
                if (game.playMove(game.columns.indexOf(reaction.emoji.name), user.username)) {
                    await replyMessage.edit(game.toMessage());
                }
            });

            for (var col of game.columns) {
                await replyMessage.react(col);
            }
        }
    }
};