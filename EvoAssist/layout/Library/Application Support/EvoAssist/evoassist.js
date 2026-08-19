(function () {
    "use strict";

    if (window.EvoAssist && window.EvoAssist.version) {
        return;
    }

    var VERSION = "1.0.0";
    var STORAGE_KEY = "evoassist.config.v1";
    var DODGE_TOUCH_ID = 2147483001;
    var ATTACK_TOUCH_ID = 2147483002;
    var EXPECTED_PLAYER_VARS = 72;
    var PLAYER_LEVEL_INDEX = 10;
    var IOS_2189_PLAYER_TYPE = "t110";
    var IOS_2189_ATTACK_BUTTON_TYPE = "t370";
    var IOS_2189_THUMBSTICK_TYPE = "t372";

    var WEAPON_STATS = {
        0: [200, 125],
        2: [235, 90],
        3: [245, 125],
        4: [260, 125],
        5: [300, 133],
        6: [340, 125],
        7: [380, 131],
        8: [343, 130],
        9: [350, 125],
        10: [470, 133],
        11: [510, 129],
        12: [520, 133],
        13: [555, 134],
        14: [595, 125],
        15: [650, 129],
        16: [655, 131],
        17: [660, 125],
        18: [695, 125],
        19: [690, 125],
        20: [710, 130],
        21: [775, 130],
        22: [805, 136],
        23: [680, 122],
        24: [870, 125],
        25: [940, 137],
        26: [975, 130],
        27: [1050, 125],
        28: [1095, 125],
        29: [1000, 135],
        30: [995, 125],
        31: [1050, 130],
        32: [1145, 134],
        33: [1120, 139],
        34: [1125, 124],
        35: [1145, 135],
        36: [1250, 122],
        37: [1300, 125],
        38: [1300, 125],
        39: [1300, 125]
    };

    var ARC_MULTIPLIERS = {
        1: 0.60,
        2: 0.75,
        3: 0.70,
        4: 0.75,
        5: 0.80,
        6: 0.75,
        7: 0.76,
        8: 0.75,
        9: 0.90,
        10: 0.95,
        11: 0.80,
        12: 0.75,
        13: 0.75,
        14: 0.80,
        15: 0.80,
        16: 0.70,
        17: 0.75,
        18: 0.80,
        19: 0.80,
        20: 0.85,
        21: 0.85,
        22: 0.81,
        23: 0.82,
        24: 1.05,
        25: 0.85,
        26: 0.80,
        27: 0.85,
        28: 0.78,
        29: 0.70,
        30: 0.80,
        31: 0.85,
        32: 0.85,
        33: 0.80,
        34: 0.80,
        35: 0.83,
        36: 0.90,
        37: 0.85,
        38: 0.90,
        39: 0.95,
        40: 0.91,
        41: 1.06
    };

    var DEFAULT_CONFIG = {
        autoDodge: false,
        autoAttack: false,
        showThreats: false,
        zoom: 1
    };

    var config = loadConfig();
    var runtime = null;
    var playerType = null;
    var touchInstance = null;
    var attackButtonType = null;
    var thumbstickType = null;
    var gameCanvas = null;
    var overlayCanvas = null;
    var overlayContext = null;
    var enemyTracker = new Map();
    var lastAttackAt = 0;
    var dodgeTouchActive = false;
    var lastDodgePoint = null;
    var ghostAngle = null;
    var angleLockUntil = 0;
    var loopStarted = false;
    var compatibility = "waiting";
    var lastError = "";
    var ui = {};

    function clamp(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    function finiteNumber(value, fallback) {
        return typeof value === "number" && isFinite(value) ? value : fallback;
    }

    function normalizedName(value) {
        return String(value || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    }

    function loadConfig() {
        var loaded = {};
        try {
            loaded = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
        } catch (error) {
            loaded = {};
        }

        return {
            autoDodge: typeof loaded.autoDodge === "boolean" ? loaded.autoDodge : DEFAULT_CONFIG.autoDodge,
            autoAttack: typeof loaded.autoAttack === "boolean" ? loaded.autoAttack : DEFAULT_CONFIG.autoAttack,
            showThreats: typeof loaded.showThreats === "boolean" ? loaded.showThreats : DEFAULT_CONFIG.showThreats,
            zoom: clamp(finiteNumber(Number(loaded.zoom), DEFAULT_CONFIG.zoom), 0.25, 2.5)
        };
    }

    function saveConfig() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        } catch (error) {
            // Private storage failures should not disable the tweak.
        }
    }

    function setConfig(patch) {
        if (!patch || typeof patch !== "object") {
            return getConfig();
        }

        ["autoDodge", "autoAttack", "showThreats"].forEach(function (key) {
            if (typeof patch[key] === "boolean") {
                config[key] = patch[key];
            }
        });

        if (patch.zoom !== undefined) {
            config.zoom = clamp(finiteNumber(Number(patch.zoom), config.zoom), 0.25, 2.5);
        }

        if (!config.autoDodge) {
            stopDodgeTouch();
        }
        if (!config.autoAttack) {
            ghostAngle = null;
        }

        saveConfig();
        syncUI();
        applyZoom();
        return getConfig();
    }

    function getConfig() {
        return {
            autoDodge: config.autoDodge,
            autoAttack: config.autoAttack,
            showThreats: config.showThreats,
            zoom: config.zoom
        };
    }

    function createUI() {
        if (document.getElementById("evoassist-root")) {
            return;
        }

        var style = document.createElement("style");
        style.id = "evoassist-style";
        style.textContent = [
            "#evoassist-root{position:fixed;inset:0;pointer-events:none;z-index:2147483600;font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;letter-spacing:0;color:#f4f7f8}",
            "#evoassist-root *{box-sizing:border-box;letter-spacing:0}",
            "#evoassist-toggle{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));width:44px;height:44px;border:1px solid #5b6970;border-radius:6px;background:#11181c;color:#7ee0c3;font-size:14px;font-weight:800;box-shadow:0 4px 16px rgba(0,0,0,.45);pointer-events:auto;touch-action:manipulation}",
            "#evoassist-toggle:active{background:#1b282e}",
            "#evoassist-panel{position:absolute;top:max(12px,env(safe-area-inset-top));right:max(12px,env(safe-area-inset-right));width:min(310px,calc(100vw - 24px));max-height:calc(100vh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:auto;border:1px solid #536168;border-radius:6px;background:rgba(14,20,24,.96);box-shadow:0 10px 30px rgba(0,0,0,.55);pointer-events:auto;touch-action:manipulation;-webkit-overflow-scrolling:touch}",
            "#evoassist-panel[hidden]{display:none}",
            ".ea-header{height:48px;padding:0 12px;display:flex;align-items:center;gap:9px;border-bottom:1px solid #344147;background:#182228}",
            ".ea-title{font-size:14px;font-weight:800;flex:1}",
            ".ea-version{font-size:10px;color:#93a1a8}",
            ".ea-status-dot{width:8px;height:8px;border-radius:50%;background:#eab308;box-shadow:0 0 0 3px rgba(234,179,8,.14)}",
            ".ea-status-dot[data-state=ready]{background:#24c997;box-shadow:0 0 0 3px rgba(36,201,151,.14)}",
            ".ea-status-dot[data-state=error]{background:#f05d5e;box-shadow:0 0 0 3px rgba(240,93,94,.14)}",
            "#evoassist-close{width:32px;height:32px;border:0;background:transparent;color:#c4cdd1;font-size:18px;font-weight:700}",
            ".ea-content{padding:8px 12px 12px}",
            ".ea-row{min-height:46px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #2a353a}",
            ".ea-row:last-of-type{border-bottom:0}",
            ".ea-label{flex:1;min-width:0;font-size:13px;font-weight:650;color:#e7ecee}",
            ".ea-subtitle{display:block;margin-top:2px;font-size:10px;font-weight:500;color:#8f9ca2}",
            ".ea-switch{position:relative;width:42px;height:24px;flex:0 0 42px}",
            ".ea-switch input{position:absolute;opacity:0;width:1px;height:1px}",
            ".ea-switch span{position:absolute;inset:0;border:1px solid #5d686d;border-radius:12px;background:#303a3f;transition:background .15s,border-color .15s}",
            ".ea-switch span:before{content:\"\";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#f4f7f8;transition:transform .15s}",
            ".ea-switch input:checked+span{border-color:#24c997;background:#16876b}",
            ".ea-switch input:checked+span:before{transform:translateX(18px)}",
            ".ea-zoom{display:grid;grid-template-columns:1fr 44px;gap:10px;align-items:center;width:150px}",
            ".ea-zoom input{width:100%;accent-color:#24c997}",
            "#evoassist-zoom-value{font-variant-numeric:tabular-nums;text-align:right;font-size:12px;color:#7ee0c3}",
            ".ea-footer{display:flex;align-items:center;gap:7px;margin-top:10px;padding-top:9px;border-top:1px solid #344147;color:#9ba7ad;font-size:10px}",
            "#evoassist-status{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
            "@media(max-height:420px){#evoassist-panel{width:min(290px,calc(100vw - 24px))}.ea-header{height:42px}.ea-row{min-height:40px}.ea-content{padding-top:4px}}"
        ].join("");
        document.head.appendChild(style);

        var root = document.createElement("div");
        root.id = "evoassist-root";
        root.innerHTML = [
            "<button id=\"evoassist-toggle\" type=\"button\" title=\"Open EvoAssist\" aria-label=\"Open EvoAssist\">EA</button>",
            "<section id=\"evoassist-panel\" aria-label=\"EvoAssist settings\" hidden>",
            "  <div class=\"ea-header\">",
            "    <span id=\"evoassist-status-dot\" class=\"ea-status-dot\" data-state=\"waiting\"></span>",
            "    <span class=\"ea-title\">EvoAssist <span class=\"ea-version\">v" + VERSION + "</span></span>",
            "    <button id=\"evoassist-close\" type=\"button\" title=\"Close\" aria-label=\"Close\">X</button>",
            "  </div>",
            "  <div class=\"ea-content\">",
            settingRow("Auto Dodge", "Move away from active threats", "autoDodge"),
            settingRow("Auto Attack", "Aim and tap the attack control", "autoAttack"),
            settingRow("Threat Overlay", "Show detected combat ranges", "showThreats"),
            "    <div class=\"ea-row\">",
            "      <span class=\"ea-label\">Camera Zoom<span class=\"ea-subtitle\">0.25x to 2.50x</span></span>",
            "      <div class=\"ea-zoom\"><input id=\"evoassist-zoom\" type=\"range\" min=\"0.25\" max=\"2.5\" step=\"0.05\"><output id=\"evoassist-zoom-value\">1.00x</output></div>",
            "    </div>",
            "    <div class=\"ea-footer\"><span>Runtime</span><strong id=\"evoassist-status\">Waiting</strong></div>",
            "  </div>",
            "</section>"
        ].join("");
        document.body.appendChild(root);

        ui.root = root;
        ui.toggle = document.getElementById("evoassist-toggle");
        ui.panel = document.getElementById("evoassist-panel");
        ui.close = document.getElementById("evoassist-close");
        ui.status = document.getElementById("evoassist-status");
        ui.statusDot = document.getElementById("evoassist-status-dot");
        ui.zoom = document.getElementById("evoassist-zoom");
        ui.zoomValue = document.getElementById("evoassist-zoom-value");

        ui.toggle.addEventListener("click", function () {
            ui.panel.hidden = false;
            ui.toggle.hidden = true;
        });
        ui.close.addEventListener("click", function () {
            ui.panel.hidden = true;
            ui.toggle.hidden = false;
        });

        root.querySelectorAll("input[data-config]").forEach(function (input) {
            input.addEventListener("change", function () {
                var patch = {};
                patch[input.getAttribute("data-config")] = input.checked;
                setConfig(patch);
            });
        });

        ui.zoom.addEventListener("input", function () {
            setConfig({ zoom: Number(ui.zoom.value) });
        });

        ["touchstart", "touchmove", "touchend", "pointerdown", "pointerup", "mousedown", "mouseup", "click"].forEach(function (eventName) {
            root.addEventListener(eventName, function (event) {
                event.stopPropagation();
            }, false);
        });

        syncUI();
        updateStatus("waiting", "Waiting");
    }

    function settingRow(label, subtitle, key) {
        return [
            "    <label class=\"ea-row\">",
            "      <span class=\"ea-label\">" + label + "<span class=\"ea-subtitle\">" + subtitle + "</span></span>",
            "      <span class=\"ea-switch\"><input type=\"checkbox\" data-config=\"" + key + "\"><span></span></span>",
            "    </label>"
        ].join("");
    }

    function syncUI() {
        if (!ui.root) {
            return;
        }
        ui.root.querySelectorAll("input[data-config]").forEach(function (input) {
            input.checked = Boolean(config[input.getAttribute("data-config")]);
        });
        ui.zoom.value = String(config.zoom);
        ui.zoomValue.textContent = config.zoom.toFixed(2) + "x";
    }

    function updateStatus(state, text) {
        compatibility = state;
        if (ui.status) {
            ui.status.textContent = text;
        }
        if (ui.statusDot) {
            ui.statusDot.setAttribute("data-state", state);
        }
    }

    function createOverlay() {
        if (overlayCanvas) {
            return;
        }
        overlayCanvas = document.createElement("canvas");
        overlayCanvas.id = "evoassist-overlay";
        overlayCanvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483500";
        document.body.appendChild(overlayCanvas);
        overlayContext = overlayCanvas.getContext("2d");
        resizeOverlay();
        window.addEventListener("resize", resizeOverlay);
    }

    function resizeOverlay() {
        if (!overlayCanvas || !overlayContext) {
            return;
        }
        var ratio = clamp(window.devicePixelRatio || 1, 1, 3);
        overlayCanvas.width = Math.max(1, Math.round(window.innerWidth * ratio));
        overlayCanvas.height = Math.max(1, Math.round(window.innerHeight * ratio));
        overlayContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function clearOverlay() {
        if (overlayContext) {
            overlayContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }
    }

    function findTypeByNames(names) {
        if (!runtime || !runtime.types_by_index) {
            return null;
        }
        var wanted = names.map(normalizedName);
        for (var i = 0; i < runtime.types_by_index.length; i += 1) {
            var type = runtime.types_by_index[i];
            if (type && wanted.indexOf(normalizedName(type.name)) !== -1) {
                return type;
            }
        }
        return null;
    }

    function findPlayerType() {
        var named = findTypeByNames(["Player", IOS_2189_PLAYER_TYPE]);
        if (named && named.instvar_sids && named.instvar_sids.length > PLAYER_LEVEL_INDEX) {
            return named;
        }

        if (!runtime || !runtime.types_by_index) {
            return null;
        }
        for (var i = 0; i < runtime.types_by_index.length; i += 1) {
            var type = runtime.types_by_index[i];
            if (type && type.instvar_sids && type.instvar_sids.length === EXPECTED_PLAYER_VARS) {
                return type;
            }
        }
        return null;
    }

    function findTouchInstance() {
        if (!runtime || !runtime.types_by_index) {
            return null;
        }
        var touchConstructor = window.cr && window.cr.plugins_ && window.cr.plugins_.Touch;
        for (var i = 0; i < runtime.types_by_index.length; i += 1) {
            var type = runtime.types_by_index[i];
            if (!type || !type.instances || !type.instances.length) {
                continue;
            }
            if ((touchConstructor && type.plugin instanceof touchConstructor) || normalizedName(type.name) === "touch") {
                var instance = type.instances[0];
                if (instance && typeof instance.onTouchStart === "function" && typeof instance.onTouchEnd === "function") {
                    return instance;
                }
            }
        }
        return null;
    }

    function attachRuntime(foundRuntime) {
        runtime = foundRuntime;
        gameCanvas = runtime.canvas || document.getElementById("c2canvas");
        playerType = findPlayerType();
        touchInstance = findTouchInstance();
        attackButtonType = findTypeByNames(["btnattack", IOS_2189_ATTACK_BUTTON_TYPE]);
        thumbstickType = findTypeByNames(["Thumbstick", "thumbstickmiddle", IOS_2189_THUMBSTICK_TYPE]);

        if (!gameCanvas || !playerType || !touchInstance || !attackButtonType) {
            var missing = [];
            if (!gameCanvas) { missing.push("canvas"); }
            if (!playerType) { missing.push("Player"); }
            if (!touchInstance) { missing.push("Touch"); }
            if (!attackButtonType) { missing.push("btnattack"); }
            updateStatus("error", "Missing: " + missing.join(", "));
            return false;
        }

        createOverlay();
        updateStatus("ready", "Ready / " + (runtime.versionstr || "2.18.9"));
        if (!loopStarted) {
            loopStarted = true;
            window.requestAnimationFrame(animationLoop);
        }
        return true;
    }

    function pollForRuntime() {
        var attempts = 0;
        var poll = window.setInterval(function () {
            attempts += 1;
            try {
                var found = typeof window.cr_getC2Runtime === "function" ? window.cr_getC2Runtime() : null;
                if (found && attachRuntime(found)) {
                    window.clearInterval(poll);
                    return;
                }
            } catch (error) {
                lastError = String(error && error.message || error);
            }

            if (attempts >= 240) {
                window.clearInterval(poll);
                updateStatus("error", "Runtime unavailable");
            }
        }, 250);
    }

    function getLevel(instance) {
        if (!instance || !instance.instance_vars || instance.instance_vars.length <= PLAYER_LEVEL_INDEX) {
            return 0;
        }
        return finiteNumber(Number(instance.instance_vars[PLAYER_LEVEL_INDEX]), 0);
    }

    function weaponStats(level) {
        var rounded = Math.max(0, Math.floor(level));
        var entry = WEAPON_STATS[rounded];
        return {
            distance: entry ? entry[0] : Math.max(200, rounded * 30),
            degrees: entry ? entry[1] : 125
        };
    }

    function reachMultiplier(level) {
        return ARC_MULTIPLIERS[Math.floor(level) + 1] || 0.85;
    }

    function findLocalPlayer() {
        if (!playerType || !playerType.instances || !runtime || !runtime.running_layout) {
            return null;
        }
        var scrollX = finiteNumber(runtime.running_layout.scrollX, 0);
        var scrollY = finiteNumber(runtime.running_layout.scrollY, 0);
        var closest = null;
        var closestDistance = Infinity;

        for (var i = 0; i < playerType.instances.length; i += 1) {
            var player = playerType.instances[i];
            if (!player || player.width <= 0) {
                continue;
            }
            var distance = Math.hypot(player.x - scrollX, player.y - scrollY);
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = player;
            }
        }
        return closest;
    }

    function firstUsableInstance(type) {
        if (!type || !type.instances) {
            return null;
        }
        for (var i = 0; i < type.instances.length; i += 1) {
            var instance = type.instances[i];
            if (!instance || !instance.layer) {
                continue;
            }
            if (instance.visible === false || instance.width <= 0 || instance.height <= 0) {
                continue;
            }
            return instance;
        }
        return null;
    }

    function instancePagePoint(instance) {
        if (!instance || !instance.layer || !gameCanvas) {
            return null;
        }
        var rect = gameCanvas.getBoundingClientRect();
        var runtimeWidth = finiteNumber(runtime.width, gameCanvas.width || rect.width);
        var runtimeHeight = finiteNumber(runtime.height, gameCanvas.height || rect.height);
        var canvasX = instance.layer.layerToCanvas
            ? instance.layer.layerToCanvas(instance.x, instance.y, true)
            : runtimeWidth / 2;
        var canvasY = instance.layer.layerToCanvas
            ? instance.layer.layerToCanvas(instance.x, instance.y, false)
            : runtimeHeight / 2;

        return {
            x: rect.left + window.pageXOffset + canvasX * rect.width / runtimeWidth,
            y: rect.top + window.pageYOffset + canvasY * rect.height / runtimeHeight
        };
    }

    function worldPagePoint(instance, worldX, worldY) {
        if (!instance || !instance.layer || !gameCanvas) {
            return null;
        }
        var rect = gameCanvas.getBoundingClientRect();
        var runtimeWidth = finiteNumber(runtime.width, gameCanvas.width || rect.width);
        var runtimeHeight = finiteNumber(runtime.height, gameCanvas.height || rect.height);
        var canvasX = instance.layer.layerToCanvas(worldX, worldY, true);
        var canvasY = instance.layer.layerToCanvas(worldX, worldY, false);
        return {
            x: rect.left + canvasX * rect.width / runtimeWidth,
            y: rect.top + canvasY * rect.height / runtimeHeight
        };
    }

    function syntheticTouch(action, identifier, point) {
        if (!touchInstance || !point) {
            return false;
        }
        var touch = {
            identifier: identifier,
            pageX: point.x,
            pageY: point.y,
            clientX: point.x - window.pageXOffset,
            clientY: point.y - window.pageYOffset,
            radiusX: 1,
            radiusY: 1,
            force: 1,
            target: gameCanvas
        };
        var event = {
            changedTouches: [touch],
            target: gameCanvas,
            preventDefault: function () {}
        };

        try {
            if (action === "start") {
                touchInstance.onTouchStart(event);
            } else if (action === "move") {
                touchInstance.onTouchMove(event);
            } else {
                touchInstance.onTouchEnd(event, false);
            }
            return true;
        } catch (error) {
            lastError = String(error && error.message || error);
            return false;
        }
    }

    function tapAttackButton() {
        var button = firstUsableInstance(attackButtonType);
        var point = instancePagePoint(button);
        if (!point) {
            return false;
        }
        if (!syntheticTouch("start", ATTACK_TOUCH_ID, point)) {
            return false;
        }
        window.setTimeout(function () {
            syntheticTouch("end", ATTACK_TOUCH_ID, point);
        }, 24);
        return true;
    }

    function thumbstickBasePoint() {
        var thumbstick = firstUsableInstance(thumbstickType);
        var point = instancePagePoint(thumbstick);
        if (point) {
            return point;
        }
        if (!gameCanvas) {
            return null;
        }
        var rect = gameCanvas.getBoundingClientRect();
        return {
            x: rect.left + window.pageXOffset + rect.width * 0.18,
            y: rect.top + window.pageYOffset + rect.height * 0.76
        };
    }

    function updateDodgeTouch(dx, dy) {
        var distance = Math.hypot(dx, dy);
        var base = thumbstickBasePoint();
        if (!base || distance < 0.001) {
            stopDodgeTouch();
            return;
        }

        var rect = gameCanvas.getBoundingClientRect();
        var radius = clamp(Math.min(rect.width, rect.height) * 0.12, 45, 90);
        var target = {
            x: base.x + dx / distance * radius,
            y: base.y + dy / distance * radius
        };

        if (!dodgeTouchActive) {
            dodgeTouchActive = syntheticTouch("start", DODGE_TOUCH_ID, base);
        }
        if (dodgeTouchActive) {
            syntheticTouch("move", DODGE_TOUCH_ID, target);
            lastDodgePoint = target;
        }
    }

    function stopDodgeTouch() {
        if (!dodgeTouchActive) {
            return;
        }
        syntheticTouch("end", DODGE_TOUCH_ID, lastDodgePoint || thumbstickBasePoint());
        dodgeTouchActive = false;
        lastDodgePoint = null;
    }

    function hookWorker(worker) {
        if (!worker || worker.__evoAssistHooked || typeof worker.postMessage !== "function") {
            return;
        }
        worker.__evoAssistHooked = true;
        var originalPostMessage = worker.postMessage;
        worker.postMessage = function (message) {
            try {
                if (performance.now() <= angleLockUntil && ghostAngle !== null &&
                    message && message.action === "send" && message.data &&
                    message.data.a === "ps" && message.data.d) {
                    message.data.d.a = Math.round(ghostAngle);
                }
            } catch (error) {
                lastError = String(error && error.message || error);
            }
            return originalPostMessage.apply(this, arguments);
        };
    }

    function hookNetworkWorkers() {
        if (!runtime || !runtime.types_by_index) {
            return;
        }
        for (var i = 0; i < runtime.types_by_index.length; i += 1) {
            var instances = runtime.types_by_index[i] && runtime.types_by_index[i].instances;
            if (!instances) {
                continue;
            }
            for (var j = 0; j < instances.length; j += 1) {
                if (instances[j] && instances[j].wsWorker) {
                    hookWorker(instances[j].wsWorker);
                }
            }
        }
    }

    function applyZoom() {
        if (!runtime || !runtime.running_layout || !runtime.running_layout.layers) {
            return;
        }
        var layers = runtime.running_layout.layers;
        for (var i = 0; i < layers.length; i += 1) {
            var layer = layers[i];
            if (!layer || layer.scale === config.zoom) {
                continue;
            }
            layer.scale = config.zoom;
            if (typeof layer.setZIndicesStaleFrom === "function") {
                layer.setZIndicesStaleFrom(0);
            }
        }
    }

    function drawThreat(enemy, localPlayer, reach, isDangerous, isAttackTarget) {
        if (!config.showThreats || !overlayContext || !enemy || !localPlayer) {
            return;
        }
        var enemyPoint = worldPagePoint(enemy, enemy.x, enemy.y);
        var localPoint = worldPagePoint(localPlayer, localPlayer.x, localPlayer.y);
        if (!enemyPoint || !localPoint) {
            return;
        }
        var edgePoint = worldPagePoint(enemy, enemy.x + reach, enemy.y);
        var radius = edgePoint ? Math.abs(edgePoint.x - enemyPoint.x) : 30;
        radius = clamp(radius, 8, Math.max(window.innerWidth, window.innerHeight));

        overlayContext.beginPath();
        overlayContext.arc(enemyPoint.x, enemyPoint.y, radius, 0, Math.PI * 2);
        overlayContext.strokeStyle = isDangerous ? "rgba(240,93,94,.9)" : "rgba(234,179,8,.48)";
        overlayContext.lineWidth = isDangerous ? 2 : 1;
        overlayContext.stroke();

        if (isDangerous || isAttackTarget) {
            overlayContext.beginPath();
            overlayContext.moveTo(localPoint.x, localPoint.y);
            overlayContext.lineTo(enemyPoint.x, enemyPoint.y);
            overlayContext.strokeStyle = isDangerous ? "rgba(240,93,94,.8)" : "rgba(36,201,151,.7)";
            overlayContext.lineWidth = 1.5;
            overlayContext.stroke();
        }
    }

    function combatTick() {
        clearOverlay();
        if (!runtime || !runtime.running_layout || !playerType || !playerType.instances) {
            stopDodgeTouch();
            return;
        }

        var localPlayer = findLocalPlayer();
        if (!localPlayer) {
            stopDodgeTouch();
            ghostAngle = null;
            return;
        }

        var now = performance.now();
        if (now > angleLockUntil) {
            ghostAngle = null;
        }

        var localLevel = getLevel(localPlayer);
        var localStats = weaponStats(localLevel);
        var localReach = localStats.distance * reachMultiplier(localLevel);
        var localRadius = Math.max(1, localPlayer.width * 0.35);
        var canAttack = now - lastAttackAt > Math.max(160, localLevel * 20);
        var dodgeTarget = null;
        var dodgeDistance = Infinity;
        var attackTarget = null;
        var attackDistance = Infinity;
        var activeUIDs = new Set();

        for (var i = 0; i < playerType.instances.length; i += 1) {
            var enemy = playerType.instances[i];
            if (!enemy || enemy.uid === localPlayer.uid || enemy.width <= 0) {
                continue;
            }

            activeUIDs.add(enemy.uid);
            var tracker = enemyTracker.get(enemy.uid);
            if (!tracker) {
                tracker = {
                    lastX: enemy.x,
                    lastY: enemy.y,
                    wasInThreat: false,
                    enteredThreatAt: 0,
                    vx: 0,
                    vy: 0
                };
                enemyTracker.set(enemy.uid, tracker);
            }

            tracker.vx = enemy.x - tracker.lastX;
            tracker.vy = enemy.y - tracker.lastY;
            tracker.lastX = enemy.x;
            tracker.lastY = enemy.y;

            var dx = localPlayer.x - enemy.x;
            var dy = localPlayer.y - enemy.y;
            var distance = Math.hypot(dx, dy);
            var enemyLevel = getLevel(enemy);
            var enemyStats = weaponStats(enemyLevel);
            var enemyReach = enemyStats.distance * reachMultiplier(enemyLevel);
            var enemyRadius = Math.max(1, enemy.width * 0.35);
            var threatBuffer = enemyLevel >= localLevel ? 80 : 40;
            var displayedLevel = Math.floor(enemyLevel) + 1;
            if (displayedLevel === 27 || displayedLevel === 28) {
                threatBuffer += 120;
            }
            var threatRange = enemyReach + localRadius + threatBuffer;
            var inThreat = distance < threatRange;
            var closing = tracker.vx * dx + tracker.vy * dy > 0.05;

            if (inThreat && !tracker.wasInThreat) {
                tracker.enteredThreatAt = now;
            }
            if (!inThreat) {
                tracker.enteredThreatAt = 0;
            }
            tracker.wasInThreat = inThreat;

            var recentEntry = tracker.enteredThreatAt > 0 && now - tracker.enteredThreatAt < 340;
            var dangerous = inThreat && (recentEntry || closing || enemyLevel >= localLevel || !canAttack);
            if (dangerous && distance < dodgeDistance) {
                dodgeDistance = distance;
                dodgeTarget = enemy;
            }

            if (distance < localReach + enemyRadius && distance < attackDistance) {
                attackDistance = distance;
                attackTarget = enemy;
            }

            drawThreat(enemy, localPlayer, enemyReach, dangerous, attackTarget === enemy);
        }

        enemyTracker.forEach(function (_, uid) {
            if (!activeUIDs.has(uid)) {
                enemyTracker.delete(uid);
            }
        });

        if (config.autoDodge && dodgeTarget) {
            updateDodgeTouch(localPlayer.x - dodgeTarget.x, localPlayer.y - dodgeTarget.y);
        } else {
            stopDodgeTouch();
        }

        if (config.autoAttack && canAttack && attackTarget) {
            var attackTracker = enemyTracker.get(attackTarget.uid);
            var predictedX = attackTarget.x + (attackTracker ? attackTracker.vx * 10 : 0);
            var predictedY = attackTarget.y + (attackTracker ? attackTracker.vy * 10 : 0);
            var arcDegrees = localStats.degrees;
            if (attackTarget.width < 150 || getLevel(attackTarget) < 10) {
                arcDegrees *= 0.4;
            }
            var attackAngle = Math.atan2(predictedY - localPlayer.y, predictedX - localPlayer.x) + arcDegrees * Math.PI / 180;
            ghostAngle = (attackAngle * 180 / Math.PI % 360 + 360) % 360;
            angleLockUntil = now + 180;
            if (tapAttackButton()) {
                lastAttackAt = now;
            }
        }
    }

    function animationLoop() {
        try {
            if (runtime && runtime.running_layout) {
                if (!touchInstance) {
                    touchInstance = findTouchInstance();
                }
                if (!playerType) {
                    playerType = findPlayerType();
                }
                if (!attackButtonType) {
                    attackButtonType = findTypeByNames(["btnattack", IOS_2189_ATTACK_BUTTON_TYPE]);
                }
                if (!thumbstickType) {
                    thumbstickType = findTypeByNames(["Thumbstick", "thumbstickmiddle", IOS_2189_THUMBSTICK_TYPE]);
                }
                hookNetworkWorkers();
                applyZoom();
                combatTick();
            } else {
                clearOverlay();
                stopDodgeTouch();
            }
        } catch (error) {
            lastError = String(error && error.message || error);
            updateStatus("error", "Runtime error");
            stopDodgeTouch();
        }
        window.requestAnimationFrame(animationLoop);
    }

    function diagnostics() {
        return {
            version: VERSION,
            compatibility: compatibility,
            runtime: Boolean(runtime),
            playerType: playerType ? playerType.name : null,
            touch: Boolean(touchInstance),
            attackButton: attackButtonType ? attackButtonType.name : null,
            thumbstick: thumbstickType ? thumbstickType.name : null,
            lastError: lastError
        };
    }

    window.EvoAssist = {
        version: VERSION,
        getConfig: getConfig,
        setConfig: setConfig,
        diagnostics: diagnostics
    };

    function boot() {
        var canvas = document.getElementById("c2canvas");
        if (!canvas) {
            return;
        }
        createUI();
        pollForRuntime();
        window.addEventListener("pagehide", stopDodgeTouch);
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                stopDodgeTouch();
            }
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }
}());
