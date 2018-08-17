var bot = module.parent.exports;

var getRandomInt = function(min, max){
    return Math.floor(Math.random() * (max - min + 1) + min);
};

var argFilter = function(arg) {
    return /\d/.test(arg);
}

var parseRoll = function (input, results, negative) {
    //Initialize results if we're not adding to existing results
    if (!results) results = [];
    //Find d so we can do dice rolls
    if (input.indexOf("d") > -1) {
        //Get the amount and size
        var diceParts = input.split('d');
        //If theres no amount, set it to 1
        if (!diceParts[0]) diceParts[0] = 1;

        //For each die, do a roll
        for (i = 0; i < diceParts[0]; i++) {
            //Roll from 1 to dice size
            var roll = getRandomInt(1, diceParts[1]);

            //Add to results
            if (negative) results.push(-1 * roll);
            else results.push(roll);
        }
    //Theres no d so its a static number probably, just add it
    } else {
        if (negative) results.push(-1 * parseInt(input));
        else results.push(parseInt(input));
    }
    return results;
};

var rollDice = function(input){
    //Default to a d20
    if (!input) input = "1d20";
    //Default to a d20 with the input as the modifier
    else if (input[0] === "+" || input[0] === "-") input = "1d20" + input;
    //If input is a number, make a die out of it
    else if (!isNaN(input)) input = "1d"+input;

    //Initialize variables
    var i;
    var results = [];
    var parsedInput = input.split("+"); //Split on + ex: 2d8 + 1d4
    var totalScore = 0;

    //Go through each part
    for (var diceIndex = 0; diceIndex < parsedInput.length; diceIndex++) {

        //Get the current part
        var diceRoll = parsedInput[diceIndex];
        var negativeRolls = []; //Array of negative rolls

        //Check if theres a negative somewhere in this part
        if (diceRoll.indexOf("-") > -1) {
            //Split on -
            var diceRolls = diceRoll.split("-");
            for (i = 0; i < diceRolls.length; i++) {
                if (i === 0) {
                    //Set current roll to the first part
                    diceRoll = diceRolls[i];
                } else {
                    //Sort to the negative rolls
                    negativeRolls.push(diceRolls[i]);
                }
            }
        }
        //Roll and add to results
        results = parseRoll(diceRoll, results);
        //If we got any negative rolls, roll those as well
        for (i = 0; i < negativeRolls.length; i++) {
            results = parseRoll(negativeRolls[i], results, true);
        }
    }
    //Calculate total roll
    for (i = 0; i < results.length; i++) {
        totalScore += results[i];
    }
    return [totalScore, results, input];
};

exports.commands = {
    "!roll": {
        usage: "[amount of dice]d[size of each die]",
        description: "Roll some dice",
        exec: function (command, message) {
            var user = message.author.username;
            var results = rollDice(command.arguments.filter(argFilter).join(" "));
            //Total roll
            var final = results[0];
            //Pieces of the roll ex: (1d6 + 2d4 - 2) is 4 pieces
            var parts = results[1];
            //Join the results for display
            var joinedParts = parts.join(", ");
            //What the user typed in
            var input = results[2];
            message.channel.send(user + " rolled " + input 
                //Show result
                + ": **" + final + "**" 
                //Show the individual dice rolls if its not too many
                + (parts.length === 1 || joinedParts.length > 100 ? "" : " (" + joinedParts + ")"));
        }
    }
};
