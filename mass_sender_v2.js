
// --- MASS SENDER V2 ---
console.log("🔥 mass_sender_v2.js LOADED (V1.2) 🔥");
// alert("DEBUG: mass_sender_v2.js ha cargado correctamente."); // Uncomment if needed for extreme debugging

// Force global binding
window.startMassRobot = startMassRobot;

// Robust Event Listener Binding
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnMassSend');
    if (btn) {
        console.log("✅ Button 'btnMassSend' found. Attaching listener.");
        btn.onclick = null; // Clear HTML attribute to avoid double call
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log("🖱️ Click detectado por EventListener JS");
            startMassRobot();
        });
    } else {
        console.warn("⚠️ Button 'btnMassSend' NOT FOUND in DOM on load.");
    }
});

async function startMassRobot() {
    console.log("🔥 startMassRobot FUNCTION EXECUTED 🔥");
    // alert("🔥 startMassRobot INICIADO 🔥"); // Visual confirmation for user

    // Check DB
    if (typeof db === 'undefined' || !db) {
        // Fallback check
        if (window.db) {
            console.log("Recovered DB from window");
        } else {
            alert("CRITICAL ERROR: 'db' object missing. script.js failed?");
            return;
        }
    }

    // Check List
    if (!currentCommList || currentCommList.length === 0) {
        // Try to access window directly
        if (window.currentCommList && window.currentCommList.length > 0) {
            currentCommList = window.currentCommList;
        } else {
            alert("⚠️ La lista de destinatarios parece vacía. Carga la lista primero.");
            return;
        }
    }

    const rawMsg = document.getElementById('commMessage').value;
    if (!rawMsg) {
        alert("⚠️ Escribe un mensaje antes de enviar.");
        return;
    }

    if (!confirm(`🚀 CONFIRMACIÓN (V2)\n\n¿Enviar mensaje a ${currentCommList.length} personas usando el ROBOT?\n\nRequiere 'Servidor Robot' activo.`)) {
        return;
    }

    showToast("🚀 Iniciando envío masivo...", "info");

    const btnAll = document.getElementById('btnMassSend');
    if (btnAll) btnAll.disabled = true;

    let count = 0;
    const total = currentCommList.length;
    const greetings = ["Hola", "Buen día", "Saludos", "Estimado(a)", "Hola qué tal"];

    for (let i = 0; i < total; i++) {
        const s = currentCommList[i];
        const btn = document.getElementById(`btn-${i}`);
        if (btn) {
            btn.innerText = "⏳ Encolando...";
            btn.disabled = true;
        }

        try {
            // --- PERSONALIZATION LOGIC (V3 - Emojis & Details) ---
            const greetings = ["HOLA", "BUEN DÍA", "SALUDOS", "ESTIMADO(A)", "HOLA QUÉ TAL"];
            const emojis = ["✅", "🏫", "🎒", "👋", "🕒", "✨", "📌"];

            const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

            // Header: *✅ HOLA JUAN PEREZ*
            // Details: DNI: 12345678 | AULA: 5° "A"
            const personalizedHeader = `*${randomEmoji} ${randomGreeting} ${s.n}*\nDNI: ${s.id || 'S/D'} | AULA: ${s.g}° "${s.s}"`;

            const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\u2060'];
            let invisibleHash = '';
            const len = Math.floor(Math.random() * 3) + 3;
            for (let k = 0; k < len; k++) {
                invisibleHash += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
            }

            const personalizedMessage = `${personalizedHeader}\n\n${rawMsg}\n\n${invisibleHash}`;

            await db.collection('mail_queue').add({
                phone: s.p,
                name: s.n,
                message: personalizedMessage,
                status: 'pending',
                type: 'mass',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            if (btn) {
                btn.innerText = "🤖 En cola";
                btn.style.background = "#FF9800";
            }
            count++;
        } catch (e) {
            console.error("Error queueing", e);
            if (btn) {
                btn.innerText = "❌ Error";
                btn.style.background = "#F44336";
            }
        }
    }

    showToast(`✅ Se enviaron ${count} mensajes a la cola del Robot.`, "success");
    if (btnAll) {
        btnAll.innerText = "✅ FINALIZADO";
        btnAll.style.background = "#ccc";
    }
}
