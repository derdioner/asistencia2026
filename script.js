// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAjVxNXeyg4D62SslkPG3atvi_0_12Wf2E",
    authDomain: "gh20261.firebaseapp.com",
    projectId: "gh20261",
    storageBucket: "gh20261.firebasestorage.app",
    messagingSenderId: "582998426268",
    appId: "1:582998426268:web:a33229f254386272956359"
};
// Initialize Firebase
let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase conectado");
} catch (error) {
    console.warn("Error inicializando Firebase (¿Faltan las llaves?):", error);
    alert("⚠️ Configura las llaves de Firebase en script.js para que funcione la nube.");
}

// TABS LOGIC
function openTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-btn');

    tabs.forEach(tab => tab.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));

    document.getElementById(tabName).classList.add('active');

    // Highlight correct button
    const activeBtnIndex = tabName === 'generator' ? 0 : 1;
    buttons[activeBtnIndex].classList.add('active');

    // Start scanner only if tab is scanner
    if (tabName === 'scanner') {
        startScanner();
    } else {
        stopScanner();
    }
}

// --- DIAGNOSTIC TOOL ---
async function diagnoseConnection() {
    logToScreen("--- INICIANDO DIAGNÓSTICO ---");

    if (!db) {
        logToScreen("ERROR CRÍTICO: Firebase no inicializado.");
        alert("Error: Firebase no está configurado (Ver script.js).");
        return;
    }

    try {
        logToScreen("1. Verificando red...");
        // Ping Google (fetch favicon) or just rely on Firestore network error

        logToScreen("2. Intentando ESCRIBIR en Firestore...");
        const testRef = db.collection('_diagnostics').doc('connection_test');
        await testRef.set({
            timestamp: new Date().toISOString(),
            status: 'ok',
            device: navigator.userAgent
        });

        logToScreen("✅ ESCRITURA EXITOSA.");
        logToScreen("La conexión funciona perfectamente.");
        alert("✅ CONEXIÓN EXITOSA\n\nEl sistema puede leer y escribir en la nube.\nSi tus datos no se guardan, puede ser un problema lógico, pero la conexión está bien.");

    } catch (error) {
        logToScreen("❌ FALLÓ LA ESCRITURA:");
        logToScreen(error.code + " - " + error.message);

        if (error.code === 'permission-denied') {
            alert("🔒 BLOQUEADO POR PERMISOS\n\nTu base de datos está en 'Modo Bloqueado'.\n\nSOLUCIÓN:\n1. Ve a Firebase Console -> Firestore Database -> Reglas.\n2. Cambia 'allow read, write: if false;' por 'allow read, write: if true;'.\n3. Publicar.");
        } else if (error.code === 'unavailable') {
            alert("📡 SIN CONEXIÓN\n\nNo se puede contactar con Firebase. Revisa tu internet o firewall.");
        } else {
            alert("❌ ERROR DE CONEXIÓN: " + error.message);
        }
    }
}

// --- GENERATOR LOGIC ---
let qrCodeObj = null;
let unsubscribeStudents = null;

// Helper logging
function logToScreen(msg) {
    const log = document.getElementById('debug-log');
    if (log) {
        const line = document.createElement('div');
        line.innerText = `> ${new Date().toLocaleTimeString()} ${msg}`;
        line.style.borderBottom = "1px solid #444";
        log.appendChild(line);
        log.scrollTop = log.scrollHeight; // Auto scroll
    }
    console.log(msg);
}

// Subscribe to Students List for Live View
function subscribeToStudents() {
    if (!db || unsubscribeStudents) return;

    logToScreen("Suscribiendo a lista (sin orden)...");

    unsubscribeStudents = db.collection('students')
        .orderBy('created', 'desc') // Ordenar por fecha para ver los ÚLTIMOS REALES
        .limit(5) // Solo los 5 últimos
        .onSnapshot((snapshot) => {
            logToScreen(`Recibidos ${snapshot.size} alumnos de la nube.`);

            const list = document.getElementById('generatedList');
            if (!list) return;
            list.innerHTML = "";

            if (snapshot.empty) {
                list.innerHTML = "<tr><td colspan='3' style='text-align:center'>No hay datos</td></tr>";
                return;
            }

            snapshot.forEach(doc => {
                const s = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `<td>${s.n}</td><td>${s.g}°</td><td>"${s.s}"</td>`;
                list.appendChild(row);
            });
        }, (error) => {
            console.error("Error obteniendo lista alumnos:", error);

            // Check for missing index error
            if (error.code === 'failed-precondition') {
                alert("⚠️ REQUIERE ÍNDICE: Para ver los 'Últimos 5' ordenados, Firestore necesita un índice.\n\nAbre la Consola del navegador (F12), mira el error rojo y dale clic al enlace para crearlo automáticamente.");
            }

            const list = document.getElementById('generatedList');
            if (list) list.innerHTML = `<tr><td colspan='3' style='color:red'>Error: ${error.message}</td></tr>`;
        });
}

// Start listener on load or tab switch? 
// Let's safe init it.
setTimeout(subscribeToStudents, 1500);


async function generateQR() {
    logToScreen("Botón Generar Presionado");
    if (!db) {
        logToScreen("ERROR: DB no existe");
        return alert("Firebase no configurado o sin conexión");
    }

    const nameInput = document.getElementById('studentName');
    const dniInput = document.getElementById('studentDNI');
    const gradeInput = document.getElementById('studentGrade');
    const sectionInput = document.getElementById('studentSection');
    const phoneInput = document.getElementById('parentPhone');

    const name = nameInput.value.trim();
    const dni = dniInput.value.trim();
    const grade = gradeInput.value;
    const section = sectionInput.value;
    const phone = phoneInput.value.trim();

    // Validation
    if (!name || !dni) {
        alert("Por favor ingresa al menos Nombre y DNI.");
        return;
    }

    if (dni.length !== 8) {
        alert("El DNI debe tener exactamente 8 números.");
        return;
    }

    if (phone && phone.length !== 9) {
        alert("El número del apoderado debe tener exactamente 9 números.");
        return;
    }

    // Check for duplicate DNI in Firestore
    try {
        logToScreen(`Verificando DNI ${dni}...`);
        const docRef = await db.collection('students').where('id', '==', dni).get();
        if (!docRef.empty) {
            logToScreen("DNI detectado como duplicado.");
            const existing = docRef.docs[0].data();
            const proceed = confirm(`El alumno ${existing.n} ya existe.\n¿Quieres ver su código QR existente?`);

            if (proceed) {
                // Generate QR with existing data
                const qrData = {
                    n: existing.n,
                    id: existing.id,
                    g: existing.g,
                    s: existing.s,
                    p: existing.p
                };
                const qrString = JSON.stringify(qrData);

                const container = document.getElementById('qrcode');
                container.innerHTML = "";

                qrCodeObj = new QRCode(container, {
                    text: qrString,
                    width: 400,
                    height: 400,
                    colorDark: "#000000",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });

                document.getElementById('downloadBtn').style.display = 'block';
                const qrText = document.getElementById('qr-text');
                qrText.innerText = `${existing.n} - ${existing.g}° "${existing.s}"`;
                qrText.style.display = 'block';

                // ADD LOGO
                setTimeout(addLogoToQR, 100);

                showToast("QR Recuperado", "success");
            }
            return; // Stop processing
        }

        // Create a data object
        // Usamos fecha local para evitar problemas con versiones de SDK
        const studentData = {
            n: name,
            id: dni,
            g: grade,
            s: section,
            p: phone,
            created: new Date().toISOString()
        };

        // --- OPTIMISTIC UI: GENERATE QR IMMEDIATELY ---
        // Convert to string for QR
        const qrData = { ...studentData };
        delete qrData.created; // Clean for QR
        const qrString = JSON.stringify(qrData);

        const container = document.getElementById('qrcode');
        container.innerHTML = ""; // Clear previous

        qrCodeObj = new QRCode(container, {
            text: qrString,
            width: 400,
            height: 400,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // ADD LOGO
        setTimeout(addLogoToQR, 100);

        document.getElementById('downloadBtn').style.display = 'block';
        const qrText = document.getElementById('qr-text');
        qrText.innerText = `${name} - ${grade}° "${section}"`;
        qrText.style.display = 'block';

        // --- BACKGROUND SAVE ---
        logToScreen("Intentando guardar en nube...");

        try {
            // Create a timeout promise
            const timeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Tiempo de espera agotado (5s). Revisa tu conexión.")), 5000);
            });

            // Race between Save and Timeout
            await Promise.race([
                db.collection('students').add(studentData),
                timeout
            ]);

            logToScreen("GUARDADO EXITOSO (Confirmado por SDK)");
            showToast("¡Pase Guardado en la Nube!", "success");

            // Clear inputs ONLY if save was successful
            nameInput.value = '';
            dniInput.value = '';
            phoneInput.value = '';
            nameInput.focus();
        } catch (saveError) {
            logToScreen("ERROR ESCRITURA: " + saveError.message);
            console.error("Error guardando en nube:", saveError);
            alert("⚠️ El QR se generó, pero NO se pudo guardar en la nube: " + saveError.message);
        }

    } catch (error) {
        logToScreen("ERROR FATAL: " + error.message);
        console.error("Error FATAL generando:", error);
        alert("⚠️ Error inesperado: " + error.message);
    }
}

async function exportGeneratedDatabase() {
    if (!db) return;
    try {
        const snapshot = await db.collection('students').get();
        if (snapshot.empty) {
            alert("No hay estudiantes en la base de datos.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Nombre;DNI;Grado;Seccion;Telefono Apoderado\n";

        snapshot.forEach(doc => {
            const st = doc.data();
            const safeName = `"${st.n}"`;
            csvContent += `${safeName};${st.id};${st.g};${st.s};${st.p || ''}\n`;
        });

        downloadCSV(csvContent, "BaseDatos_Alumnos_Cloud.csv");

    } catch (e) {
        console.error(e);
        alert("Error descargando base de datos");
    }
}

function downloadQR() {
    const qrImg = document.querySelector('#qrcode img');
    if (qrImg) {
        const link = document.createElement('a');
        link.href = qrImg.src;
        link.download = `QR_Asistencia.png`;
        link.click();
    }
}

// --- SCANNER LOGIC ---
let html5QrcodeScanner = null;
let isScanning = false;
let currentAttendanceList = []; // Local cache for table rendering
let unsubscribeListener = null;

function startScanner() {
    if (isScanning) return;

    // Start Realtime Listener
    if (db && !unsubscribeListener) {
        // Listen to today's attendance? Or last 50?
        // Let's just listen to the last 50 records for performance, or filter by today client-side if dataset is small.
        // Better: Filter by date string if possible?
        // For simplicity: Order by timestamp desc limit 100.
        unsubscribeListener = db.collection('attendance')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .onSnapshot((snapshot) => {
                currentAttendanceList = [];
                snapshot.forEach(doc => {
                    currentAttendanceList.push(doc.data());
                });
                renderHistory(); // Auto-update table
            });
    }

    setTimeout(() => {
        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5QrcodeScanner(
                "reader", { fps: 10, qrbox: { width: 250, height: 250 } },
                false
            );
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
            isScanning = true;
        }
    }, 100);
}

function stopScanner() {
    // Optional: Stop listener if leaving tab to save bandwidth?
    // For now we keep it to show updates even in other tab.
}

const processedScans = new Map(); // Local debounce cache

async function onScanSuccess(decodedText, decodedResult) {
    if (!db) return;

    try {
        const data = JSON.parse(decodedText);
        // Basic validation
        if (!data.n || !data.id) throw new Error("QR Inválido");

        const now = new Date();
        const todayDate = now.toLocaleDateString();

        // --- 1. SYNCHRONOUS DEBOUNCE (CRITICAL FIX) ---
        // Prevent processing the same DNI multiple times within 5 seconds locally
        // This stops the "3 times" bug caused by rapid scanner callbacks before DB updates
        if (processedScans.has(data.id)) {
            const lastTime = processedScans.get(data.id);
            if ((now - lastTime) < 5000) {
                return; // Ignore duplicate scan within 5s
            }
        }
        // Mark as processed immediately
        processedScans.set(data.id, now);

        // --- 2. LOGIC CHECKS ---
        // Check if recently scanned in LOCAL cache (via Snapshot) to avoid hitting DB
        const lastScan = currentAttendanceList.find(r => r.dni === data.id);
        if (lastScan && lastScan.displayDate === todayDate) {
            // Check time difference (Firestore timestamp)
            const lastTime = new Date(lastScan.timestamp.seconds * 1000);
            if ((now - lastTime) < 60000) { // 1 minute duplicate protection
                // Silently ignore or show warning if it wasn't caught by the 5s debounce
                return;
            }
        }

        // Check DB for daily duplicate (Standard of Truth)
        const duplicateCheck = await db.collection('attendance')
            .where('dni', '==', data.id)
            .where('displayDate', '==', todayDate)
            .get();

        if (!duplicateCheck.empty) {
            showToast(`⚠️ ${data.n} ya registró asistencia hoy`, 'error');
            return;
        }

        // Add to Firestore
        await db.collection('attendance').add({
            name: data.n,
            dni: data.id,
            grade: data.g,
            section: data.s,
            phone: data.p,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(), // Server time
            displayTime: now.toLocaleTimeString(),
            displayDate: todayDate
        });

        // Trigger Audio Feedback
        playSuccessSound();

        showToast(`✅ Asistencia: ${data.n}`, 'success');

        // --- NOTIFICATION LOGIC (Option 1: Semi-Auto) ---
        const notifyCheckbox = document.getElementById('autoNotify');
        if (notifyCheckbox && notifyCheckbox.checked) {
            if (data.p && data.p.length >= 9) {
                // Determine Greeting based on time
                const hour = now.getHours();
                let greeting = "Buenos días";
                if (hour >= 12) greeting = "Buenas tardes";
                if (hour >= 18) greeting = "Buenas noches";

                const message = `${greeting}, el estudiante *${data.n}* asistió al colegio el día de hoy ${todayDate} a las ${now.toLocaleTimeString()}.`;
                const encodedMsg = encodeURIComponent(message);

                // Use wa.me for universal link (opens App on mobile, Web on desktop)
                // Appending 51 for Peru (User location context implies Peru based on DNI/Logo)
                // If phone doesn't have country code, we assume +51.
                let phone = data.p.replace(/\D/g, ''); // strip non-digits
                if (phone.length === 9) phone = "51" + phone;

                const waLink = `https://wa.me/${phone}?text=${encodedMsg}`;

                // Open in new tab (Mobile will try to open App)
                window.open(waLink, '_blank');
            } else {
                showToast("⚠️ Sin número de apoderado para notificar", "info");
            }
        }

    } catch (e) {
        console.error("Error parsing/saving QR", e);
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = `toast show ${type}`;
    // Info style handling in CSS would be better, but inline works for quick patch or just default
    if (type === 'info') toast.style.backgroundColor = '#2196F3';
    else toast.style.backgroundColor = ''; // Reset

    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function onScanFailure(error) {
    // console.warn(error);
}

function renderHistory() {
    const list = document.getElementById('attendanceList');
    list.innerHTML = "";

    // Check if empty
    if (currentAttendanceList.length === 0) {
        list.innerHTML = "<tr><td colspan='6' style='text-align:center;'>No hay registros recientes</td></tr>";
        document.getElementById('attendanceCount').innerText = `Total: 0`;
        return;
    }

    currentAttendanceList.forEach(record => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.displayTime}</td>
            <td><strong>${record.name}</strong></td>
            <td>${record.dni}</td>
            <td>${record.grade}°</td>
            <td>"${record.section}"</td>
            <td>${record.phone || '-'}</td>
        `;
        list.appendChild(row);
    });

    // Update count (Showing count of visible records, mostly today)
    // To get REAL daily total we would need a separate query count.
    // For now:
    document.getElementById('attendanceCount').innerText = `Últimos ${currentAttendanceList.length}`;
}

async function clearHistory() {
    if (!db) return;

    // SECURITY CHECK
    if (currentUserRole !== 'ADMIN') {
        alert("⛔ Acceso Denegado: Solo administradores pueden borrar el historial.");
        return;
    }

    const password = prompt("⚠ ZONA DE PELIGRO ⚠\n\nIngrese contraseña ADMIN (1234) para REINICIAR el sistema:");

    if (password === "1234") {
        const choice = prompt("¿Qué desea borrar?\n\nEscribe 1 para: Solo Historial de Asistencia\nEscribe 2 para: REINICIO TOTAL (Asistencia + Alumnos/QRs)");

        if (choice === "1") {
            if (confirm("¿Confirmar eliminación del HISTORIAL DE ASISTENCIA?")) {
                await deleteCollection('attendance');
                alert("Historial eliminado.");
                renderHistory();
            }
        } else if (choice === "2") {
            const confirmTotal = prompt("🔴 ¡ADVERTENCIA FINAL! 🔴\n\nEsto borrará TODOS los alumnos generados y TODAS las asistencias.\n\nEscribe 'CONFIRMAR' para proceder:");
            if (confirmTotal === "CONFIRMAR") {
                showToast("Iniciando borrado total...", "info");
                await deleteCollection('attendance');
                await deleteCollection('students');
                alert("✅ SISTEMA REINICIADO DE FÁBRICA.\nSe han borrado todos los datos.");
                location.reload(); // Refresh to clear local state
            } else {
                alert("Operación cancelada.");
            }
        } else {
            alert("Opción no válida.");
        }
    } else if (password !== null) {
        alert("Contraseña incorrecta.");
    }
}

async function deleteCollection(collectionPath) {
    const batchSize = 400; // Leave safety margin for batch limit (500)
    let snapshot = await db.collection(collectionPath).limit(batchSize).get();
    let totalDeleted = 0;

    while (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        totalDeleted += snapshot.size;
        console.log(`Deleted ${snapshot.size} docs from ${collectionPath}`);

        // Get next batch
        snapshot = await db.collection(collectionPath).limit(batchSize).get();
    }
}

function exportToExcel() {
    if (currentAttendanceList.length === 0) {
        alert("No hay datos cargados para exportar.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha;Hora;Nombre;DNI;Grado;Seccion;Telefono Apoderado\n";

    currentAttendanceList.forEach(row => {
        const safeName = `"${row.name}"`;
        csvContent += `${row.displayDate};${row.displayTime};${safeName};${row.dni};${row.grade};${row.section};${row.phone}\n`;
    });

    downloadCSV(csvContent, `asistencia_cloud_${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadCSV(content, fileName) {
    const encodedUri = encodeURI(content);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function searchStudent() {
    console.log("Buscando alumno...");
    const searchInput = document.getElementById('searchDNI');
    const dni = searchInput.value.trim();

    if (!dni || dni.length !== 8) {
        alert("Por favor ingrese un DNI válido de 8 dígitos.");
        return;
    }

    if (!db) return alert("Error: No hay conexión con la base de datos.");

    try {
        showToast("Buscando en la nube...", "info");
        const snapshot = await db.collection('students').where('id', '==', dni).get();

        if (snapshot.empty) {
            alert("❌ Alumno no encontrado con ese DNI.");
            return;
        }

        const student = snapshot.docs[0].data();

        // Populate Form for visual confirmation
        document.getElementById('studentName').value = student.n;
        document.getElementById('studentDNI').value = student.id;
        document.getElementById('studentGrade').value = student.g;
        document.getElementById('studentSection').value = student.s;
        if (student.p) document.getElementById('parentPhone').value = student.p;

        // Generate QR Logic (Reuse)
        const qrData = {
            n: student.n,
            id: student.id,
            g: student.g,
            s: student.s,
            p: student.p
        };
        const qrString = JSON.stringify(qrData);

        const container = document.getElementById('qrcode');
        container.innerHTML = "";

        qrCodeObj = new QRCode(container, {
            text: qrString,
            width: 400,
            height: 400,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        document.getElementById('downloadBtn').style.display = 'block';
        const qrText = document.getElementById('qr-text');
        qrText.innerText = `${student.n} - ${student.g}° "${student.s}"`;
        qrText.style.display = 'block';

        // ADD LOGO
        setTimeout(addLogoToQR, 100);

        showToast("✅ Alumno encontrado.", "success");
        searchInput.value = ""; // Clear search

    } catch (error) {
        console.error(error);
        alert("Error al buscar: " + error.message);
    }
}

function addLogoToQR() {
    const container = document.getElementById('qrcode');
    if (!container) return;

    // QRCode.js creates a canvas and an img. We need the canvas to draw.
    let canvas = container.querySelector('canvas');
    const qrImg = container.querySelector('img');

    // If canvas is missing but img exists (some browsers/libraries hide canvas), recover it
    if (!canvas && qrImg) {
        canvas = document.createElement('canvas');
        canvas.width = qrImg.width;
        canvas.height = qrImg.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(qrImg, 0, 0);
    }

    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.src = 'logo.jpg';

    img.onload = () => {
        const size = canvas.width;
        const logoSize = size * 0.22; // 22% of QR size
        const x = (size - logoSize) / 2;
        const y = (size - logoSize) / 2;

        // Draw white background square for better contrast
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 5, y - 5, logoSize + 10, logoSize + 10);

        ctx.drawImage(img, x, y, logoSize, logoSize);

        // Update the IMG tag so the user sees the result (and download works)
        if (qrImg) {
            qrImg.src = canvas.toDataURL();
        }
    };

    img.onerror = () => {
        console.warn("No se encontró logo.jpg");
    };
}

// --- LOGIN SYSTEM ---
let currentUserRole = null; // 'ADMIN' or 'AUXILIAR'

function handleLoginKey(e) {
    if (e.key === 'Enter') attemptLogin();
}

function attemptLogin() {
    const pin = document.getElementById('loginPin').value;
    const errorMsg = document.getElementById('loginError');

    // RESET UI
    document.getElementById('tab-generator').style.display = 'block'; // Reset visibility
    const deleteBtn = document.querySelector('button[onclick="clearHistory()"]');
    if (deleteBtn) deleteBtn.style.display = 'block';

    if (pin === "1234") {
        // ADMIN
        currentUserRole = 'ADMIN';
        loginSuccess("Administrador");
    } else if (pin === "2026") {
        // AUXILIAR
        currentUserRole = 'AUXILIAR';

        // RESTRICTIONS for AUXILIAR
        document.getElementById('tab-generator').style.display = 'none'; // Hide Generator Tab
        if (deleteBtn) deleteBtn.style.display = 'none'; // Hide Delete History

        // Force switch to Scanner
        openTab('scanner');

        loginSuccess("Auxiliar");
    } else {
        errorMsg.style.display = 'block';
        errorMsg.innerText = "PIN Incorrecto";
        document.getElementById('loginPin').value = "";
    }
}

function loginSuccess(roleName) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('userRoleDisplay').innerText = roleName;
    document.getElementById('loginPin').value = "";
    document.getElementById('loginError').style.display = 'none';

    // If Admin, default to Generator. If Auxiliar, they are already forced to Scanner in previous block.
    if (currentUserRole === 'ADMIN') {
        openTab('generator');
    }
}

function logout() {
    currentUserRole = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
    stopScanner(); // Stop camera
}



function playSuccessSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        // Nice "ding" sound: Sine wave, starts at 1000Hz
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, ctx.currentTime);

        // Volume envelope: Attack fast, decay smooth
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) {
        console.warn("Audio error", e);
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Check if previously logged in? For security, always ask PIN on refresh.
    // logout(); // Ensure clean state
});

// Global Error Handler
window.onerror = function (msg, url, line) {
    // logToScreen(`ERROR GLOBAL: ${msg} (Línea ${line})`);
    console.error(`Error Script: ${msg}`);
};
