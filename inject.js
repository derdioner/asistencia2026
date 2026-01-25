
// --- INJECTED MASS ROBOT LOGIC (UTF8 SAFE) ---

// Define global if missing (Safe check)
if (typeof currentCommList === 'undefined') {
    var currentCommList = [];
}

// Force global scope availability
window.startMassRobot = startMassRobot;

async function startMassRobot() {
    console.log("🔥 startMassRobot FUNCTION EXECUTED 🔥");

    if (typeof db === 'undefined' || !db) {
        alert("CRITICAL ERROR: 'db' object missing in script.js context.");
        return;
    }

    try {
        const rawMsg = document.getElementById('commMessage').value;
        if (!rawMsg) {
            alert("⚠️ Escribe un mensaje antes de enviar.");
            return;
        }

        // Check list availability
        if (!currentCommList || currentCommList.length === 0) {
            alert("⚠️ La lista de destinatarios parece vacía. Carga la lista primero.");
            return;
        }

        if (!confirm(`🚀 CONFIRMACIÓN\n\n¿Enviar mensaje a ${currentCommList.length} personas usando el ROBOT?\n\nRequiere 'Servidor Robot' activo.`)) {
            return;
        }

        const btnAll = document.getElementById('btnMassSend');
        if (btnAll) btnAll.disabled = true;

        showToast("🚀 Iniciando envío masivo...", "info");

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
                const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
                const personalizedHeader = `*${randomGreeting} ${s.n},*`;

                const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\u2060'];
                let invisibleHash = '';
                const len = Math.floor(Math.random() * 3) + 3;
                for (let k = 0; k < len; k++) {
                    invisibleHash += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
                }

                const personalizedMessage = `${personalizedHeader}\n\n${rawMsg} ${invisibleHash}`;

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
    } catch (globalError) {
        console.error("FATAL ERROR in startMassRobot:", globalError);
        alert("Error crítico al enviar: " + globalError.message);
    }
}
