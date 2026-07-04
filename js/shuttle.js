/**
 * SHUTTLE - Simplified CEP Panel
 * Version 1.0.0
 */
(function () {
    'use strict';
    try {
        var msgDiv = document.getElementById('msg');
        function showFatal(err) {
            msgDiv.textContent = 'ERROR: ' + err;
            msgDiv.style.display = 'block';
            msgDiv.style.backgroundColor = 'red';
        }

        var cs = new CSInterface();
        var vulcan = VulcanInterface;
        var appId = cs.getApplicationID();

        // ── State ──────────────────────────────────────────────
        // Transfer options are always enabled (no UI toggles).
        var prefs = {
            keepPosition: true,
            editableText: true
        };

        var isPhotoshop = (appId === 'PHXS' || appId === 'PHSP');
        var isIllustrator = (appId === 'ILST');
        var otherApp = isPhotoshop ? 'Illustrator' : 'Photoshop';
        var thisApp = isPhotoshop ? 'Photoshop' : 'Illustrator';
        var extensionId = cs.getExtensionID();
        var isImportWorker = (extensionId === 'com.shuttle.v2.hidden');
        var isPanelExtension = (extensionId === 'com.shuttle.v2.panel');
        var panelInstanceId = thisApp + '_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
        var ACTIVE_LOCK_KEY = 'shuttle_active_instance_' + thisApp;

        // ── Console Logic ──────────────────────────────────────
        var consoleLog = document.getElementById('console-log');
        var consoleOverlay = document.getElementById('console-panel');

        function logConsole(msg, type) {
            var m = typeof msg === 'string' ? msg : JSON.stringify(msg);
            var cssClass = 'log-info';
            if (type === 'error' || type === true) cssClass = 'log-error';
            else if (type === 'warn') cssClass = 'log-warn';
            else if (type === 'scan') cssClass = 'log-scan';
            else if (type === 'diag') cssClass = 'log-diag';
            else if (!type) cssClass = 'log-warn'; // Default old behavior

            var prefix = (cssClass === 'log-error') ? '[ERROR] ' : '> ';
            m = m.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            
            var span = document.createElement('span');
            span.className = cssClass;
            span.innerHTML = prefix + m;
            consoleLog.appendChild(span);
            
            consoleLog.scrollTop = consoleLog.scrollHeight;
        }

        function showDebug() {
            var currW = window.innerWidth || 310;
            if (consoleOverlay.style.display === 'none' || consoleOverlay.style.display === '') {
                consoleOverlay.style.display = 'flex';
                // Force a bit of minimum width if it's too cramped for the console
                window.cep.util.resizeWindow(Math.max(currW, 310), 320); 
            } else {
                consoleOverlay.style.display = 'none';
                // Keep the exact same width it currently has, just snap the height shut
                window.cep.util.resizeWindow(currW, 56);
            }
        }

        // ── Load JSX ───────────────────────────────────────────
        function loadJSX() {
            logConsole("Iniciando motor híbrido de Shuttle...", "warn");
            var extensionPath = cs.getSystemPath(SystemPath.EXTENSION);
            var jsxPath = extensionPath + '/jsx/shuttle.jsx';
            var escapedPath = jsxPath.replace(/\\/g, '/');
            logConsole("Ruta destino: " + escapedPath, 'info');
            
            var result = window.cep.fs.readFile(jsxPath);
            if (result.err === 0) {
                // Force-clear the cached shuttle module FIRST so $.evalFile always loads
                // the fresh file from disk. Without this, ExtendScript caches the compiled
                // IIFE and changes to the JSX are silently ignored until a full host-app restart.
                var evalStr = 'try { $.global.shuttle = undefined; $.evalFile("' + escapedPath + '"); "OK"; } catch(e) { "ERR: " + e.message + " // Line: " + e.line; }';
                cs.evalScript(evalStr, function(res) {
                    if (res === "OK") {
                        logConsole("Script JSX montado en memoria con éxito.");
                    } else {
                        logConsole("FALLO CRITICO JSX: " + res, true);
                    }
                });
            } else {
                logConsole("No se pudo leer fs localmente: err " + result.err, true);
            }
        }
        loadJSX();

        function evalJSX(script) {
            logConsole("Call: " + script.substring(0, 50) + "...");
            return new Promise(function (resolve) {
                cs.evalScript(script, function (result) {
                    resolve(result);
                });
            });
        }

        function shouldThrottleGlobal(key, windowMs) {
            try {
                var now = Date.now();
                var last = parseInt(localStorage.getItem(key) || '0', 10);
                if (!isNaN(last) && (now - last) < windowMs) return true;
                localStorage.setItem(key, String(now));
            } catch (e) { /* localStorage may be unavailable */ }
            return false;
        }

        function parseActiveLock(raw) {
            if (!raw) return null;
            var p = raw.split('|');
            if (p.length < 2) return null;
            var ts = parseInt(p[1], 10);
            if (isNaN(ts)) return null;
            return { id: p[0], ts: ts };
        }

        function refreshActiveLock() {
            try {
                localStorage.setItem(ACTIVE_LOCK_KEY, panelInstanceId + '|' + Date.now());
            } catch (e) {}
        }

        function isActiveInstance() {
            try {
                var lock = parseActiveLock(localStorage.getItem(ACTIVE_LOCK_KEY));
                var now = Date.now();
                if (!lock || (now - lock.ts) > 3500) {
                    refreshActiveLock();
                    return true;
                }
                return lock.id === panelInstanceId;
            } catch (e) {
                return true;
            }
        }

        function claimPullRequestOnce(requestId) {
            if (!requestId) return true;
            try {
                var claimKey = 'shuttle_pull_claim_' + requestId;
                if (localStorage.getItem(claimKey)) return false;
                localStorage.setItem(claimKey, panelInstanceId + '|' + Date.now());

                // light cleanup to avoid growth
                var cleanBefore = Date.now() - 2 * 60 * 1000;
                for (var k = localStorage.length - 1; k >= 0; k--) {
                    var kn = localStorage.key(k);
                    if (kn && kn.indexOf('shuttle_pull_claim_') === 0) {
                        var val = localStorage.getItem(kn) || '';
                        var ts = parseInt(val.split('|')[1], 10);
                        if (!isNaN(ts) && ts < cleanBefore) localStorage.removeItem(kn);
                    }
                }
            } catch (e) { return true; }
            return true;
        }

        function claimMessageOnce(msgId) {
            if (!msgId) return true;
            var storeKey = 'shuttle_msg_' + msgId;
            try {
                if (localStorage.getItem(storeKey)) return false;
                localStorage.setItem(storeKey, panelInstanceId + '|' + Date.now());
                var cleanBefore = Date.now() - 30000;
                for (var k = localStorage.length - 1; k >= 0; k--) {
                    var kn = localStorage.key(k);
                    if (kn && kn.indexOf('shuttle_msg_') === 0) {
                        var idPart = kn.replace('shuttle_msg_', '');
                        var tsMs = parseInt(idPart.split('_')[0], 10);
                        if (!isNaN(tsMs) && tsMs < cleanBefore) localStorage.removeItem(kn);
                    }
                }
                return true;
            } catch (e) {
                return true;
            }
        }

        // ── Vulcan messaging ───────────────────────────────────
        var VULCAN_CHANNEL = VulcanMessage.TYPE_PREFIX + 'com.shuttle.vulcan';
        var SHUTTLE_PROTO = 'shuttle_v2';

        function sendVulcanMessage(payload) {
            // ID estable: prefijo = Date.now() ms para que la limpieza de localStorage
            // no borre la clave por error (antes parseInt en base36 no era comparable al tiempo).
            payload._msgId = Date.now() + '_' + Math.floor(Math.random() * 1e9);
            payload._proto = SHUTTLE_PROTO;
            var sc = (payload && payload.shapes) ? payload.shapes.length : 0;
            logConsole("Enviando Vulcan cmd=" + payload.cmd + " (Shapes: " + sc + ")");
            var msg = new VulcanMessage(VULCAN_CHANNEL);
            msg.setPayload(JSON.stringify(payload));
            VulcanInterface.dispatchMessage(msg);
        }

        // ── Init UI ────────────────────────────────────────────

        function initUI() {
            if (isImportWorker) {
                try { document.getElementById('panel').style.display = 'none'; } catch (e) {}
                try { document.getElementById('console-panel').style.display = 'none'; } catch (e) {}
                return;
            }
            if (isPhotoshop) {
                document.getElementById('ps-panel').style.display = 'flex';
                document.getElementById('ps-push').addEventListener('click', pushToOtherApp);
                document.getElementById('ps-pull').addEventListener('click', pullFromOtherApp);
                document.getElementById('ps-switch').addEventListener('click', switchToOtherApp);
                document.getElementById('ps-debug').addEventListener('click', showDebug);
            } else {
                document.getElementById('ai-panel').style.display = 'flex';
                document.getElementById('ai-push').addEventListener('click', pushToOtherApp);
                document.getElementById('ai-pull').addEventListener('click', pullFromOtherApp);
                document.getElementById('ai-switch').addEventListener('click', switchToOtherApp);
                document.getElementById('ai-debug').addEventListener('click', showDebug);
            }
            
            // Console Action Buttons
            document.getElementById('btn-deep-scan').addEventListener('click', runDeepScan);
            document.getElementById('btn-clear-log').addEventListener('click', function() {
                consoleLog.innerHTML = '';
            });
            document.getElementById('btn-copy-log').addEventListener('click', function() {
                var textToCopy = consoleLog.innerText;
                var ta = document.createElement('textarea');
                ta.value = textToCopy;
                ta.style.position = 'absolute';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand('copy');
                    logConsole('✅ ¡Copiado con éxito!', 'diag');
                } catch (err) {
                    logConsole('❌ Falló la copia: ' + err, 'error');
                }
                document.body.removeChild(ta);
            });
            
            matchHostTheme();
        }

        // ── Theme matching ─────────────────────────────────────
        function matchHostTheme() {
            try {
                var skinInfo = cs.getHostEnvironment().appSkinInfo;
                var bgColor = skinInfo.panelBackgroundColor.color;
                var r = Math.floor(bgColor.red);
                var g = Math.floor(bgColor.green);
                var b = Math.floor(bgColor.blue);
                
                if (r > 128) {
                    document.body.className = 'light';
                } else {
                    document.body.className = '';
                }
                document.body.style.backgroundColor = 'rgb(' + r + ',' + g + ',' + b + ')';
            } catch (e) { }
        }

        cs.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, matchHostTheme);

        var msgTimer = null;
        function showMsg(text) {
            msgDiv.textContent = text;
            msgDiv.className = 'msg visible';
            clearTimeout(msgTimer);
            msgTimer = setTimeout(function () {
                msgDiv.className = 'msg';
            }, 3000); // 3 secs to read
        }

        function switchToOtherApp() {
            var apiVer = cs.getCurrentApiVersion();
            var targetCode = isPhotoshop ? 'ILST' : 'PHXS';

            try {
                if (apiVer.major >= 11 && apiVer.minor >= 2) {
                    var regex = new RegExp(targetCode + '-\\d');
                    var specs = vulcan.getTargetSpecifiersEx().filter(function (s) {
                        return s.search(regex) !== -1;
                    }).sort().reverse();

                    if (specs.length > 0) {
                        var target = specs[0];
                        for (var i = 0; i < specs.length; i++) {
                            if (vulcan.isAppRunningEx(specs[i])) { target = specs[i]; break; }
                        }
                        vulcan.launchAppEx(target, true);
                    }
                } else {
                    var appName = isPhotoshop ? 'illustrator' : 'photoshop';
                    var regex2 = new RegExp(appName + '-\\d');
                    var specs2 = vulcan.getTargetSpecifiers().filter(function (s) {
                        return s.search(regex2) !== -1;
                    }).sort().reverse();

                    if (specs2.length > 0) {
                        var target2 = specs2[0];
                        for (var j = 0; j < specs2.length; j++) {
                            if (vulcan.isAppRunning(specs2[j])) { target2 = specs2[j]; break; }
                        }
                        vulcan.launchApp(target2, true);
                    }
                }
            } catch (e) {
                lastError = 'Error switching apps: ' + e.message;
                showMsg('Error switching apps');
            }
        }

        var isPushing = false;
        function pushToOtherApp() {
            if (!isActiveInstance()) return;
            if (isPushing) return;
            // Cross-instance guard: evita múltiples handlers "fantasma" respondiendo al mismo click.
            if (shouldThrottleGlobal('shuttle_guard_push_' + thisApp, 2500)) return;
            isPushing = true;

            var jsxCall = isPhotoshop ? 
                'shuttle.ps_getSelection(' + JSON.stringify(prefs) + ')' : 
                'shuttle.ai_getSelection(' + JSON.stringify(prefs) + ')';

            evalJSX(jsxCall).then(function (result) {
                try {
                    if (result === 'EvalScript error.') {
                        lastError = 'EvalScript. Syntax err in JSX or missing file.';
                        showMsg('JSX Error: Not loaded');
                        return;
                    }
                    var data = JSON.parse(result);
                    if (!data || data.length === 0) {
                        lastError = 'Returned empty JSON array - nothing explicitly selected';
                        showMsg('Nothing selected');
                        return;
                    }
                    if (data.error) {
                        lastError = 'Script explicitly errored: ' + data.error;
                        showMsg(data.error);
                        return;
                    }

                    logConsole("Enviando vulcan: " + data.length + " items", "info");
                    var reqId = Date.now() + '_' + Math.floor(Math.random() * 1e9);
                    sendVulcanMessage({
                        cmd: isPhotoshop ? 'ps_to_ai' : 'ai_to_ps',
                        shapes: data,
                        prefs: prefs,
                        requestId: reqId,
                        sourceInstance: panelInstanceId
                    });

                    lastError = 'Successfully dispatched ' + data.length + ' item(s) through Vulcan.';
                    showMsg('Pushed ' + data.length + ' item(s)');
                    // Defer focus switch so el mensaje Vulcan y el portapapeles queden estables
                    // antes de activar la otra app (menos fallos al pegar desde Ai).
                    setTimeout(function () {
                        switchToOtherApp();
                    }, 350);
                } catch (e) {
                    lastError = 'JSON Parse Error: ' + e.message + ' | Raw payload: ' + String(result);
                    showMsg('Export fail: ' + String(result).substring(0, 15));
                } finally {
                    // Keep lock a short time to absorb accidental double-clicks.
                    setTimeout(function () { isPushing = false; }, 1200);
                }
            });
        }

        // ── Deep Scan ──────────────────────────────────────────
        function runDeepScan() {
            // Ensure console is open
            if (consoleOverlay.style.display === 'none') showDebug();
            logConsole('\u{1F50D} DEEP SCAN iniciado...', 'scan');

            if (isPhotoshop) {
                evalJSX('shuttle.ps_dumpSelection()').then(function(res) {
                    try {
                        var result = JSON.parse(res);
                        var lines = (result.log || '').split('|||');
                        for (var i = 0; i < lines.length; i++) {
                            if (lines[i].trim()) logConsole(lines[i], 'scan');
                        }
                    } catch(e) { logConsole('SCAN ERROR: ' + res, 'error'); }
                });
            } else {
                // In AI: first run without imagePath to get doc state
                // Then grab last known imagePath from localStorage if available
                var lastImg = '';
                try { lastImg = localStorage.getItem('shuttle_last_img') || ''; } catch(e) {}
                evalJSX('shuttle.ai_runDiagnostic(' + JSON.stringify(lastImg) + ')').then(function(res) {
                    try {
                        var result = JSON.parse(res);
                        var lines = (result.log || '').split('|||');
                        for (var i = 0; i < lines.length; i++) {
                            if (lines[i].trim()) logConsole(lines[i], 'scan');
                        }
                    } catch(e) { logConsole('SCAN ERROR: ' + res, 'error'); }
                });
            }
        }

        function pullFromOtherApp() {
            if (!isActiveInstance()) return;
            if (shouldThrottleGlobal('shuttle_guard_pull_' + thisApp, 2000)) return;
            var reqId = Date.now() + '_' + Math.floor(Math.random() * 1e9);
            sendVulcanMessage({
                cmd: isPhotoshop ? 'pull_from_ai' : 'pull_from_ps',
                prefs: prefs,
                requestId: reqId,
                sourceInstance: panelInstanceId
            });
            showMsg('Pulling...');
        }

        var isHandlingPull = false;
        var isHandlingPullFromAi = false;
        var isImporting = false;

        if (isPanelExtension) {
            refreshActiveLock();
            setInterval(function () {
                if (isActiveInstance()) refreshActiveLock();
            }, 1000);
        }

        logConsole('Listener Vulcan activo en ' + thisApp + ' (' + extensionId + ')', 'info');

        VulcanInterface.addMessageListener(VULCAN_CHANNEL, function (message) {
            var payload = VulcanInterface.getPayload(message);

            var data;
            try {
                data = JSON.parse(payload);
            } catch (e) { return; }

            if (data && data.cmd && data.cmd !== 'showMessage' && data.cmd !== 'shuttle_reload') {
                if (data._proto !== SHUTTLE_PROTO) {
                    return;
                }
            }

            if (isIllustrator && (data.cmd === 'ai_to_ps' || data.cmd === 'pull_from_ps')) {
                return;
            }
            if (isPhotoshop && (data.cmd === 'ps_to_ai' || data.cmd === 'pull_from_ai')) {
                return;
            }

            var isImportCmd = (data.cmd === 'ai_to_ps' || data.cmd === 'ps_to_ai');
            var isPullResponder = (data.cmd === 'pull_from_ps' || data.cmd === 'pull_from_ai');

            // Only the hidden background extension performs imports/pull responses.
            // The visible panel also loads this script; without this guard both run twice.
            if ((isImportCmd || isPullResponder) && !isImportWorker) {
                return;
            }

            if (data._msgId && !claimMessageOnce(data._msgId)) {
                return;
            }

            logConsole("Vulcan recibido: cmd=" + data.cmd);

            if (isPhotoshop && data.cmd === 'ai_to_ps') {
                if (isImporting) return;
                isImporting = true;
                logConsole("Recibido ai_to_ps: " + (data.shapes ? data.shapes.length : 0) + " items");
                evalJSX('shuttle.ps_importShapes(' + JSON.stringify(data) + ')').then(function (res) {
                    isImporting = false;
                    try {
                        var result = JSON.parse(res);
                        if (result && result.diag) {
                            var lines = result.diag.split('|||');
                            for (var li = 0; li < lines.length; li++) {
                                if (lines[li].trim()) logConsole('[PS-DIAG] ' + lines[li], 'diag');
                            }
                        }
                        if (result && result.skippedDuplicate) {
                            logConsole('Import omitido (duplicado)', 'warn');
                            return;
                        }
                        if (result && result.error) {
                            logConsole('Import error: ' + result.error, 'error');
                            return;
                        }
                        if (result && result.count > 0) {
                            logConsole('Imported ' + result.count + ' item(s)', 'diag');
                            sendVulcanMessage({ cmd: 'showMessage', txt: 'Imported ' + result.count + ' item(s)' });
                        } else {
                            logConsole('Import failed', 'error');
                            sendVulcanMessage({ cmd: 'showMessage', txt: 'Import failed' });
                        }
                    } catch (e) {
                        isImporting = false;
                        logConsole("Error parseando resultado de PS: " + e.message + ' | raw=' + String(res).substring(0, 120), "error");
                    }
                });
                return;
            }

            if (isIllustrator && data.cmd === 'ps_to_ai') {
                if (isImporting) return;
                isImporting = true;
                logConsole("Recibido ps_to_ai: " + (data.shapes ? data.shapes.length : 0) + " items");
                // Save last imagePath for Deep Scan diagnostic
                try {
                    if (data.shapes && data.shapes[0] && data.shapes[0].imagePath) {
                        localStorage.setItem('shuttle_last_img', data.shapes[0].imagePath);
                    }
                } catch(lsE) {}
                // Full shape dump to console for diagnosis
                if (data.shapes) {
                    for (var si = 0; si < data.shapes.length; si++) {
                        var sh = data.shapes[si];
                        logConsole('[SHAPE ' + si + '] type=' + sh.type + ' name="' + sh.name + '" children=' + (sh.children ? sh.children.length : 0) + ' hasImg=' + (sh.imagePath ? 'YES' : 'NO'), 'info');
                    }
                }
                evalJSX('shuttle.ai_importShapes(' + JSON.stringify(data) + ')').then(function (res) {
                    isImporting = false;
                    try {
                        var result = JSON.parse(res);
                        // Print full JSX diagnostic to console
                        if (result && result.diag) {
                            var lines = result.diag.split('|||');
                            for (var li = 0; li < lines.length; li++) {
                                if (lines[li].trim()) logConsole('[DIAG] ' + lines[li], 'diag');
                            }
                        }
                        if (result && result.count > 0) showMsg('Imported ' + result.count + ' items');
                        else if (!isImportWorker) showMsg('Imported!');
                    } catch (e) {
                        isImporting = false;
                        if (!isImportWorker) showMsg('Imported!');
                    }
                });
            }

            if (isPhotoshop && data.cmd === 'pull_from_ps') {
                // PS received a pull request from AI. Use a local guard to prevent
                // handling the same pull twice (in case old listeners somehow survive).
                if (isHandlingPull) return;
                isHandlingPull = true;
                evalJSX('shuttle.ps_getSelection(' + JSON.stringify(data.prefs || prefs) + ')').then(function (result) {
                    isHandlingPull = false;
                    try {
                        var shapes = JSON.parse(result);
                        if (shapes && shapes.length > 0) {
                            sendVulcanMessage({ cmd: 'ps_to_ai', shapes: shapes, prefs: data.prefs || prefs });
                        } else {
                            sendVulcanMessage({ cmd: 'showMessage', txt: 'Nothing selected in Ps' });
                        }
                    } catch (e) { isHandlingPull = false; }
                });
            }

            if (isIllustrator && data.cmd === 'pull_from_ai') {
                if (isHandlingPullFromAi) return;
                if (shouldThrottleGlobal('shuttle_guard_pull_from_ai_responder', 1800)) return;
                if (!claimPullRequestOnce(data.requestId)) return;
                isHandlingPullFromAi = true;
                evalJSX('shuttle.ai_getSelection(' + JSON.stringify(data.prefs || prefs) + ')').then(function (result) {
                    try {
                        var shapes = JSON.parse(result);
                        if (shapes && shapes.length > 0) {
                            sendVulcanMessage({
                                cmd: 'ai_to_ps',
                                shapes: shapes,
                                prefs: data.prefs || prefs,
                                requestId: data.requestId || null,
                                sourceInstance: panelInstanceId
                            });
                        } else {
                            sendVulcanMessage({
                                cmd: 'showMessage',
                                txt: 'Nothing selected in Ai',
                                requestId: data.requestId || null,
                                sourceInstance: panelInstanceId
                            });
                        }
                    } catch (e) { }
                    finally {
                        setTimeout(function () { isHandlingPullFromAi = false; }, 800);
                    }
                });
            }

            if (data.cmd === 'showMessage' && isPanelExtension) { showMsg(data.txt || 'Done'); }
            if (data.cmd === 'shuttle_reload') { window.location.reload(true); }
        });

        var menuXml = '<Menu><MenuItem Id="reload" Label="Reload Panel" Enabled="true" Checked="false"/></Menu>';
        cs.setContextMenu(menuXml, function (id) {
            if (id === 'reload') window.location.reload(true);
        });
        cs.setPanelFlyoutMenu(menuXml);
        cs.addEventListener('com.adobe.csxs.events.flyoutMenuClicked', function (e) {
            if (e.data.menuId === 'reload') window.location.reload(true);
        });

        initUI();
    } catch (e) {
        document.getElementById('msg').textContent = 'CRITICAL: ' + e.message;
        document.getElementById('msg').style.display = 'block';
        document.getElementById('msg').style.backgroundColor = 'red';
    }
})();
