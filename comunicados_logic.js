
// --- COMUNICADOS LOGIC ---

// Global list to store loaded targets
let currentCommList = [];

async function loadCommunicationTargets() {
    if (!db) return;

    const btn = document.querySelector('button[onclick="loadCommunicationTargets()"]');
    if (btn) { btn.disabled = true; btn.innerText = "⏳ Cargando..."; }

    const grade = document.getElementById('commGrade').value;
    const section = document.getElementById('commSection').value;

    try {
        let query = db.collection('students');

        if (grade !== 'todos') {
            query = query.where('g', '==', grade);
        }
        if (section !== 'todos') {
            query = query.where('s', '==', section);
        }

        const snapshot = await query.get();

        const targets = [];
        snapshot.forEach(doc => {
            const s = doc.data();
            // Filter only valid phones
            if (s.p && s.p.length >= 9) {
                targets.push({
                    id: doc.id,
                    n: s.n,
                    g: s.g,
                    s: s.s,
                    p: s.p
                });
            }
        });

        currentCommList = targets; // Store globally
        renderCommunicationList(targets);

        if (targets.length === 0) {
            showToast("No se encontraron alumnos con celular en ese filtro.", "info");
        } else {
            showToast(`Se cargaron ${targets.length} alumnos.`, "success");
        }

    } catch (e) {
        console.error(e);
        showToast("Error cargando lista: " + e.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "👥 Cargar Lista"; }
    }
}

function renderCommunicationList(list) {
    const container = document.getElementById('commListCard');
    const tbody = document.getElementById('commListBody');
    const countSpan = document.getElementById('commCount');

    container.style.display = 'block';
    tbody.innerHTML = '';
    countSpan.innerText = `(${list.length} destinatarios)`;

    list.forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.id = `row-${index}`; // Add ID for updating
        tr.style.borderBottom = '1px solid #eee';

        tr.innerHTML = `
            <td style="padding:10px;">${student.n}</td>
            <td style="padding:10px;">${student.g}° "${student.s}"</td>
            <td style="padding:10px;">${student.p}</td>
            <td style="padding:10px; text-align:right;">
                <button id="btn-${index}" onclick="sendWhatsAppMessage('${student.p}', '${student.n}', this)" 
                    class="btn-wa-send"
                    style="background: #25D366; color: white; border: none; padding: 5px 15px; border-radius: 20px; cursor: pointer; font-size: 13px; font-weight: bold;">
                    📤 Enviar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function sendWhatsAppMessage(phone, name, btnElement) {
    const rawMsg = document.getElementById('commMessage').value;
    if (!rawMsg) {
        alert("Por favor escribe un mensaje primero.");
        return;
    }

    // Check if Robot Mode is active (default for mass send, but let's check global toggle if exists, or just queue it)
    // For individual manual clicks, we open WA Web.

    // Clean phone
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 9) cleanPhone = '51' + cleanPhone;

    // Encode message
    const finalMsg = encodeURIComponent(rawMsg);

    // Open WA
    window.open(`https://wa.me/${cleanPhone}?text=${finalMsg}`, '_blank');

    // Update button visual
    if (btnElement) {
        btnElement.innerText = "✅ Enviado";
        btnElement.style.background = "#ccc";
        btnElement.style.color = "#666";
        btnElement.disabled = true;
    }
}

// Force global scope availability
window.sendAllComms = sendAllComms;
window.stopMassQueue = stopMassQueue;
window.loadCommunicationTargets = loadCommunicationTargets;
window.sendWhatsAppMessage = sendWhatsAppMessage;

// --- ROBOT MASS SEND ---
// --- DEBUG LOAD ---
console.log("✅ comunicados_logic.js cargado correctamente v26.43");
// Optional: Auto-check button binding on load
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('button[onclick="sendAllComms()"]');
    if (btn) {
        console.log("Found sendAllComms button, attaching listener explicitly.");
        btn.addEventListener('click', (e) => {
            e.preventDefault(); // Stop form submit if any
            console.log("Button clicked via Listener");
            sendAllComms();
        });
    }
});

// --- ROBOT MASS SEND ---
async function sendAllComms() {
    console.log("Attempting to send all comms... (Function Called)");
    try {
        const rawMsg = document.getElementById('commMessage').value;
        if (!rawMsg) {
            alert("⚠️ Escribe un mensaje antes de enviar.");
            return;
        }

        if (typeof db === 'undefined' || !db) {
            alert("Error: No hay conexión con la base de datos (db undefined). Revisa tu internet o recarga.");
            return;
        }

        if (!currentCommList || currentCommList.length === 0) {
            alert("⚠️ La lista de destinatarios está vacía. Carga la lista primero.");
            return;
        }

        if (!confirm(`¿Estás seguro de enviar este mensaje a ${currentCommList.length} personas usando el ROBOT?\n\nAsegúrate de que el 'Servidor Robot' esté encendido.`)) {
            return;
        }

        const btnAll = document.querySelector('button[onclick="sendAllComms()"]');
        if (btnAll) btnAll.disabled = true;

        showToast("🚀 Iniciando envío masivo a la cola...", "info");

        let count = 0;
        const total = currentCommList.length;

        // Greetings for humanization
        const greetings = ["Hola", "Buen día", "Saludos", "Estimado(a)", "Hola qué tal"];

        for (let i = 0; i < total; i++) {
            const s = currentCommList[i];

            // Update UI row
            const btn = document.getElementById(`btn-${i}`);
            if (btn) {
                btn.innerText = "⏳ Encolando...";
                btn.disabled = true;
            }

            try {
                // --- PERSONALIZATION LOGIC ---
                // 1. Pick random greeting
                const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];

                // 2. Construct personalized header
                // "Hola JUAN PEREZ,"
                const personalizedHeader = `*${randomGreeting} ${s.n},*`;

                // 3. Combine parts: Header + User Message + Dynamic Footer + Invisible Hash
                // We regenerate footer and hash for EVERY message to ensure uniqueness.
                const uniqueFooter = ""; // getDynamicFooter(); // Disabled
                const invisibleHash = getInvisibleHash();

                const personalizedMessage = `${personalizedHeader}\n\n${rawMsg}${uniqueFooter} ${invisibleHash}`;

                await db.collection('mail_queue').add({
                    phone: s.p,
                    name: s.n,
                    message: personalizedMessage,
                    status: 'pending',
                    type: 'mass', // LOW PRIORITY
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                if (btn) {
                    btn.innerText = "🤖 En cola";
                    btn.style.background = "#FF9800"; // Orange for pending
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
        console.error("FATAL ERROR in sendAllComms:", globalError);
        alert("Error crítico al enviar: " + globalError.message);
    }
}

// Helper functions moved out to avoid scope issues in some strict modes (optional but safer)
function getInvisibleHash() {
    const zeroWidthChars = ['\u200B', '\u200C', '\u200D', '\u2060'];
    let hash = '';
    // Add 3-5 random invisible chars
    const len = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < len; i++) {
        hash += zeroWidthChars[Math.floor(Math.random() * zeroWidthChars.length)];
    }
    return hash;
}


// --- STOP / CLEAR QUEUE ---
async function stopMassQueue() {
    if (!confirm("🚨 ¿ESTÁS SEGURO DE DETENER EL ENVÍO?\n\nEsto borrará todos los mensajes 'Pendientes' de la cola. Los que ya están processando no se pueden detener.")) {
        return;
    }

    const btn = document.querySelector('button[onclick="stopMassQueue()"]');
    if (btn) btn.innerText = "⏳ Limpiando...";

    try {
        const batchSize = 400;
        const snapshot = await db.collection('mail_queue')
            .where('status', '==', 'pending')
            .get();

        if (snapshot.empty) {
            showToast("No hay mensajes pendientes para borrar.", "info");
            if (btn) btn.innerText = "🛑 DETENER / LIMPIAR";
            return;
        }

        const batch = db.batch();
        let count = 0;
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
            count++;
        });

        await batch.commit();
        showToast(`🛑 SE ELIMINARON ${count} MENSAJES PENDIENTES.`, "success");

    } catch (e) {
        console.error("Error clearing queue", e);
        showToast("Error al limpiar cola: " + e.message, "error");
    } finally {
        if (btn) btn.innerText = "🛑 DETENER / LIMPIAR";
    }
}

// --- RESET LIST ON FILTER CHANGE ---
function resetCommList() {
    // Hide the list container
    document.getElementById('commListCard').style.display = 'none';
    // Clear global array
    currentCommList = [];
    // Clear table body
    document.getElementById('commListBody').innerHTML = '';

    // showToast("Filtro cambiado. Por favor carga la lista de nuevo.", "info");
}
