
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

    // --- FIX: RESET SEND ALL BUTTON ---
    const btnAll = document.getElementById('btnMassSend');
    if (btnAll) {
        btnAll.disabled = false;
        btnAll.innerText = "🚀 ENVIAR TODO (ROBOT)";
        btnAll.style.background = "#2e7d32";
        btnAll.style.color = "white";
    }

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
window.startMassRobot = startMassRobot; // RENAMED
window.stopMassQueue = stopMassQueue;
window.loadCommunicationTargets = loadCommunicationTargets;
window.sendWhatsAppMessage = sendWhatsAppMessage;

// --- ROBOT MASS SEND ---
// --- DEBUG LOAD ---
console.log("✅ comunicados_logic.js cargado correctamente v26.44");

// Optional: Auto-check button binding on load
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnMassSend'); // USE ID
    if (btn) {
        console.log("Found btnMassSend, attaching listener explicitly.");
        btn.addEventListener('click', (e) => {
            // Don't preventDefault here heavily, but logging helps
            console.log("Button 'btnMassSend' clicked via Listener");
            // Function call is already in onclick, but this confirms binding
        });
    } else {
        console.warn("❌ Button btnMassSend NOT FOUND on load.");
    }
});

// --- MASS SENDER FUNCTIONS REMOVED ---
// Logic moved to: mass_sender_v2.js for better management and updates.
// See: startMassRobot() in mass_sender_v2.js

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
