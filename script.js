// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAjVxNXeyg4D62SslkPG3atvi_0_12Wf2E",
    authDomain: "gh20261.firebaseapp.com",
    projectId: "gh20261",
    storageBucket: "gh20261.firebasestorage.app",
    messagingSenderId: "582998426268",
    appId: "1:582998426268:web:a33229f254386272956359"
};

// --- PWA SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// --- PWA INSTALLATION PROMPT ---
let deferredPrompt;
const installBtn = document.getElementById('installBtn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent Chrome 67 and earlier from automatically showing the prompt
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI to notify the user they can add to home screen
    if (installBtn) installBtn.style.display = 'block';
    console.log("PWA Install Prompt Available");
});

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the A2HS prompt');
            } else {
                console.log('User dismissed the A2HS prompt');
            }
            deferredPrompt = null;
            if (installBtn) installBtn.style.display = 'none';
        });
    }
}

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
    // Find button that opens this tab
    const activeBtn = Array.from(buttons).find(btn => btn.getAttribute('onclick') === `openTab('${tabName}')`);
    if (activeBtn) activeBtn.classList.add('active');

    // Start scanner only if tab is scanner
    if (tabName === 'scanner') {
        startScanner();
    } else {
        stopScanner();
    }

    if (tabName === 'reports') {
        loadReports();
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
    const dob = document.getElementById('studentDOB').value;

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
            logToScreen("DNI detectado en nube.");
            const existingDoc = docRef.docs[0];
            const existing = existingDoc.data();

            // Check for differences
            const hasChanges = (existing.n !== name) || (existing.g !== grade) || (existing.s !== section) || (existing.p !== phone) || (existing.dob !== dob);

            if (hasChanges) {
                const doUpdate = confirm(`El alumno ${existing.n} ya existe pero con datos diferentes.\n\n¿Deseas ACTUALIZAR la información con los nuevos datos ingresados?`);
                if (doUpdate) {
                    // UPDATE LOGIC
                    await existingDoc.ref.update({
                        n: name,
                        g: grade,
                        s: section,
                        p: phone,
                        dob: dob
                    });
                    showToast("Datos actualizados correctamente", "success");

                    // Proceed to Generate QR with NEW data
                    const qrData = {
                        n: name,
                        id: dni,
                        g: grade,
                        s: section,
                        p: phone,
                        dob: dob
                    };
                    renderQR(qrData);
                    showToast("¡Datos Actualizados y QR Regenerado!", "success");
                    return; // EXIT avoid creating duplicate
                } else {
                    // Keep Existing
                    // Generate QR with existing data
                    const qrData = {
                        n: existing.n,
                        id: existing.id,
                        g: existing.g,
                        s: existing.s,
                        p: existing.p,
                        dob: existing.dob
                    };
                    renderQR(qrData); // Reuse helper
                    return;
                }
            } else {
                const proceed = confirm(`El alumno ${existing.n} ya existe.\n¿Quieres ver su código QR existente?`);
                if (proceed) {
                    const qrData = {
                        n: existing.n,
                        id: existing.id,
                        g: existing.g,
                        s: existing.s,
                        p: existing.p,
                        dob: existing.dob
                    };
                    renderQR(qrData);
                }
                return;
            }
        }

        // Create a data object
        // Usamos fecha local para evitar problemas con versiones de SDK
        const studentData = {
            n: name,
            id: dni,
            g: grade,
            s: section,
            p: phone,
            dob: dob,
            created: new Date().toISOString()
        };

        // --- OPTIMISTIC UI: GENERATE QR IMMEDIATELY ---
        // Convert to string for QR
        const qrData = { ...studentData };
        delete qrData.created; // Clean for QR

        renderQR(qrData);

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
        csvContent += "Nombre;DNI;Fecha Nacimiento;Grado;Seccion;Telefono Apoderado\n";

        snapshot.forEach(doc => {
            const st = doc.data();
            const safeName = `"${st.n}"`;
            const dob = st.dob || '';
            csvContent += `${safeName};${st.id};${dob};${st.g};${st.s};${st.p || ''}\n`;
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
            .limit(200) // Increase limit to ensure we catch all of today even if mixed
            .onSnapshot((snapshot) => {
                const todayStr = new Date().toLocaleDateString();
                currentAttendanceList = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    // STRICT filtering: Only show THIS calendar day
                    if (data.displayDate === todayStr) {
                        currentAttendanceList.push(data);
                    }
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
            displayDate: todayDate,
            status: determineLateness(now) // 'Puntual' or 'Tardanza'
        });

        // --- BIRTHDAY CHECK ---
        const isBirthday = checkBirthday(data.dob);

        if (isBirthday) {
            playBirthdayTune(data.n); // Special Melody + Greeting
            showToast(`🎂🎉 ¡FELIZ CUMPLEAÑOS ${data.n}! 🎉🎂`, 'info'); // Using info style for blue/different color
        } else {
            // Standard Feedback (Sound + Voice)
            playSuccessSound();
            showToast(`✅ Asistencia: ${data.n}`, 'success');
        }

        // Calculate styling based on status
        const isLate = (now.getHours() === 7 && now.getMinutes() > 45) || now.getHours() >= 8;
        // Note: determineLateness logic duplicated briefly for display, let's unify.

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
        list.innerHTML = "<tr><td colspan='6' style='text-align:center; padding: 15px;'>No hay registros recientes</td></tr>";
        document.getElementById('attendanceCount').innerText = `Total: 0`;
        return;
    }

    currentAttendanceList.forEach(record => {
        // Calculate status manually if missing or just use it
        let status = record.status;
        if (!status && record.timestamp) {
            status = determineLateness(new Date(record.timestamp.seconds * 1000));
        }
        status = status || "Tardanza";

        const isPuntual = status === 'Puntual';
        const color = isPuntual ? '#2E7D32' : '#C62828';
        const bg = isPuntual ? '#E8F5E9' : '#FFEBEE';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.displayTime}</td>
            <td><strong>${record.name}</strong></td>
            <td>${record.dni}</td>
            <td>${record.grade}°</td>
            <td>"${record.section}"</td>
            <td style="color:${color}; font-weight:bold; background-color:${bg}; text-align:center;">${status}</td>
        `;
        list.appendChild(row);
    });

    document.getElementById('attendanceCount').innerText = `Últimos ${currentAttendanceList.length}`;
}

async function clearHistory() {
    if (!db) return;

    // SECURITY CHECK
    if (currentUserRole !== 'ADMIN') {
        alert("⛔ Acceso Denegado: Solo administradores pueden borrar el historial.");
        return;
    }

    const password = prompt("⚠ ZONA DE PELIGRO ⚠\n\nIngrese contraseña ADMIN para REINICIAR el sistema:");

    if (password === "339710") {
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


// --- HELPER FOR LATENESS ---
function determineLateness(dateObj) {
    const hour = dateObj.getHours();
    const minute = dateObj.getMinutes();

    // STRICT Logic: 06:00 to 07:45 is Puntual.
    // Anything < 6:00 is technically "Early/Late" but we call it Tardanza per request?
    // User said: "6:00AM A 7:45 AM ES EL HORARIO NORMAL... FUERA DEL RANGO, TODOS SON TARDANZA"

    // Check range 6:00 to 7:45
    // If hour is 6, always punctual.
    // If hour is 7, minute must be <= 45.

    if (hour === 6) return 'Puntual';
    if (hour === 7 && minute <= 45) return 'Puntual';

    return 'Tardanza';
}

function checkBirthday(dobString) {
    if (!dobString) return false;
    // dobString format usually YYYY-MM-DD from HTML input
    // User might have scanned an old QR without DOB, assumes false.
    try {
        // Parse UTC components to avoid timezone shifts
        const parts = dobString.split('-');
        if (parts.length !== 3) return false;

        const birthMonth = parseInt(parts[1], 10);
        const birthDay = parseInt(parts[2], 10);

        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 0-indexed
        const currentDay = now.getDate();

        return (birthMonth === currentMonth && birthDay === currentDay);
    } catch (e) {
        console.warn("Date parse error", e);
        return false;
    }
}

function playBirthdayTune(name) {
    // Placeholder for a more complex birthday tune
    // For now, a simple chime and a voice message
    const audio = new Audio('sounds/birthday_chime.mp3'); // Assume this file exists
    audio.play().catch(e => console.error("Error playing birthday audio:", e));

    const msg = `Feliz cumpleaños ${name}!`;
    speak(msg);
}

function exportToExcel() {
    if (currentAttendanceList.length === 0) {
        alert("No hay datos cargados para exportar.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha;Hora;Estado;Nombre;DNI;Grado;Seccion;Telefono Apoderado\n";

    currentAttendanceList.forEach(row => {
        const safeName = `"${row.name}"`;
        // Fallback calculation for old records
        let status = row.status;
        if (!status && row.timestamp) {
            status = determineLateness(new Date(row.timestamp.seconds * 1000));
        }
        status = status || 'Tardanza'; // Default safely if no timestamp

        csvContent += `${row.displayDate};${row.displayTime};${status};${safeName};${row.dni};${row.grade};${row.section};${row.phone}\n`;
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
    img.src = 'logo.png'; // Updated to PNG

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

    // SECURITY: Check Authorized Device
    if (!checkDeviceAuth()) {
        errorMsg.style.display = 'block';
        errorMsg.innerText = "🚫 Dispositivo NO Autorizado.\nSolicite al Director la activación.";
        return;
    }

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

        // --- VOICE FEEDBACK ---
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance("Pase por favor");
            utterance.lang = 'es-ES'; // Spanish
            utterance.rate = 1.1; // Slightly faster
            window.speechSynthesis.speak(utterance);
        }

    } catch (e) {
        console.warn("Audio error", e);
    }
}



function playBirthdayTune(name) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        const ctx = new AudioContext();

        // Simple "Happy Birthday" Notes (Key of C)
        // G4, G4, A4, G4, C5, B4
        const notes = [
            { f: 392.00, d: 0.25, t: 0 },    // G4
            { f: 392.00, d: 0.25, t: 0.3 },  // G4
            { f: 440.00, d: 0.5, t: 0.6 },  // A4
            { f: 392.00, d: 0.5, t: 1.2 },  // G4
            { f: 523.25, d: 0.5, t: 1.8 },  // C5
            { f: 493.88, d: 0.8, t: 2.4 }   // B4
        ];

        notes.forEach(note => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle'; // Brighter sound
            osc.frequency.value = note.f;

            gain.gain.setValueAtTime(0.1, ctx.currentTime + note.t);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + note.t + note.d);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + note.t);
            osc.stop(ctx.currentTime + note.t + note.d);
        });

        // --- VOICE ---
        setTimeout(() => {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(`¡Feliz Cumpleaños ${name}! Pase por favor`);
                utterance.lang = 'es-ES';
                utterance.rate = 1.0;
                window.speechSynthesis.speak(utterance);
            }
        }, 500); // Start talking slightly after music starts

    } catch (e) {
        console.warn("Audio error", e);
    }
}



// Helper to reuse QR rendering
function renderQR(data) {
    const qrString = JSON.stringify(data);
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
    qrText.innerText = `${data.n} - ${data.g}° "${data.s}"`;
    qrText.style.display = 'block';

    // ADD LOGO
    setTimeout(addLogoToQR, 100);
}

// --- REPORTS DASHBOARD ---
let attendanceChart = null;

async function loadReports() {
    if (!db) return;

    // Ensure we have the latest data. 
    // If scanner is running, 'currentAttendanceList' might be enough, but safest is to re-render from local cache.
    // If empty, user might need to have visited scanner tab or we need to fetch.
    // For now, let's reuse 'currentAttendanceList' assuming it contains today's data (limit 100).
    // Better: If array is empty, try to fetch today's data.

    // 1. Get Total Registered (Universe)
    try {
        const studentsSnap = await db.collection('students').get();
        document.getElementById('reportRegistered').innerText = studentsSnap.size;
    } catch (e) {
        console.warn("Error counting students", e);
        document.getElementById('reportRegistered').innerText = "-";
    }

    // 2. Attendance Stats
    const total = currentAttendanceList.length;
    let puntual = 0;
    let tarde = 0;

    currentAttendanceList.forEach(r => {
        const st = r.status || (r.timestamp ? determineLateness(new Date(r.timestamp.seconds * 1000)) : 'Puntual');
        if (st === 'Tardanza') tarde++;
        else puntual++;
    });

    // Update Cards
    document.getElementById('reportTotal').innerText = total;
    document.getElementById('reportPuntual').innerText = puntual;
    document.getElementById('reportTarde').innerText = tarde;

    // Determine color
    document.getElementById('reportPuntual').style.color = '#2E7D32';
    document.getElementById('reportTarde').style.color = '#C62828';

    // RENDER CHART
    renderChart(puntual, tarde);
}

function renderChart(puntual, tarde) {
    const ctx = document.getElementById('attendanceChart').getContext('2d');

    // Destroy previous instance
    if (attendanceChart) {
        attendanceChart.destroy();
    }

    attendanceChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Puntuales', 'Tardanzas'],
            datasets: [{
                data: [puntual, tarde],
                backgroundColor: ['#66BB6A', '#EF5350'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                }
            }
        }
    });
}

function exportReportPDF() {
    window.print();
}

function logout() {
    currentUserRole = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
    stopScanner();
    updateAuthDisplay();
}


// --- DEVICE SECURITY ---
let logoClicks = 0;
const MASTER_KEY = "DIRECTOR-MASTER"; // Clave del Director

function checkDeviceAuth() {
    return localStorage.getItem('DEVICE_AUTHORIZED') === 'true';
}

function handleLogoClick() {
    logoClicks++;
    if (logoClicks === 5) {
        logoClicks = 0;
        const input = prompt("🔐 MODO DIRECTOR\n\nIngrese Clave Maestra para autorizar este dispositivo:");
        if (input === MASTER_KEY) {
            localStorage.setItem('DEVICE_AUTHORIZED', 'true');
            alert("✅ ¡Dispositivo Autorizado Exitosamente!");
            updateAuthDisplay();
        } else if (input !== null) {
            alert("❌ Calve Incorrecta");
        }
    }
}

function updateAuthDisplay() {
    const statusEl = document.getElementById('authStatus');
    if (statusEl) {
        if (checkDeviceAuth()) {
            statusEl.innerText = "🔒 Dispositivo Verificado y Seguro";
            statusEl.style.color = "#4CAF50"; // Green
        } else {
            statusEl.innerText = "🚫 Dispositivo NO Autorizado";
            statusEl.style.color = "#E57373"; // Red
        }
    }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Init Date input to Today
    const todayISO = new Date().toISOString().split('T')[0];
    document.getElementById('filterDate').value = todayISO;

    // Check if previously logged in? For security, always ask PIN on refresh.
    // logout(); // Ensure clean state
    updateAuthDisplay();

    // Load default report (No Print)
    generateFilteredReport(false);
});

async function generateFilteredReport(autoPrint = false) {
    if (!db) return;

    const dateVal = document.getElementById('filterDate').value; // YYYY-MM-DD
    const gradeVal = document.getElementById('filterGrade').value;
    const sectionVal = document.getElementById('filterSection').value;

    if (!dateVal) {
        alert("Seleccione una fecha");
        return;
    }

    // Convert Filter Date to Display Format (DD/MM/YYYY)
    // Careful with timezone issues. create Date from value + T12:00
    const dParts = dateVal.split('-');
    const displayDateFilter = `${dParts[2]}/${dParts[1]}/${dParts[0]}`;

    // --- 1. FETCH ATTENDANCE FOR DATE ---
    let attendanceData = [];
    try {
        // If date is today and we have local cache, maybe use it? 
        // Safer to fetch fresh for reports
        const snap = await db.collection('attendance')
            .where('displayDate', '==', displayDateFilter)
            .get();

        snap.forEach(doc => attendanceData.push(doc.data()));
    } catch (e) {
        console.error("Error fetching report data", e);
        showToast("Error cargando reporte", "error");
        return;
    }

    // --- 2. FILTER IN MEMORY (Grade/Section) ---
    // Firestore composite indexes might be needed for .where(G).where(S), so simple filter is safer for small sets.
    let filteredList = attendanceData.filter(row => {
        let matchG = (gradeVal === 'todos') || (row.grade == gradeVal);
        let matchS = (sectionVal === 'todos') || (row.section === sectionVal);
        return matchG && matchS;
    });

    // --- 3. CALCULATE STATS ---
    const total = filteredList.length;
    let puntual = 0;
    let tarde = 0;

    filteredList.forEach(r => {
        const st = r.status || (r.timestamp ? determineLateness(new Date(r.timestamp.seconds * 1000)) : 'Puntual');
        if (st === 'Tardanza') tarde++;
        else puntual++;
        // Attach calculated status for Table use
        r._calcStatus = st;
    });

    // --- 4. UPDATE CARDS ---
    document.getElementById('reportTotal').innerText = total;
    document.getElementById('reportPuntual').innerText = puntual;
    document.getElementById('reportTarde').innerText = tarde;

    // FIX: User requested "Total Registered" should NOT change with filters.
    // Always show Global Student Count.
    // Optimization: check if already loaded? But fetching size is cheap enough or we can cache.
    // For now, simple query for size.
    try {
        const studSnap = await db.collection('students').get();
        document.getElementById('reportRegistered').innerText = studSnap.size;
    } catch (e) {
        console.warn("Error getting student count", e);
    }

    // --- 5. RENDER CHART ---
    renderChart(puntual, tarde);

    // --- 6. PREPARE PRINT TABLE ---
    const tbody = document.getElementById('printTableBody');
    tbody.innerHTML = "";

    // Summary
    const gradeText = gradeVal === 'todos' ? 'Todos' : `${gradeVal}°`;
    const secText = sectionVal === 'todos' ? 'Todas' : `"${sectionVal}"`;
    document.getElementById('printFilterSummary').innerText = `${displayDateFilter} | Grado: ${gradeText} | Sección: ${secText}`;

    // Sort by Time
    filteredList.sort((a, b) => (a.displayTime > b.displayTime) ? 1 : -1);

    filteredList.forEach((row, index) => {
        const tr = document.createElement('tr');
        const color = row._calcStatus === 'Tardanza' ? 'color:#D32F2F' : 'color:#000'; // Make late red even in print? (Usually b/w, but greyscale works)
        tr.innerHTML = `
            <td style="border: 1px solid #000; padding: 5px; text-align: center;">${index + 1}</td>
            <td style="border: 1px solid #000; padding: 5px;">${row.displayTime}</td>
            <td style="border: 1px solid #000; padding: 5px;">${row.name}</td>
            <td style="border: 1px solid #000; padding: 5px; text-align: center;">${row.grade}° ${row.section}</td>
            <td style="border: 1px solid #000; padding: 5px; text-align: center; ${color}">${row._calcStatus}</td>
        `;
        tbody.appendChild(tr);
    });

    // --- 7. AUTO PRINT ---
    // Minimal delay to ensure DOM update
    if (autoPrint) {
        setTimeout(() => {
            window.print();
        }, 500);
    }
}

// Deprecated old loadReports, pointing to new one
async function loadReports() {
    generateFilteredReport(false);
}

// Global Error Handler
window.onerror = function (msg, url, line) {
    // logToScreen(`ERROR GLOBAL: ${msg} (Línea ${line})`);
    console.error(`Error Script: ${msg}`);
};
