
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

// --- ROBOT MASS SEND ---
async function sendAllComms() {
    const rawMsg = document.getElementById('commMessage').value;
    if (!rawMsg) {
        alert("⚠️ Escribe un mensaje antes de enviar.");
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

    // Batch add to Firestore
    const batchSize = 100; // Firestore batch limit varies, but we'll add one by one or promises for simplicity in this context

    for (let i = 0; i < total; i++) {
        const s = currentCommList[i];

        // Update UI row
        const btn = document.getElementById(`btn-${i}`);
        if (btn) {
            btn.innerText = "⏳ Encolando...";
            btn.disabled = true;
        }

        try {
            await db.collection('mail_queue').add({
                phone: s.p,
                name: s.n,
                message: rawMsg,
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
}
