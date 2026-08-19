"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = {
    control: path.join(root, "control"),
    filter: path.join(root, "EvoAssist.plist"),
    makefile: path.join(root, "Makefile"),
    tweak: path.join(root, "Tweak.xm"),
    payload: path.join(root, "layout", "Library", "Application Support", "EvoAssist", "evoassist.js")
};

for (const [label, file] of Object.entries(files)) {
    assert(fs.existsSync(file), `Missing ${label}: ${file}`);
}

const control = fs.readFileSync(files.control, "utf8");
const filter = fs.readFileSync(files.filter, "utf8");
const makefile = fs.readFileSync(files.makefile, "utf8");
const tweak = fs.readFileSync(files.tweak, "utf8");
const payload = fs.readFileSync(files.payload, "utf8");

assert(control.includes("Package: com.local.evoassist"));
assert(control.includes("Version: 1.0.0"));
assert(control.includes("firmware (>= 15.0)"));
assert(filter.includes("com.nightsteed.evowarsio"));
assert(filter.includes("EvoWars"));
assert(makefile.includes("TARGET = iphone:clang:latest:15.0"));
assert(makefile.includes("ARCHS = arm64"));
assert(!makefile.includes("arm64e"));
assert(tweak.includes("WKUserScriptInjectionTimeAtDocumentEnd"));
assert(tweak.includes("/var/jb/Library/Application Support/EvoAssist/evoassist.js"));
assert(tweak.includes("/Library/Application Support/EvoAssist/evoassist.js"));
assert(!tweak.includes("rootless.h"));
assert(payload.includes('var VERSION = "1.0.0"'));
assert(payload.includes('var IOS_2189_PLAYER_TYPE = "t110"'));
assert(payload.includes('var IOS_2189_ATTACK_BUTTON_TYPE = "t370"'));
assert(payload.includes('var IOS_2189_THUMBSTICK_TYPE = "t372"'));

console.log("Project/package contract OK");
