// ---------------------------------------------------------
// DEBUG DIAGNOSTIC SCRIPT - v1.0
// ---------------------------------------------------------
console.log("🔥 DEBUG SCRIPT STARTED 🔥");

window.onload = function () {
    createDebugConsole();
    log("Window Loaded. checking environment...");

    setTimeout(runDiagnostics, 2000); // Wait 2s for other scripts
};

function createDebugConsole() {
    const div = document.createElement('div');
    div.id = 'debug-console';
    div.style.position = 'fixed';
    div.style.top = '10px';
    div.style.right = '10px';
    div.style.width = '300px';
    div.style.height = '400px';
    div.style.background = 'rgba(0,0,0,0.85)';
    div.style.color = '#00FF00';
    div.style.zIndex = '999999';
    div.style.fontFamily = 'monospace';
    div.style.fontSize = '12px';
    div.style.padding = '10px';
    div.style.overflowY = 'auto';
    div.style.border = '2px solid red';
    div.innerHTML = "<h3 style='margin:0; border-bottom:1px solid lime'>DEBUG CONSOLE</h3>";
    document.body.appendChild(div);
}

function log(msg) {
    const consoleDiv = document.getElementById('debug-console');
    if (consoleDiv) {
        const p = document.createElement('div');
        p.style.borderBottom = "1px solid #333";
        p.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
        consoleDiv.appendChild(p);
    }
    console.log(`[DEBUG] ${msg}`);
}

function runDiagnostics() {
    log("Running Diagnostics...");

    // 1. Check DB
    if (typeof db !== 'undefined') {
        log("✅ DB Object FOUND");
    } else {
        log("❌ DB Object MISSING (Critical)");
    }

    // 2. Check Function
    if (typeof startMassRobot === 'function') {
        log("✅ startMassRobot FOUND");
    } else {
        log("❌ startMassRobot MISSING (Critical)");
    }

    // 3. Find Button
    const btn = document.getElementById('btnMassSend');
    if (btn) {
        log("✅ Button #btnMassSend FOUND");

        // VISUAL CHANGE
        btn.style.setProperty("background-color", "#FF00FF", "important"); // MAGENTA
        btn.style.setProperty("border", "4px solid yellow", "important");
        btn.innerHTML = "🧙‍♂️ DEBUG CLICK ME";

        // ATTACH DIRECT LISTENER
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            alert("🛑 DEBUG: CLICK RECEIVED!\nAttempting to run startMassRobot()...");
            log("🛑 USER CLICKED BUTTON!");

            if (typeof startMassRobot === 'function') {
                startMassRobot();
            } else {
                alert("Cannot run: startMassRobot is missing");
            }
        });
        log("✅ Event Listener ATTACHED to Button");
    } else {
        log("❌ Button #btnMassSend NOT FOUND in DOM");
    }
}
