"use strict";

const fs = require("fs");
const vm = require("vm");

const payloadPath = process.argv[2] || "layout/Library/Application Support/EvoAssist/evoassist.js";
const source = fs.readFileSync(payloadPath, "utf8");

new vm.Script(source, { filename: payloadPath });

const requiredMarkers = [
    "autoDodge",
    "autoAttack",
    "Camera Zoom",
    "cr_getC2Runtime",
    "wsWorker",
    "onTouchStart",
    "btnattack"
];

for (const marker of requiredMarkers) {
    if (!source.includes(marker)) {
        throw new Error(`Missing required payload marker: ${marker}`);
    }
}

console.log(`Payload syntax OK (${source.length} bytes)`);

