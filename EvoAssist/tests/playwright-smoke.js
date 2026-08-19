"use strict";

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
let playwright;
try {
    playwright = require("playwright");
} catch (error) {
    playwright = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
}
const { chromium } = playwright;

async function runViewport(browser, name, viewport) {
    const page = await browser.newPage({ viewport });
    const url = pathToFileURL(path.resolve(__dirname, "harness.html")).href;
    await page.goto(url);
    await page.waitForFunction(() => window.EvoAssist && window.EvoAssist.diagnostics().compatibility === "ready");
    await page.click("#evoassist-toggle");

    const panelBox = await page.locator("#evoassist-panel").boundingBox();
    assert(panelBox, "settings panel is not visible");
    assert(panelBox.x >= 0 && panelBox.y >= 0, `settings panel starts outside the viewport: ${JSON.stringify(panelBox)}`);
    assert(panelBox.x + panelBox.width <= viewport.width + 1, `settings panel overflows horizontally: ${JSON.stringify(panelBox)}`);
    assert(panelBox.y + panelBox.height <= viewport.height + 1, `settings panel overflows vertically: ${JSON.stringify(panelBox)}`);

    await page.evaluate(() => {
        window.EvoAssist.setConfig({
            autoDodge: true,
            autoAttack: true,
            showThreats: true,
            zoom: 0.75
        });
    });
    await page.waitForTimeout(450);

    const state = await page.evaluate(() => {
        window.__worker.postMessage({ action: "send", data: { a: "ps", d: { a: -1 } } });
        return {
            config: window.EvoAssist.getConfig(),
            diagnostics: window.EvoAssist.diagnostics(),
            layerScales: window.__runtime.running_layout.layers.map((layer) => layer.scale),
            touchStats: Object.assign({}, window.__touchStats),
            workerMessage: window.__lastWorkerMessage
        };
    });

    assert.strictEqual(state.diagnostics.playerType, "t110");
    assert.strictEqual(state.diagnostics.attackButton, "t370");
    assert.strictEqual(state.diagnostics.thumbstick, "t372");
    assert(state.layerScales.every((scale) => scale === 0.75), "camera zoom was not applied to all layers");
    assert(state.touchStats.start >= 2, "auto dodge and auto attack did not create touch starts");
    assert(state.touchStats.move >= 1, "auto dodge did not move the thumbstick touch");
    assert(state.workerMessage.data.d.a >= 0, "worker angle was not overridden");

    await page.screenshot({
        path: path.resolve(__dirname, "artifacts", `panel-${name}.png`),
        fullPage: true
    });
    await page.close();
}

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        await runViewport(browser, "iphone-landscape", { width: 844, height: 390 });
        await runViewport(browser, "desktop-landscape", { width: 1280, height: 720 });
        console.log("Playwright smoke test OK");
    } finally {
        await browser.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
