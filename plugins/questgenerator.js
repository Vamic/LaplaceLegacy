var bot = module.parent.exports;

var verbs = require("./data/questgenerator/verbs.json");
var locations = require("./data/questgenerator/locations.json");
var items = require("./data/questgenerator/items.json");
var creatures = require("./data/questgenerator/creatures.json");
var nouns = require("./data/questgenerator/nouns.json");
var adjectives = require("./data/questgenerator/adjectives.json");

//Weird li'l object that lets us generate a quest type as an int, then access the corresponding array.
var questTargetTypes = {
    //Link to the equivalent arrays. They're references, right? Probably.
    arrays: [locations, items, creatures],
    //Pseudo-enum matching the order of the array. Size is number of quest types.
    location: 0, item: 1, creature: 2, size: 3
}

//Returns a string containing the quest objective
var GenerateQuest = function() {
    let targetType = GetRandomInt(questTargetTypes.size); 
    let targetIsMultipleThings = Math.random() < 0.25; //0 to 1, 0% chance to 100% chance 
    let targetHasAppender = Math.random() < 0.25;
    let targetHasPrepender = Math.random() < 0.2;
    
    let quest = GetRandomElement(verbs);
    
    let targetCount = (Math.random() < 0.5 ? " the" : "");
    //If multiple targets, changes " the " to " 7x ", for example, to show how many targets are needed for the quest
    if (targetIsMultipleThings && targetType != questTargetTypes.location) {
        targetCount = " "+(GetRandomInt(10)+2)+"x";
    }
    
    quest += targetCount+" ";
    quest += (targetHasPrepender ? GetRandomElement(adjectives)+" " : ""); //Turns target/item "Flower" into "Magic Flower"
    quest += GetRandomElement(questTargetTypes.arrays[targetType]);
    quest += (targetHasAppender  ? " of "+GetRandomElement(nouns) : ""); //Same as above but other side, e.g. "Flower of Doom"
    
    return quest
}

//Returns a string containing the quest reward
var GenerateReward = function() {
    let rewardXP = (GetRandomInt(1000)+1) * 10;
    let rewardGold = (GetRandomInt(100)+1) * 10;

    let rewardHasGold = Math.random() < 0.6; //0 to 1, 0% chance to 100% chance 
    let rewardHasItem = Math.random() < 0.2;
    let rewardIsSingleItem = Math.random() < 0.2;
    let rewardItemHasPrepender = Math.random() < 0.2;
    let rewardItemHasAppender = Math.random() < 0.2;

    let reward = rewardXP+" XP";
  
    if (rewardHasGold) reward += ", " + rewardGold + " Gold Pieces";

    if (rewardHasItem) {
        reward += ", " + (rewardIsSingleItem ? "" : (GetRandomInt(10)+2) + "x ");

        reward += (rewardItemHasPrepender ? GetRandomElement(adjectives)+" " : "");
        reward += GetRandomElement(items);
        reward += (rewardItemHasAppender ? " of "+GetRandomElement(nouns) : "");
    }

    return reward
}

var GetRandomElement = function(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
//0 (inclusive) to max (exclusive)
var GetRandomInt = function(max) {
    return Math.floor(Math.random() * Math.floor(max));
}

exports.commands = {
    "!quest": {
        usage: "!quest",
        description: "Get a randomly generated quest",
        exec: function(command, message) {
            message.channel.send("Quest: "+GenerateQuest()+
                                "\n"+
                                "Reward: "+GenerateReward());
        }
    }
}
