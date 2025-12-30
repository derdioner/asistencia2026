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
        navigator.serviceWorker.register('sw.js').then(registration => {
            console.log('SW Registered');

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version found
                        if (confirm("📢 ¡Nueva actualización disponible!\n\nSe han detectado mejoras (Nombre y Logo nuevo).\n¿Recargar ahora para aplicar cambios?")) {
                            window.location.reload();
                        }
                    }
                });
            });
        }).catch(err => console.log('SW Fail:', err));
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

    if (tabName === 'report2') {
        loadUsers();
        loadDevices(); // Load devices too
    }

    if (tabName === 'incidents') {
        loadActiveIncidents();
    }

    // Roles tab removed logic
}

// --- DIAGNOSTIC TOOL ---
async function diagnoseConnection() {
    if (!db) {
        alert("Error: Firebase no está configurado (Ver script.js).");
        return;
    }

    try {
        const testRef = db.collection('_diagnostics').doc('connection_test');
        await testRef.set({
            timestamp: new Date().toISOString(),
            status: 'ok',
            device: navigator.userAgent
        });

        alert("✅ CONEXIÓN EXITOSA\n\nEl sistema puede leer y escribir en la nube.\nSi tus datos no se guardan, puede ser un problema lógico, pero la conexión está bien.");

    } catch (error) {
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
let lastGeneratedStudent = null; // Track last student for named download
let unsubscribeStudents = null;



// Subscribe to Students List for Live View
function subscribeToStudents() {
    if (!db || unsubscribeStudents) return;



    unsubscribeStudents = db.collection('students')
        .orderBy('created', 'desc') // Ordenar por fecha para ver los ÚLTIMOS REALES
        .limit(5) // Solo los 5 últimos
        .onSnapshot((snapshot) => {


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
    if (!db) {
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

    try {
        const docRef = await db.collection('students').where('id', '==', dni).get();
        if (!docRef.empty) {
            const existingDoc = docRef.docs[0];
            const existing = existingDoc.data();

            const hasChanges = (existing.n !== name) || (existing.g !== grade) || (existing.s !== section) || (existing.p !== phone) || (existing.dob !== dob);

            if (hasChanges) {
                const doUpdate = confirm(`El alumno ${existing.n} ya existe pero con datos diferentes.\n\n¿Deseas ACTUALIZAR la información con los nuevos datos ingresados?`);
                if (doUpdate) {
                    await existingDoc.ref.update({
                        n: name,
                        g: grade,
                        s: section,
                        p: phone,
                        dob: dob
                    });
                    showToast("Datos actualizados correctamente", "success");

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
                    return;
                } else {
                    const qrData = {
                        n: existing.n,
                        id: existing.id,
                        g: existing.g,
                        s: existing.s,
                        p: existing.p,
                        dob: existing.dob
                    };
                    renderQR(qrData);
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

        const studentData = {
            n: name,
            id: dni,
            g: grade,
            s: section,
            p: phone,
            dob: dob,
            created: new Date().toISOString()
        };

        const qrData = { ...studentData };
        delete qrData.created;
        renderQR(qrData);

        try {
            const timeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error("Tiempo de espera agotado (5s). Revisa tu conexión.")), 5000);
            });

            await Promise.race([
                db.collection('students').add(studentData),
                timeout
            ]);

            showToast("¡Pase Guardado en la Nube!", "success");
            nameInput.value = '';
            dniInput.value = '';
            phoneInput.value = '';
            nameInput.focus();
        } catch (saveError) {
            console.error("Error guardando en nube:", saveError);
            alert("⚠️ El QR se generó, pero NO se pudo guardar en la nube: " + saveError.message);
        }

    } catch (error) {
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
        // Use student name if available, otherwise fallback
        const name = lastGeneratedStudent ? lastGeneratedStudent.n.replace(/\s+/g, '_') : 'Asistencia';
        link.download = `QR_${name}.png`;
        link.click();
    }
}

// --- SCANNER LOGIC ---
let html5QrcodeScanner = null;
let isScanning = false;
let currentAttendanceList = []; // Local cache for table rendering
let unsubscribeListener = null;
let currentScanMode = 'ingreso'; // 'ingreso' or 'salida'

function setScanMode(mode) {
    currentScanMode = mode;

    const btnIngreso = document.getElementById('btnModeIngreso');
    const btnSalida = document.getElementById('btnModeSalida');
    const statusMsg = document.getElementById('scanStatusMsg');

    if (mode === 'ingreso') {
        if (btnIngreso) {
            btnIngreso.style.background = 'var(--primary-color)';
            btnIngreso.style.color = 'white';
            btnIngreso.style.border = '2px solid var(--primary-color)';
        }
        if (btnSalida) {
            btnSalida.style.background = 'white';
            btnSalida.style.color = '#607D8B';
            btnSalida.style.border = '2px solid #607D8B';
        }
        if (statusMsg) statusMsg.innerText = "Escanea el código QR del alumno [MODO INGRESO]";
    } else {
        if (btnSalida) {
            btnSalida.style.background = '#607D8B';
            btnSalida.style.color = 'white';
            btnSalida.style.border = '2px solid #607D8B';
        }
        if (btnIngreso) {
            btnIngreso.style.background = 'white';
            btnIngreso.style.color = 'var(--primary-color)';
            btnIngreso.style.border = '2px solid var(--primary-color)';
        }
        if (statusMsg) statusMsg.innerText = "Escanea el código QR del alumno [MODO SALIDA]";
    }

    showToast(`Modo cambiado a: ${mode.toUpperCase()}`, 'info');
}

function startScanner() {
    if (isScanning) return;

    // Start Realtime Listener
    if (db && !unsubscribeListener) {
        unsubscribeListener = db.collection('attendance')
            .orderBy('timestamp', 'desc')
            .limit(200)
            .onSnapshot((snapshot) => {
                const todayStr = new Date().toLocaleDateString();
                currentAttendanceList = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.displayDate === todayStr) {
                        currentAttendanceList.push(data);
                    }
                });
                renderHistory();
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
}

const processedScans = new Map();

async function onScanSuccess(decodedText, decodedResult) {
    if (!db) return;

    try {
        const data = JSON.parse(decodedText);
        if (!data.n || !data.id) throw new Error("QR Inválido");

        const now = new Date();
        const todayDate = now.toLocaleDateString();

        if (processedScans.has(data.id)) {
            const lastTime = processedScans.get(data.id);
            if ((now - lastTime) < 5000) {
                return;
            }
        }
        processedScans.set(data.id, now);

        let incidentMsg = "";
        let incidentData = null;
        try {
            const cleanDni = String(data.id || "").trim();
            const incidentSnap = await db.collection('incidents')
                .where('studentDni', '==', cleanDni)
                .get();

            if (!incidentSnap.empty) {
                const activeIncidents = incidentSnap.docs
                    .map(doc => doc.data())
                    .filter(inc => inc.status === 'active');

                if (activeIncidents.length > 0) {
                    incidentData = activeIncidents[0];
                    incidentMsg = `\n\n*🚩 INCIDENCIA DETECTADA:* ${incidentData.type}\n*Comentario:* ${incidentData.description}`;
                }
            }
        } catch (e) {
            console.warn("Incident check failed", e);
        }

        const lastScan = currentAttendanceList.find(r => r.dni === data.id);
        if (lastScan && lastScan.displayDate === todayDate) {
            const lastTime = new Date(lastScan.timestamp.seconds * 1000);
            if ((now - lastTime) < 60000) {
                return;
            }
        }

        const duplicateCheck = await db.collection('attendance')
            .where('dni', '==', data.id)
            .where('displayDate', '==', todayDate)
            .where('type', '==', currentScanMode)
            .get();

        if (!duplicateCheck.empty) {
            const modeText = currentScanMode === 'ingreso' ? 'asistencia' : 'salida';
            if (incidentData) {
                playAlertSound();
                showToast(`⚠️ REPETIDO + ALERTA: ${data.n} ya registró ${modeText}`, 'error');
                speak(`Atención: el estudiante ${data.n} ya registró ${modeText} pero tiene una incidencia.`);
            } else {
                showToast(`⚠️ ${data.n} ya registró ${modeText} hoy`, 'error');
            }
            return;
        }

        await db.collection('attendance').add({
            name: data.n,
            dni: data.id,
            grade: data.g,
            section: data.s,
            phone: data.p,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            displayTime: now.toLocaleTimeString(),
            displayDate: todayDate,
            status: determineLateness(now),
            type: currentScanMode
        });

        const isBirthday = checkBirthday(data.dob);

        if (incidentData) {
            playAlertSound();
            showToast(`⚠️ ALERTA: ${data.n} tiene una INCIDENCIA activa`, 'error');
            speak(`Atención: el estudiante ${data.n} tiene una incidencia registrada.`);
            if (isBirthday) {
                setTimeout(() => {
                    showToast(`🎂🎉 ¡Y TAMBIÉN ES SU CUMPLEAÑOS! 🎉🎂`, 'info');
                    playBirthdayTune(data.n);
                }, 2000);
            }
        } else if (isBirthday) {
            playBirthdayTune(data.n);
            showToast(`🎂🎉 ¡FELIZ CUMPLEAÑOS ${data.n}! 🎉🎂`, 'info');
        } else {
            playSuccessSound();
            showToast(`✅ Asistencia: ${data.n}`, 'success');
        }

        const notifyCheckbox = document.getElementById('autoNotify');
        if (notifyCheckbox && notifyCheckbox.checked) {
            if (data.p && data.p.length >= 9) {
                const hour = now.getHours();
                let greeting = "Buenos días";
                if (hour >= 12) greeting = "Buenas tardes";
                if (hour >= 18) greeting = "Buenas noches";

                const verb = currentScanMode === 'ingreso' ? 'asistió al' : 'salió del';
                const message = `${greeting}, el estudiante *${data.n}* ${verb} colegio el día de hoy ${todayDate} a las ${now.toLocaleTimeString()}.${incidentMsg}`;
                const encodedMsg = encodeURIComponent(message);
                let phone = data.p.replace(/\D/g, '');
                if (phone.length === 9) phone = "51" + phone;

                const waLink = `https://wa.me/${phone}?text=${encodedMsg}`;
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
    // Silence the extremely noisy "No code found" errors from the library
    if (error && error.includes("No MultiFormat Readers")) return;

    // Log other potentially useful errors once to avoid flooding
    console.debug("Scanner noise:", error);
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

        const typeText = (record.type || 'ingreso').toUpperCase();
        const typeColor = (record.type === 'salida') ? '#1976D2' : '#2E7D32';
        const typeBg = (record.type === 'salida') ? '#E3F2FD' : '#E8F5E9';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${record.displayTime}</td>
            <td><strong>${record.name}</strong><br><span style="font-size:10px; padding: 2px 5px; border-radius:4px; background:${typeBg}; color:${typeColor}; font-weight:bold;">${typeText}</span></td>
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
        const choice = prompt("¿Qué desea borrar?\n\n1 = Solo Historial de Asistencia\n2 = REINICIO TOTAL DE FÁBRICA\n3 = SOLO Borrar Usuarios/Roles (Resetear Personal)");

        if (choice === "1") {
            if (confirm("¿Confirmar eliminación del HISTORIAL DE ASISTENCIA?")) {
                await deleteCollection('attendance');
                alert("Historial eliminado.");
                renderHistory();
            }
        } else if (choice === "2") {
            const confirmTotal = prompt("🔴 ¡ADVERTENCIA FINAL! 🔴\n\nEsto borrará TODOS los alumnos, asistencias, usuarios e INCIDENCIAS.\n\nEscribe 'CONFIRMAR' para proceder:");
            if (confirmTotal === "CONFIRMAR") {
                showToast("Iniciando borrado total...", "info");
                await deleteCollection('attendance');
                await deleteCollection('students');
                await deleteCollection('app_users'); // Include users
                await deleteCollection('incidents'); // Delete incidents
                alert("✅ SISTEMA REINICIADO DE FÁBRICA.\nSe han borrado todos los datos, incluyendo incidencias.");
                location.reload();
            } else {
                alert("Operación cancelada.");
            }
        } else if (choice === "3") {
            if (confirm("⚠️ ¿Borrar TODOS los usuarios y roles creados?\n\nEl sistema se reiniciará y volverá a crear solo el Usuario Admin por defecto.")) {
                showToast("Borrando usuarios...", "info");
                await deleteCollection('app_users');
                alert("✅ Usuarios eliminados. El sistema se recargará.");
                location.reload();
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

async function exportToExcel() {
    if (!db) return alert("No hay conexión con la base de datos.");

    const btn = document.querySelector('button[onclick="exportToExcel()"]');
    const originalText = btn ? btn.innerText : 'Exportar';
    if (btn) {
        btn.innerText = "⏳ Descargando...";
        btn.disabled = true;
    }

    try {
        // Fetch ALL history from cloud, not just local view
        const snapshot = await db.collection('attendance')
            .orderBy('timestamp', 'desc')
            .get();

        if (snapshot.empty) {
            alert("No hay registros de asistencia en la Nube.");
            if (btn) { btn.innerText = originalText; btn.disabled = false; }
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        // BOM for Excel to read UTF-8 correctly
        csvContent += "\ufeff";
        csvContent += "Fecha;Hora;Estado;Nombre;DNI;Grado;Seccion;Telefono Apoderado\n";

        snapshot.forEach(doc => {
            const row = doc.data();
            const safeName = `"${row.name || ''}"`;

            // Handle Timestamp
            let dateStr = row.displayDate;
            let timeStr = row.displayTime;

            // If missing legacy fields, calc from timestamp
            if (!dateStr && row.timestamp) {
                const d = new Date(row.timestamp.seconds * 1000);
                dateStr = d.toLocaleDateString();
                timeStr = d.toLocaleTimeString();
            }

            const status = row.status || 'Tardanza';

            csvContent += `${dateStr};${timeStr};${status};${safeName};${row.dni};${row.grade};${row.section};${row.phone || ''}\n`;
        });

        downloadCSV(csvContent, `Asistencia_TOTAL_${new Date().toISOString().slice(0, 10)}.csv`);

    } catch (e) {
        console.error("Error exportando:", e);
        alert("Error al descargar: " + e.message);
    }

    if (btn) {
        btn.innerText = originalText;
        btn.disabled = false;
    }
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

// --- LOGIN & USER MANAGEMENT SYSTEM ---
let currentUserRole = null; // 'ADMIN' or 'AUXILIAR'
let currentUserId = null;   // Firestore Doc ID

function handleLoginKey(e) {
    if (e.key === 'Enter') attemptLogin();
}

async function attemptLogin() {
    const pin = document.getElementById('loginPin').value.trim();
    const errorMsg = document.getElementById('loginError');

    if (!pin) return;

    // SECURITY: Check Authorized Device
    if (!checkDeviceAuth()) {
        errorMsg.style.display = 'block';
        errorMsg.innerText = "🚫 Dispositivo NO Autorizado.\nSolicite al Director la activación.";
        return;
    }

    if (!db) {
        alert("Error de conexión a la base de datos.");
        return;
    }

    try {
        errorMsg.style.display = 'none';

        // 1. Check if it's the very first run (Seed Default Admin)
        await ensureDefaultAdmin();

        // 2. Query Firestore
        const snapshot = await db.collection('app_users').where('pin', '==', pin).get();

        if (snapshot.empty) {
            errorMsg.style.display = 'block';
            errorMsg.innerText = "PIN Incorrecto o Usuario no encontrado.";
            document.getElementById('loginPin').value = "";
            return;
        }

        // 3. Login Success
        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();

        currentUserRole = userData.role;
        currentUserId = userDoc.id;

        // Update Last Login
        await userDoc.ref.update({
            lastLogin: new Date().toISOString()
        });

        // UI Setup
        loginSuccess(userData.name, userData.role);

    } catch (e) {
        console.error("Login Error:", e);
        errorMsg.style.display = 'block';
        errorMsg.innerText = "Error de red al verificar usuario.";
    }
}

async function ensureDefaultAdmin() {
    // If no users exist at all, create the default one so user isn't locked out.
    try {
        const snap = await db.collection('app_users').limit(1).get();
        if (snap.empty) {
            console.log("⚠️ No users found. Seeding Default Admin...");
            await db.collection('app_users').add({
                name: "Administrador Principal",
                pin: "339710",
                role: "ADMIN",
                lastLogin: new Date().toISOString(),
                isDefault: true // Marker to prevent deletion if we want to be strict
            });
            console.log("✅ Default Admin Created (PIN 339710)");
        } else {
            // MIGRATION FIX: If the admin exists but has old PINs ("1234" or "339710" or "GH2026"), update them.
            // Check for 1234
            const oldPinSnap1 = await db.collection('app_users').where('pin', '==', '1234').get();
            // Check for GH2026. (previous)
            const oldPinSnap2 = await db.collection('app_users').where('pin', '==', 'GH2026.').get();
            // Check for GH2026 (old default)
            const oldPinSnap3 = await db.collection('app_users').where('pin', '==', 'GH2026').get();

            let batch = db.batch();
            let changed = false;

            if (!oldPinSnap1.empty) {
                oldPinSnap1.docs.forEach(doc => { batch.update(doc.ref, { pin: "339710" }); });
                changed = true;
            }
            if (!oldPinSnap2.empty) {
                oldPinSnap2.docs.forEach(doc => { batch.update(doc.ref, { pin: "339710" }); });
                changed = true;
            }
            if (!oldPinSnap3.empty) {
                oldPinSnap3.docs.forEach(doc => { batch.update(doc.ref, { pin: "339710" }); });
                changed = true;
            }

            if (changed) {
                await batch.commit();
                console.log("✅ Fixed: Updated old PINs to 339710.");
                // Alert removed to avoid annoyance, auto-fix is enough.
            }
        }
    } catch (e) {
        console.warn("Could not check/seed default admin:", e);
    }
}

function loginSuccess(name, role) {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';

    // Display Name & Role
    document.getElementById('userRoleDisplay').innerText = `${name} (${role})`;
    document.getElementById('loginPin').value = "";
    document.getElementById('loginError').style.display = 'none';

    // Show/Hide Elements based on Role
    const deleteBtn = document.querySelector('button[onclick="clearHistory()"]');

    // Tab Buttons
    const tabGenerator = document.getElementById('tab-generator');
    const tabScanner = document.getElementById('tab-scanner');
    const tabReports = document.getElementById('tab-reports');
    const tabUsers = document.getElementById('tab-report2'); // Named 'Usuarios' now

    // Reset all to visible first, then hide based on role
    const tabIncidents = document.getElementById('tab-incidents');
    if (tabGenerator) tabGenerator.style.display = 'inline-block';
    if (tabScanner) tabScanner.style.display = 'inline-block';
    if (tabReports) tabReports.style.display = 'inline-block';
    if (tabIncidents) tabIncidents.style.display = 'inline-block';
    if (tabUsers) tabUsers.style.display = 'inline-block';
    if (deleteBtn) deleteBtn.style.display = 'block';

    if (role === 'ADMIN') {
        // Show ALL (Already visible)
        openTab('generator');

    } else if (role === 'SIAGIE') {
        // SIAGIE logic: Only Generator & Reports
        if (tabScanner) tabScanner.style.display = 'none';
        if (tabUsers) tabUsers.style.display = 'none';

        // Hide delete history button? Usually admin only.
        if (deleteBtn) deleteBtn.style.display = 'none';

        openTab('reports'); // Default to Reports

    } else {
        // AUXILIAR (Default)
        // Show Scanner, Reports & Incidents. Hide Generator & Users.
        if (tabGenerator) tabGenerator.style.display = 'none';
        if (tabUsers) tabUsers.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';

        openTab('scanner'); // Force scanner
    }
}

function logout() {
    currentUserRole = null;
    currentUserId = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
    stopScanner(); // Stop camera
    updateAuthDisplay();
}


// --- USER MANAGEMENT FUNCTIONS (ADMIN ONLY) ---
async function createUser() {
    if (currentUserRole !== 'ADMIN') return;

    const name = document.getElementById('newUserName').value.trim();
    const pin = document.getElementById('newUserPin').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!name || pin.length < 4) {
        alert("Por favor ingrese un nombre y un PIN de al menos 4 dígitos.");
        return;
    }

    try {
        // Check duplication
        const check = await db.collection('app_users').where('pin', '==', pin).get();
        if (!check.empty) {
            alert("❌ Ese PIN ya está en uso por otro usuario.");
            return;
        }

        await db.collection('app_users').add({
            name: name,
            pin: pin,
            role: role,
            created: new Date().toISOString(),
            lastLogin: "Nunca"
        });

        showToast("✅ Usuario agregado correctamente", "success");
        // Clear inputs
        document.getElementById('newUserName').value = "";
        document.getElementById('newUserPin').value = "";

        loadUsers(); // Refresh list automatically
    } catch (e) {
        console.error(e);
        alert("Error al crear usuario: " + e.message);
    }
}

let unsubscribeUsers = null;

function loadUsers() {
    if (currentUserRole !== 'ADMIN') return;
    if (unsubscribeUsers) return; // Already listening

    const tbody = document.getElementById('usersListBody');
    const countEl = document.getElementById('usersCount');

    unsubscribeUsers = db.collection('app_users').orderBy('name').onSnapshot(snapshot => {
        tbody.innerHTML = "";
        countEl.innerText = snapshot.size;

        if (snapshot.empty) {
            tbody.innerHTML = "<tr><td colspan='5' style='text-align:center'>No hay usuarios</td></tr>";
            return;
        }

        snapshot.forEach(doc => {
            const u = doc.data();
            const isMe = (doc.id === currentUserId);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px; border-bottom: 1px solid #eee;"><strong>${u.name}</strong> ${isMe ? '(Tú)' : ''}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${u.role}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace;">***</td> 
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 12px; color: #666;">
                    ${formatDateFriendly(u.lastLogin)}
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    ${!isMe ? `<button onclick="deleteUser('${doc.id}', '${u.name}')" style="background:#FFEBEE; color:#C62828; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Eliminar</button>` : '<span style="color:#ccc">---</span>'}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }, error => {
        console.error("Error loading users:", error);
        tbody.innerHTML = `<tr><td colspan='5' style='color:red; text-align:center'>Error cargando usuarios: ${error.message}</td></tr>`;
        showToast("Error de permisos o conexión", "error");
    });
}

async function deleteUser(docId, userName) {
    if (!confirm(`¿Estás seguro de ELIMINAR al usuario "${userName}"?\n\nEsta acción no se puede deshacer.`)) {
        return;
    }

    try {
        await db.collection('app_users').doc(docId).delete();
        showToast("🗑 Usuario eliminado.", "info");
    } catch (e) {
        alert("Error: " + e.message);
    }
}

function formatDateFriendly(isoString) {
    if (!isoString || isoString === 'Nunca') return 'Nunca';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return isoString; }
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
    lastGeneratedStudent = data; // Store data for named download
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


// --- CLOUD DEVICE SECURITY ---
let logoClicks = 0;
const MASTER_KEY = "DIR-ADM";
let myDeviceId = localStorage.getItem('DEVICE_ID');

if (!myDeviceId) {
    myDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    localStorage.setItem('DEVICE_ID', myDeviceId);
}

function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = "Desconocido";
    if (ua.indexOf("Chrome") > -1) browser = "Chrome";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";
    else if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("Edge") > -1) browser = "Edge";

    let os = "Desconocido";
    if (ua.indexOf("Win") > -1) os = "Windows";
    else if (ua.indexOf("Mac") > -1) os = "MacOS";
    else if (ua.indexOf("Linux") > -1) os = "Linux";
    else if (ua.indexOf("Android") > -1) os = "Android";
    else if (ua.indexOf("iPhone") > -1) os = "iOS";

    return `${browser} en ${os}`;
}

async function checkDeviceAuth() {
    // 1. First check local quick flag
    const localAuth = localStorage.getItem('DEVICE_AUTHORIZED') === 'true';
    if (!localAuth) return false;

    // 2. Double check with Cloud (Is it still active?)
    // This runs in background to prevent blocking UI, but if revoked, will logout next time or now.
    try {
        if (db) {
            const doc = await db.collection('devices').doc(myDeviceId).get();
            if (!doc.exists) {
                console.warn("Device revoked from cloud!");
                logoutAndDeauthorize();
                return false;
            }
        }
    } catch (e) {
        console.warn("Offline or auth check error", e);
        // If offline, trust local auth for now
    }
    return true;
}

function logoutAndDeauthorize() {
    localStorage.removeItem('DEVICE_AUTHORIZED');
    updateAuthDisplay();
    // Force reload to show lock screen
    window.location.reload();
}

async function handleLogoClick() {
    logoClicks++;
    if (logoClicks === 5) {
        logoClicks = 0;
        const input = prompt("🔐 MODO DIRECTOR\n\nIngrese Clave Maestra para autorizar este dispositivo en la NUBE:");
        if (input === MASTER_KEY) {
            try {
                // Register in Cloud
                const info = getDeviceInfo();
                await db.collection('devices').doc(myDeviceId).set({
                    name: info,
                    authorizedAt: new Date().toISOString(),
                    lastActive: new Date().toISOString(),
                    userAgent: navigator.userAgent
                });

                localStorage.setItem('DEVICE_AUTHORIZED', 'true');
                alert("✅ ¡Dispositivo Autorizado y Registrado en la Nube!");
                updateAuthDisplay();
            } catch (e) {
                console.error(e);
                alert("Error registrando dispositivo: " + e.message);
            }
        } else if (input !== null) {
            alert("❌ Clave Incorrecta");
        }
    }
}

function updateAuthDisplay() {
    const statusEl = document.getElementById('authStatus');
    if (statusEl) {
        // Just sync visual state with local storage for speed
        const isAuth = localStorage.getItem('DEVICE_AUTHORIZED') === 'true';
        if (isAuth) {
            statusEl.innerText = "🔒 Dispositivo Verificado y Seguro";
            statusEl.style.color = "#4CAF50";
            // Trigger background verification
            if (db) checkDeviceAuth();
        } else {
            statusEl.innerText = "🚫 Dispositivo NO Autorizado";
            statusEl.style.color = "#E57373";
        }
    }
}

// --- DEVICES MANAGEMENT LIST ---
let unsubscribeDevices = null;

function loadDevices() {
    if (currentUserRole !== 'ADMIN') return;
    if (unsubscribeDevices) return; // Already listening

    const tbody = document.getElementById('devicesListBody');
    const countEl = document.getElementById('devicesCount');

    unsubscribeDevices = db.collection('devices').orderBy('authorizedAt', 'desc').onSnapshot(snapshot => {
        tbody.innerHTML = "";
        countEl.innerText = snapshot.size;

        if (snapshot.empty) {
            tbody.innerHTML = "<tr><td colspan='3' style='text-align:center'>No hay dispositivos registrados</td></tr>";
            return;
        }

        snapshot.forEach(doc => {
            const d = doc.data();
            const isThisDevice = (doc.id === myDeviceId);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    <strong>${d.name || 'Dispositivo'}</strong>
                    ${isThisDevice ? '<span style="color:#4CAF50; font-weight:bold; font-size:10px;">(Este)</span>' : ''}
                    <div style="font-size:10px; color:#999;">ID: ${doc.id.substr(0, 8)}...</div>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-size: 12px;">
                    ${formatDateFriendly(d.authorizedAt)}
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">
                    <button onclick="revokeDevice('${doc.id}', '${d.name}')" 
                        class="btn-danger" style="padding: 4px 8px; font-size: 11px;">
                        🗑 Desvincular
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }, error => {
        console.error("Error loading devices:", error);
        tbody.innerHTML = `<tr><td colspan='3' style='color:red; text-align:center'>Error: ${error.message}</td></tr>`;
    });
}

async function revokeDevice(docId, devName) {
    if (!confirm(`¿Revocar acceso al dispositivo "${devName}"?\n\nSi es este dispositivo, se cerrará la sesión inmediatamente.`)) {
        return;
    }

    try {
        await db.collection('devices').doc(docId).delete();
        showToast("Dispositivo desvinculado", "info");
        // If it was me, the onSnapshot or checkDeviceAuth will catch it eventually, 
        // but let's be immediate if it's self.
        if (docId === myDeviceId) {
            logoutAndDeauthorize();
        }
    } catch (e) {
        alert("Error: " + e.message);
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

async function revokeAllDevices() {
    if (!confirm("⚠️ ¿REVOCAR ABSOLUTAMENTE TODOS LOS DISPOSITIVOS?\n\nEsta acción borrará TODOS los permisos de acceso.\nTodos los dispositivos (incluido este) perderán el acceso y deberán volver a usar la clave Maestra.")) {
        return;
    }

    const input = prompt("Para confirmar, escribe: BORRAR TODO");
    if (input !== 'BORRAR TODO') {
        alert("Acción cancelada.");
        return;
    }

    try {
        const snap = await db.collection('devices').get();
        if (snap.empty) {
            alert("No hay dispositivos registrados para borrar.");
            return;
        }

        const batch = db.batch();
        snap.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        alert("✅ Todos los dispositivos han sido eliminados correctamente.");
        logoutAndDeauthorize();
    } catch (e) {
        console.error(e);
        alert("Error al borrar dispositivos: " + e.message);
    }
}

// Deprecated old loadReports, pointing to new one
async function loadReports() {
    generateFilteredReport(false);
    generateFilteredReport(false);
}



// --- INCIDENT MANAGEMENT LOGIC ---
let selectedIncidentStudent = null;

async function searchStudentForIncident() {
    const dni = document.getElementById('incidentDNI').value.trim();
    if (dni.length !== 8) return alert("Ingrese un DNI de 8 dígitos");

    try {
        const snap = await db.collection('students').where('id', '==', dni).get();
        if (snap.empty) {
            alert("Alumno no encontrado");
            selectedIncidentStudent = null;
            document.getElementById('incidentStudentInfo').style.display = 'none';
            return;
        }

        const data = snap.docs[0].data();
        selectedIncidentStudent = {
            dni: data.id,
            name: data.n
        };

        document.getElementById('incidentStudentName').innerText = data.n;
        document.getElementById('incidentStudentInfo').style.display = 'block';

    } catch (e) {
        console.error(e);
        alert("Error al buscar alumno");
    }
}

async function registerIncident() {
    if (!selectedIncidentStudent) return alert("Primero busque y seleccione un alumno");

    const type = document.getElementById('incidentType').value;
    const description = document.getElementById('incidentComment').value.trim();

    if (!description) return alert("Por favor ingrese un comentario sobre la incidencia.");

    try {
        await db.collection('incidents').add({
            studentDni: selectedIncidentStudent.dni,
            studentName: selectedIncidentStudent.name,
            type: type,
            description: description,
            date: new Date().toISOString(),
            status: 'active'
        });

        showToast("✅ Incidencia registrada correctamente", "success");

        // Reset
        document.getElementById('incidentComment').value = "";
        document.getElementById('incidentDNI').value = "";
        document.getElementById('incidentStudentInfo').style.display = 'none';
        selectedIncidentStudent = null;

    } catch (e) {
        console.error(e);
        alert("Error al registrar incidencia");
    }
}

let unsubscribeIncidents = null;
function loadActiveIncidents() {
    if (unsubscribeIncidents) return;

    const tbody = document.getElementById('activeIncidentsList');
    unsubscribeIncidents = db.collection('incidents')
        .where('status', '==', 'active')
        .orderBy('date', 'desc')
        .onSnapshot(snap => {
            tbody.innerHTML = "";
            if (snap.empty) {
                tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; padding:15px;'>No hay incidencias activas</td></tr>";
                return;
            }

            snap.forEach(doc => {
                const data = doc.data();
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding:10px; border-bottom:1px solid #eee;">
                        <strong>${data.studentName}</strong><br>
                        <small style="color:#666;">DNI: ${data.studentDni}</small>
                    </td>
                    <td style="padding:10px; border-bottom:1px solid #eee;">
                        <span style="color:#D32F2F; font-weight:bold; font-size:11px;">[${data.type}]</span><br>
                        ${data.description}
                    </td>
                    <td style="padding:10px; border-bottom:1px solid #eee; text-align:center;">
                        <button onclick="resolveIncident('${doc.id}')" class="btn-small" style="background:#E8F5E9; color:#2E7D32; border:1px solid #C8E6C9;">✅ Resolver</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }, e => {
            console.error(e);
            if (e.code === 'failed-precondition') {
                tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; padding:15px; color:orange;'>⚠️ Se requiere crear un índice en Firebase. Revise la consola del navegador.</td></tr>";
            }
        });
}

async function resolveIncident(id) {
    if (!confirm("¿Marcar esta incidencia como RESUELTA?")) return;
    try {
        await db.collection('incidents').doc(id).update({
            status: 'resolved',
            resolvedAt: new Date().toISOString()
        });
        showToast("Incidencia resuelta", "success");
    } catch (e) {
        console.error(e);
        alert("Error al resolver incidencia");
    }
}

// Global Error Handler
window.onerror = function (msg, url, line) {
    // logToScreen(`ERROR GLOBAL: ${msg} (Línea ${line})`);
    console.error(`Error Script: ${msg}`);
};

function playAlertSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth'; // Rougher sound for alert
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.5);

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    } catch (e) { console.warn(e); }
}

function speak(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-PE'; // Peru Spanish
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}
async function exportIncidentsToExcel() {
    if (!db) return alert("No hay conexión con la base de datos.");

    const btn = document.querySelector('button[onclick="exportIncidentsToExcel()"]');
    const originalText = btn ? btn.innerHTML : 'Exportar';
    if (btn) {
        btn.innerHTML = "⏳ Descargando...";
        btn.disabled = true;
    }

    try {
        // Fetch ALL incidents from cloud
        const snapshot = await db.collection('incidents')
            .orderBy('date', 'desc')
            .get();

        if (snapshot.empty) {
            alert("No hay registros de incidencias en la Nube.");
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        // BOM for Excel
        csvContent += "\ufeff";
        csvContent += "Fecha;Alumno;DNI;Tipo de Incidencia;Descripción;Estado;Fecha Resolución\n";

        snapshot.forEach(doc => {
            const row = doc.data();
            const date = formatDateFriendly(row.date);
            const resolvedAt = row.resolvedAt ? formatDateFriendly(row.resolvedAt) : '-';
            const safeName = `"${row.studentName || ''}"`;
            const safeDesc = `"${(row.description || '').replace(/"/g, '""')}"`;
            const status = row.status === 'active' ? 'Activa' : 'Resuelta';

            csvContent += `${date};${safeName};${row.studentDni};${row.type};${safeDesc};${status};${resolvedAt}\n`;
        });

        downloadCSV(csvContent, `Historial_Incidencias_${new Date().toISOString().slice(0, 10)}.csv`);

    } catch (e) {
        console.error("Error exportando incidencias:", e);
        alert("Error al descargar: " + e.message);
    }

    if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function formatDateFriendly(isoString) {
    if (!isoString) return "-";
    try {
        const d = new Date(isoString);
        return d.toLocaleString('es-PE');
    } catch (e) {
        return isoString;
    }
}

async function forceAppRefresh() {
    if (confirm("Se borrará el caché del navegador para cargar la última versión. ¿Continuar?")) {
        try {
            // 1. Unregister all service workers
            if ('serviceWorker' in navigator) {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            }
            // 2. Clear all caches
            if ('caches' in window) {
                const cacheNames = await caches.keys();
                for (let name of cacheNames) {
                    await caches.delete(name);
                }
            }
            // 3. Reload from server
            alert("Caché limpiado. La página se recargará ahora.");
            window.location.reload(true);
        } catch (e) {
            console.error("Error clearing cache:", e);
            window.location.reload(true);
        }
    }
}
