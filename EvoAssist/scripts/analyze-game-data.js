"use strict";

const fs = require("fs");

const dataPath = process.argv[2];
if (!dataPath) {
    throw new Error("Usage: node scripts/analyze-game-data.js <path-to-data.js>");
}

const source = fs.readFileSync(dataPath, "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(source);
const objectTypes = [];

function collectObjectTypes(value) {
    if (!Array.isArray(value)) {
        return;
    }
    if (typeof value[0] === "string" && /^t\d+$/.test(value[0]) && typeof value[1] === "number") {
        objectTypes.push(value);
        return;
    }
    for (const child of value) {
        collectObjectTypes(child);
    }
}

collectObjectTypes(data.project);
if (!objectTypes.length) {
    throw new Error("Unsupported Construct 2 data structure");
}

const needles = [
    "btnattack-sheet0.png",
    "thumbstickmiddle-sheet0.png",
    "thumbstickpointer-sheet0.png"
];

for (const type of objectTypes) {
    const serialized = JSON.stringify(type).toLowerCase();
    const matches = needles.filter((needle) => serialized.includes(needle));
    const instanceVarCount = Array.isArray(type[3]) ? type[3].length : 0;
    if (matches.length || instanceVarCount === 72) {
        console.log(JSON.stringify({
            runtimeName: type[0],
            pluginIndex: type[1],
            instanceVarCount,
            matches
        }));
    }
}
