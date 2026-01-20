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
let unsubscribeDeviceListener = null; // Unsubscribe handle
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();

    // OFFLINE PERSISTENCE (Hybrid Mode Support)
    db.enablePersistence()
        .catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn('Persistencia falló: Múltiples pestañas abiertas.');
            } else if (err.code == 'unimplemented') {
                console.warn('El navegador no soporta persistencia offline.');
            }
        });

    console.log("Firebase conectado (con Persistencia)");
} catch (error) {
    console.warn("Error inicializando Firebase (¿Faltan las llaves?):", error);
    showToast("⚠️ Configura Firebase en script.js", "error");
}

// GLOBAL DEVICE ID (Required for security)
let myDeviceId = localStorage.getItem('qr_device_id');
if (!myDeviceId) {
    myDeviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('qr_device_id', myDeviceId);
}
console.log("Device ID:", myDeviceId);

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

    // TAB SPECIFIC ACTIONS
    if (tabName === 'scanner') {
        startScanner();
    } else {
        stopScanner();
    }

    if (tabName === 'devices') {
        loadDeviceRequests();
    }

    if (tabName === 'roles') {
        loadUsers();
    }

    if (tabName === 'reports') {
        // Ensure date is set before loading
        const dateInput = document.getElementById('filterDate');
        if (!dateInput.value) dateInput.valueAsDate = new Date();
        loadReports();
    }

    if (tabName === 'report2') {
        loadUsers();
        // loadDevices(); REMOVED
    }

    if (tabName === 'devices') {
        loadDeviceRequests();
    }

    if (tabName === 'incidents') {
        loadActiveIncidents();
    }

    if (tabName === 'comunicados') {
        const msgArea = document.getElementById('commMessage');
        if (msgArea && !msgArea.value) {
            msgArea.value = "Estimado padre de familia, le saludamos de la I.E.E. Genaro Herrera. \n\nPor favor AGREGUE ESTE NÚMERO a sus contactos para recibir las notificaciones de asistencia y salida de su menor hijo(a) automáticamente.\n\nAtte. La Dirección";
        }
    }
}

// --- DIAGNOSTIC TOOL ---
async function diagnoseConnection() {
    if (!db) {
        showToast("Error: Firebase no está configurado.", "error");
        return;
    }

    try {
        const testRef = db.collection('_diagnostics').doc('connection_test');
        await testRef.set({
            timestamp: new Date().toISOString(),
            status: 'ok',
            device: navigator.userAgent
        });

        showToast("✅ CONEXIÓN EXITOSA. El sistema puede leer y escribir.", "success", 5000);

    } catch (error) {
        if (error.code === 'permission-denied') {
            showToast("🔒 BLOQUEADO POR REGLAS DE SEGURIDAD. Revisa la consola de Firebase.", "error", 6000);
        } else if (error.code === 'unavailable') {
            showToast("📡 SIN CONEXIÓN A INTERNET.", "error");
        } else {
            showToast("❌ ERROR DE CONEXIÓN: " + error.message, "error");
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
        .orderBy('created', 'desc')
        .limit(5)
        .onSnapshot((snapshot) => {
            console.log("Students snapshot size:", snapshot.size);

            const list = document.getElementById('generatedList');
            if (!list) return;
            list.innerHTML = "";

            if (snapshot.empty) {
                list.innerHTML = "<tr><td colspan='3' style='text-align:center'>No hay datos recientes</td></tr>";
                return;
            }

            snapshot.forEach(doc => {
                const s = doc.data();
                const row = document.createElement('tr');
                row.innerHTML = `<td>${s.n}</td><td>${s.id}</td><td>${s.g}°</td><td>"${s.s}"</td>`;
                list.appendChild(row);
            });
        }, (error) => {
            console.error("Error obteniendo lista alumnos:", error);

            // Check for missing index error
            if (error.code === 'failed-precondition') {
                showToast("⚠️ ERROR DE ÍNDICE: El sistema requiere un índice nuevo.", "error", 8000);
                // Fallback: Try without sort just to show something
                console.log("Attempting fallback query without sort...");
                db.collection('students').limit(5).get().then(snap => {
                    const list = document.getElementById('generatedList');
                    if (list) {
                        list.innerHTML = "";
                        snap.forEach(doc => {
                            const s = doc.data();
                            const row = document.createElement('tr');
                            row.innerHTML = `<td>${s.n} (Sin Orden)</td><td>${s.id}</td><td>${s.g}°</td><td>"${s.s}"</td>`;
                            list.appendChild(row);
                        });
                        showToast("⚠️ Mostrando lista desordenada (Fallback)", "info");
                    }
                });
            } else {
                showToast(`❌ Error lista: ${error.message}`, "error");
            }

            const list = document.getElementById('generatedList');
            if (list) list.innerHTML = `<tr><td colspan='3' style='color:red'>Error: ${error.message}</td></tr>`;
        });
}

// Start listener on load or tab switch? 
// Let's safe init it.
// setTimeout(subscribeToStudents, 1500); // REMOVED: Called in loginSuccess now


async function generateQR() {
    if (!db) {
        return showToast("Firebase no configurado o sin conexión", "error");
    }

    const btn = document.querySelector('button[onclick="generateQR()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "⏳ Procesando...";
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

    try {
        if (!name || !dni) {
            showToast("Ingresa al menos Nombre y DNI.", "error");
            return;
        }

        if (dni.length !== 8) {
            showToast("El DNI debe tener 8 números.", "error");
            return;
        }

        if (phone && phone.length !== 9) {
            showToast("El teléfono debe tener 9 números.", "error");
            return;
        }

        // try { (Merged with outer try)
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
            showToast("⚠️ Generado local, pero error en nube: " + saveError.message, "error", 5000);
        }

    } catch (error) {
        console.error("Error FATAL generando:", error);
        showToast("⚠️ Error: " + error.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Generar QR";
        }
    }
}

async function exportGeneratedDatabase() {
    if (!db) return;
    try {
        const snapshot = await db.collection('students').get();
        if (snapshot.empty) {
            showToast("No hay estudiantes para exportar.", "info");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Nombre;DNI;Fecha Nacimiento;Grado;Seccion;Telefono Apoderado;Fecha Registro\n";

        snapshot.forEach(doc => {
            const st = doc.data();
            const safeName = `"${st.n}"`;
            const dob = st.dob || '';

            let regDate = '';
            if (st.created) {
                try {
                    // created is ISO string usually, e.g. "2024-01-01T12:00:00.000Z"
                    // Let's format it for Excel local time
                    const d = new Date(st.created);
                    regDate = d.toLocaleString('es-PE'); // "16/1/2026, 14:00:00"
                } catch (e) {
                    regDate = st.created;
                }
            }

            csvContent += `${safeName};${st.id};${dob};${st.g};${st.s};${st.p || ''};${regDate}\n`;
        });

        downloadCSV(csvContent, "BaseDatos_Alumnos_Cloud.csv");

    } catch (e) {
        console.error(e);
        showToast("Error descargando base de datos", "error");
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

// --- DUPLICATE CLEANER ---
async function scanAndFixDuplicates() {
    if (!confirm("⚠️ ¿Iniciar escaneo de duplicados?\n\nEsto buscará alumnos con el mismo DNI y te permitirá borrar los repetidos viejos.")) return;

    const btn = document.getElementById('cleanerBtn');
    if (btn) { btn.disabled = true; btn.innerText = "⏳ Escaneando..."; }

    try {
        const snapshot = await db.collection('students').get();
        const map = new Map();
        let duplicatesCount = 0;

        snapshot.forEach(doc => {
            const s = doc.data();
            if (!map.has(s.id)) {
                map.set(s.id, []);
            }
            map.get(s.id).push({ docId: doc.id, ...s });
        });

        let found = false;

        // Use for...of loop for async await inside
        for (const [dni, records] of map) {
            if (records.length > 1) {
                found = true;
                duplicatesCount++;

                // Sort: Newest first (Keep newest) OR Oldest first (Keep Oldest)?
                // Usually newest has corrected data. Let's keep NEWEST by created date.
                // If no created date, rely on... luck? No, generated IDs.
                // Let's assume created field exists as per my new code. If not, use docId.

                // Sort descending by created date (newest first)
                records.sort((a, b) => {
                    const dateA = a.created ? new Date(a.created) : new Date(0);
                    const dateB = b.created ? new Date(b.created) : new Date(0);
                    return dateB - dateA;
                });

                const keeper = records[0];
                const toDelete = records.slice(1);

                const msg = `⚠️ DUPLICADO DETECTADO (DNI: ${dni})\n\n` +
                    `Total registros: ${records.length}\n` +
                    `Se conservará: ${keeper.n} (Creado: ${keeper.created || '?'})\n` +
                    `Se BORRARÁN: ${toDelete.length} registros antiguos.\n\n` +
                    `¿CONFIRMAR LIMPIEZA para este alumno?`;

                if (confirm(msg)) {
                    for (const doc of toDelete) {
                        try {
                            await db.collection('students').doc(doc.docId).delete();
                            console.log("Deleted duplicate:", doc.docId);
                        } catch (e) {
                            alert("Error borrando: " + e.message);
                        }
                    }
                    showToast(`✅ Limpiados duplicados para ${keeper.n}`, "success");
                } else {
                    showToast("Salteado.", "info");
                }
            }
        }

        if (duplicatesCount === 0) {
            alert("✅ ¡No se encontraron duplicados en toda la base de datos!");
        } else {
            alert("🏁 Escaneo finalizado.");
        }

    } catch (e) {
        console.error(e);
        alert("Error en escaneo: " + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "🧹 Detectar y Borrar Duplicados"; }
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
                "reader", {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                rememberLastUsedCamera: true,
                aspectRatio: 1.0
            },
                false
            );
            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
            isScanning = true;
        }
    }, 100);
}

function stopScanner() {
    if (html5QrcodeScanner) {
        try {
            html5QrcodeScanner.clear().catch(error => {
                console.error("Failed to clear scanner", error);
            });
        } catch (e) {
            console.warn("Scanner clear error", e);
        }
        html5QrcodeScanner = null;
        isScanning = false;
    }
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
                // --- SPINTAX (VARIABILIDAD) ---
                const greetings = ["Hola", "Buenos días", "Estimado apoderado", "Saludos", "Buen día"];
                const greeting = greetings[Math.floor(Math.random() * greetings.length)];

                const verbsIngreso = ["ingresó al", "llegó al", "marcó su entrada al", "ya está en el"];
                const verbsSalida = ["salió del", "se retiró del", "marcó su salida del", "partió del"];

                let verb;
                if (currentScanMode === 'ingreso') {
                    verb = verbsIngreso[Math.floor(Math.random() * verbsIngreso.length)];
                } else {
                    verb = verbsSalida[Math.floor(Math.random() * verbsSalida.length)];
                }

                // Random emojis at the end
                const emojis = ["✅", "🏫", "🎒", "👋", "🕒", "✨"];
                const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

                const message = `${greeting}, le informamos que el estudiante *${data.n}* ${verb} colegio el día de hoy ${todayDate} a las ${now.toLocaleTimeString()}. ${randomEmoji}${incidentMsg}`;
                const encodedMsg = encodeURIComponent(message);
                let phone = data.p.replace(/\D/g, '');
                if (phone.length === 9) phone = "51" + phone;

                const waLink = `https://wa.me/${phone}?text=${encodedMsg}`;

                const botMode = document.getElementById('botMode');
                if (botMode && botMode.checked) {
                    // QUEUE MODE (Offline Capable)
                    db.collection('mail_queue').add({
                        dni: data.id,
                        name: data.n,
                        phone: phone,
                        message: message,
                        status: 'pending', // pending -> sent
                        type: 'attendance', // HIGH PRIORITY
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    }).then(() => {
                        showToast("🤖 Mensaje encolado al Robot", "info");
                    }).catch((err) => {
                        console.error("Error cola:", err);
                        // Fallback check if offline
                        if (navigator.onLine === false) {
                            showToast("⏳ Sin Internet: Mensaje guardado localmente", "warning");
                        }
                    });
                } else {
                    // MANUAL MODE
                    window.open(waLink, '_blank');
                }
            } else {
                showToast("⚠️ Sin número de apoderado para notificar", "info");
            }
        }
    } catch (e) {
        console.error("Error parsing/saving QR", e);
        showToast("❌ Error al guardar: " + e.message, "error");
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
        showToast("⛔ Acceso Denegado: Solo administradores.", "error");
        return;
    }

    const password = prompt("⚠ ZONA DE PELIGRO ⚠\n\nIngrese contraseña ADMIN para REINICIAR el sistema:");

    if (password === "339710") {
        const choice = prompt("¿Qué desea borrar?\n\n1 = Solo Historial de Asistencia\n2 = SOLO Borrar Usuarios/Roles\n3 = 🔥 REVOCAR TODOS LOS DISPOSITIVOS");

        if (choice === "1") {
            if (confirm("¿Confirmar eliminación del HISTORIAL DE ASISTENCIA?")) {
                await deleteCollection('attendance');
                showToast("Historial eliminado.", "success");
                renderHistory();
            }
        } else if (choice === "2") {
            if (confirm("⚠️ ¿Borrar TODOS los usuarios y roles creados?\n\nEl sistema se reiniciará y volverá a crear solo el Usuario Admin por defecto.")) {
                showToast("Borrando usuarios...", "info");
                await deleteCollection('app_users');
                showToast("✅ Usuarios eliminados.", "success");
                setTimeout(() => location.reload(), 2000);
            }
        } else if (choice === "3") {
            revokeAllDevices(true);
        } else {
            showToast("Opción no válida.", "info");
        }
    } else if (password !== null) {
        showToast("Contraseña incorrecta.", "error");
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
    if (!db) return showToast("No hay conexión con la base de datos.", "error");

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
            showToast("No hay registros en la Nube.", "info");
            if (btn) { btn.innerText = originalText; btn.disabled = false; }
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        // BOM for Excel to read UTF-8 correctly
        csvContent += "\ufeff";
        csvContent += "Fecha;Hora;Tipo;Estado;Nombre;DNI;Grado;Seccion;Telefono Apoderado\n";

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
            const type = (row.type === 'salida') ? 'Salida' : 'Ingreso';

            csvContent += `${dateStr};${timeStr};${type};${status};${safeName};${row.dni};${row.grade};${row.section};${row.phone || ''}\n`;
        });
        downloadCSV(csvContent, `Asistencia_TOTAL_${new Date().toISOString().slice(0, 10)}.csv`);

    } catch (e) {
        console.error("Error exportando:", e);
        showToast("Error al descargar: " + e.message, "error");
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
        showToast("Por favor ingrese un DNI válido de 8 dígitos.", "error");
        return;
    }

    if (!db) return alert("Error: No hay conexión con la base de datos.");

    try {
        showToast("Buscando en la nube...", "info");
        const snapshot = await db.collection('students').where('id', '==', dni).get();

        if (snapshot.empty) {
            showToast("❌ Alumno no encontrado con ese DNI.", "error");
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
        showToast("Error al buscar: " + error.message, "error");
    }
}

function addLogoToQR() {
    const container = document.getElementById('qrcode');
    if (!container) {
        console.warn("No QR container found");
        return;
    }

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
    img.src = 'logo.png';

    // Handle generic drawing (with or without logo success)
    const drawFinalQR = (logoImg = null) => {
        // 1. Setup new dimensions
        const size = 400; // Fixed size from renderQR
        const extraHeight = 50;
        const totalHeight = size + extraHeight;

        // 2. Create a new canvas for the composite image
        const newCanvas = document.createElement('canvas');
        newCanvas.width = size;
        newCanvas.height = totalHeight;
        const nCtx = newCanvas.getContext('2d');

        // 3. Fill White Background
        nCtx.fillStyle = '#ffffff';
        nCtx.fillRect(0, 0, size, totalHeight);

        // 4. Draw the original QR code (from the specific existing canvas)
        nCtx.drawImage(canvas, 0, 0);

        // 5. Draw Logo (if exists)
        if (logoImg) {
            const logoSize = size * 0.22;
            const x = (size - logoSize) / 2;
            const y = (size - logoSize) / 2; // Center in QR part

            // White backing for logo
            nCtx.fillStyle = '#ffffff';
            nCtx.fillRect(x - 5, y - 5, logoSize + 10, logoSize + 10);

            nCtx.drawImage(logoImg, x, y, logoSize, logoSize);
        }

        // 6. Draw Text
        // Get name from global state
        let nameText = "ALUMNO GENARINO";
        if (typeof lastGeneratedStudent !== 'undefined' && lastGeneratedStudent && lastGeneratedStudent.n) {
            nameText = formatStudentIDName(lastGeneratedStudent.n);
        }

        nCtx.font = "bold 26px Arial Narrow, Arial, sans-serif";
        nCtx.fillStyle = "#000000";
        nCtx.textAlign = "center";
        nCtx.textBaseline = "middle";
        // Position: Center X, and in the middle of the bottom margin
        nCtx.fillText(nameText, size / 2, size + (extraHeight / 2));

        // 7. Update the Display Image
        if (qrImg) {
            qrImg.src = newCanvas.toDataURL();
            // CRITICAL FIX: Remove library-added fixed attributes that squash the image
            qrImg.removeAttribute('width');
            qrImg.removeAttribute('height');

            // Optional: Update styling to ensure it doesn't look squashed in CSS
            qrImg.style.maxHeight = "100%";
            qrImg.style.width = "auto";
            qrImg.style.height = "auto"; // Allow natural growth

            // Re-show download button if hidden
            document.getElementById('downloadBtn').style.display = 'block';
        }
    };

    // If image is already cached/loaded, fire immediately
    if (img.complete && img.naturalHeight !== 0) {
        drawFinalQR(img);
    } else {
        img.onload = () => {
            drawFinalQR(img);
        };
        img.onerror = () => {
            console.warn("No se encontró logo.jpg/png, generando solo texto.");
            drawFinalQR(null);
        };
    }
}

// Helper to shorten names: "DEREK DAVID ZEVALLOS RUCOBA" -> "DEREK D. ZEVALLOS R."
function formatStudentIDName(fullName) {
    if (!fullName) return "";
    const parts = fullName.trim().toUpperCase().split(/\s+/);

    // 1 Name
    if (parts.length === 1) return parts[0];

    // 2 Names: JUAN PEREZ -> JUAN PEREZ
    if (parts.length === 2) return `${parts[0]} ${parts[1]}`;

    // 3 Names: JUAN PEREZ LOPEZ -> JUAN PEREZ L. (Prioritize First Name + First Surname)
    if (parts.length === 3) {
        return `${parts[0]} ${parts[1]} ${parts[2][0]}.`;
    }

    // 4+ Names: DEREK DAVID ZEVALLOS RUCOBA -> DEREK D. ZEVALLOS R.
    // Logic: Part0 (First) . Part1 (Initial) . Part2 (Surname) . PartLast (Initial)
    if (parts.length >= 4) {
        return `${parts[0]} ${parts[1][0]}. ${parts[2]} ${parts[parts.length - 1][0]}.`;
    }

    return fullName; // Fallback
}

// --- LOGIN & USER MANAGEMENT SYSTEM ---

// Auth State Observer REMOVED (Duplicate)
// updateAuthDisplay REMOVED

function handleLoginKey(e) {
    if (e.key === 'Enter') attemptLogin();
}

async function attemptLogin() {
    console.log("LOGIN CLICKED"); // Debug log
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value.trim();
    const errorMsg = document.getElementById('loginError');

    if (!email || !pass) {
        errorMsg.style.display = 'block';
        errorMsg.innerText = "Ingrese Correo y Contraseña.";
        return;
    }

    try {
        errorMsg.style.display = 'none';
        await firebase.auth().signInWithEmailAndPassword(email, pass);
        // Viewer is handled by onAuthStateChanged
    } catch (e) {
        console.error("Login Error:", e);
        errorMsg.style.display = 'block';
        let msg = "Error al iniciar sesión: " + e.message; // Show raw error for debug
        if (e.code === 'auth/wrong-password') msg = "Contraseña incorrecta.";
        if (e.code === 'auth/user-not-found') msg = "Usuario no encontrado (¿Creaste el usuario en la consola?).";
        if (e.code === 'auth/invalid-email') msg = "Correo inválido.";
        if (e.code === 'auth/operation-not-allowed') msg = "Error: Email/Password no habilitado en consola.";
        errorMsg.innerText = msg;
    }
}

// Legacy loginSuccess and logout REMOVED (Duplicates)


// --- USER MANAGEMENT FUNCTIONS (ADMIN ONLY)// --- USER REGISTRATION (SECONDARY APP WORKAROUND) ---
async function registerNewSystemUser() {
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass').value.trim();
    const name = document.getElementById('regName').value.trim();
    const role = document.getElementById('regRole').value;

    if (!email || !pass || !name) return showToast("Faltan datos obligatorios.", "error");
    if (pass.length < 6) return showToast("La contraseña debe tener al menos 6 caracteres.", "error");

    try {
        showToast("⏳ Creando usuario...", "info");

        // 1. Initialize Secondary App to avoid logging out current user
        const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");

        // 2. Create User
        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        const newUser = userCredential.user;

        // 3. Save extra data to Firestore (optional, for role management)
        // We use the same 'app_users' collection but linking by email/uid
        await db.collection('app_users').add({
            name: name,
            email: email,
            role: role,
            uid: newUser.uid,
            createdAt: new Date().toISOString()
        });

        // 4. Cleanup
        await secondaryApp.auth().signOut();
        secondaryApp.delete();

        showToast(`✅ Usuario creado: ${email}`, "success");

        // Clear Form
        document.getElementById('regEmail').value = "";
        document.getElementById('regPass').value = "";
        document.getElementById('regName').value = "";

    } catch (e) {
        console.error("Registration Error:", e);
        showToast("Error: " + e.message, "error");
    }
}

// EMERGENCY ACCESS
async function emergencyUnlock() {
    const code = prompt("🚨 ACCESO DE EMERGENCIA 🚨\n\nIngrese el código maestro para desbloquear este dispositivo inmediatamente:");

    if (code === "339720") {
        if (!db || !myDeviceId) return alert("Error: No hay conexión o ID de dispositivo.");

        try {
            await db.collection('authorized_devices').doc(myDeviceId).update({
                status: 'approved',
                unlockedVia: 'emergency_code',
                updatedAt: new Date().toISOString()
            });
            showToast("🔓 ¡Dispositivo Desbloqueado por Emergencia!", "success");
            // Listener in verifyDeviceAccess will catch this and unlock the UI automatically
        } catch (e) {
            alert("Error al desbloquear: " + e.message);
        }
    } else if (code !== null) {
        showToast("⛔ Código incorrecto.", "error");
    }
}

function checkDevicePermission() {
    // Just re-run verification
    if (firebase.auth().currentUser) {
        verifyDeviceAccess(firebase.auth().currentUser.email);
    }
}
async function createUser() {
    if (currentUserRole !== 'ADMIN') return;

    const name = document.getElementById('newUserName').value.trim();
    const pin = document.getElementById('newUserPin').value.trim();
    const role = document.getElementById('newUserRole').value;

    if (!name || pin.length < 4) {
        showToast("Ingrese nombre y PIN (mín 4 dígitos).", "error");
        return;
    }

    try {
        // Check duplication
        const check = await db.collection('app_users').where('pin', '==', pin).get();
        if (!check.empty) {
            showToast("❌ Ese PIN ya está en uso.", "error");
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
        showToast("Error al crear usuario: " + e.message, "error");
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
        showToast("Error: " + e.message, "error");
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
            let text = "Pase por favor";
            if (currentScanMode === 'salida') {
                text = "Hasta mañana";
            }

            const utterance = new SpeechSynthesisUtterance(text);
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

function determineLateness(dateObj) {
    if (!dateObj) return 'Tardanza';
    // Logic: Before 8:00 (7:59 or less) -> Puntual
    const hour = dateObj.getHours();
    const minute = dateObj.getMinutes();
    const totalMinutes = hour * 60 + minute;

    // 8:00 AM = 480
    if (totalMinutes <= 480) {
        return 'Puntual';
    } else {
        return 'Tardanza';
    }
}

function exportReportPDF() {
    window.print();
}

// --- AUTHENTICATION LOGIC ---

// Auth State Observer - LISTENS GLOBALLY
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        loginSuccess(user.email, 'ADMIN');
    } else {
        logoutUI();
    }
});

// function loginSuccess MODIFIED for Device Lock
function loginSuccess(name, role) {
    document.getElementById('login-overlay').style.display = 'none';

    // Show "Loading" state on Lock Overlay immediately so user doesn't see blue screen
    const lockOverlay = document.getElementById('device-lock-overlay');
    const statusText = document.getElementById('lock-status');
    if (lockOverlay && statusText) {
        lockOverlay.style.display = 'flex';
        statusText.innerHTML = "🔄 Verificando autorización de dispositivo...";
        statusText.style.background = "#E3F2FD"; // Light Blue
        statusText.style.color = "#0277BD";
    }

    // Don't show app-container yet. Check Device Permission first.
    verifyDeviceAccess(name);
}

// --- DEVICE SECURITY LOCK 2.0 ---
// --- DEVICE SECURITY LOCK 2.0 (ACTIVE) ---
function verifyDeviceAccess(userEmail) {
    if (!db || !myDeviceId) return;
    const lockStatus = document.getElementById('lock-status');

    // Listener for Real-time approval
    if (unsubscribeDeviceListener) unsubscribeDeviceListener(); // Clear prev if any
    unsubscribeDeviceListener = db.collection('authorized_devices').doc(myDeviceId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                if (data.status === 'approved') {
                    // UNLOCK!
                    // Determine Role dynamically
                    const email = userEmail;

                    // 1. Whitelist Super Admins (Prevent Lockout - SUPREME OVERRIDE)
                    // Check this BEFORE DB query to avoid being blocked by DB errors
                    const cleanEmail = email ? email.trim().toLowerCase() : '';
                    console.log("Checking Whitelist for: '" + cleanEmail + "' (Original: '" + email + "')");

                    const superAdmins = ['derda@genaro.edu.pe', 'admin@genaro.edu.pe'];
                    if (superAdmins.includes(cleanEmail)) {
                        // alert("DEBUG: ADMIN SUPREMO DETECTADO: " + cleanEmail); // Visual Check
                        console.log("Super Admin Identified via Whitelist: " + cleanEmail);
                        unlockApp(userEmail, 'ADMIN');
                        return; // EXIT EARLY - Skip DB check
                    }

                    // 2. Regular Check
                    // Ensure case-insensitive match assumption
                    db.collection('app_users').where('email', '==', email).get()
                        .then(snap => {
                            let role = 'AUXILIAR'; // Default
                            if (!snap.empty) {
                                role = snap.docs[0].data().role || 'AUXILIAR';
                            } else {
                                console.warn("User not found in app_users, defaulting to AUXILIAR");
                            }
                            unlockApp(userEmail, role);
                        })
                        .catch(err => {
                            console.error("Role fetch error", err);
                            unlockApp(userEmail, 'AUXILIAR'); // Fail safe
                        });
                } else if (data.status === 'blocked') {
                    if (lockStatus) {
                        lockStatus.innerHTML = "⛔ <b>ACCESO BLOQUEADO</b><br>Este dispositivo ha sido rechazado.";
                        lockStatus.style.background = "#ffcdd2";
                        lockStatus.style.color = "#c62828";
                        lockStatus.style.border = "1px solid #e57373";
                    }
                } else {
                    // Pending
                    if (lockStatus) {
                        lockStatus.innerHTML = "⏳ <b>PENDIENTE DE APROBACIÓN</b><br>Contacte a la Dirección para activar este equipo.";
                        lockStatus.style.background = "#FFF3CD";
                        lockStatus.style.color = "#856404";
                    }
                }
            } else {
                // Register new device as PENDING
                db.collection('authorized_devices').doc(myDeviceId).set({
                    id: myDeviceId,
                    uid: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'unknown',
                    email: userEmail,
                    name: getDeviceInfo(),
                    status: 'pending', // LOCKED BY DEFAULT
                    requestedAt: new Date().toISOString(),
                    userAgent: navigator.userAgent
                }).then(() => {
                    if (lockStatus) lockStatus.innerText = "🚀 Solicitud enviada. Esperando aprobación...";
                }).catch(e => console.error("Error creating device request:", e));
            }
        }, (error) => {
            console.error("Device listener error:", error);
            showToast("Error de conexión: " + error.message, "error");
        });
}

function processAdminEmail(email) {
    // Simple check for known admins if needed, or rely on device metadata
    return true; // For now all approved devices act as admins until we refine roles
}

function unlockApp(name, role) {
    const lockOverlay = document.getElementById('device-lock-overlay');
    const appContainer = document.getElementById('app-container');
    const nav = document.getElementById('mainTabs');

    lockOverlay.style.display = 'none';
    appContainer.style.display = 'flex';
    nav.style.display = 'flex';

    if (document.getElementById('userRoleDisplay')) {
        document.getElementById('userRoleDisplay').innerText = `${name} (${role})`;
    }

    currentUserRole = role;

    // DEBUG: Show role to user to confirm
    showToast(`🔑 Acceso concedido: ${role}`, "info");

    // RESET VISIBILITY
    document.getElementById('tab-devices').style.display = 'none';
    document.getElementById('tab-generator').style.display = 'none';

    // ADMIN PERMISSIONS
    if (role === 'ADMIN' || role === true) {
        document.getElementById('tab-devices').style.display = 'block';
        document.getElementById('tab-generator').style.display = 'block';
        currentUserRole = 'ADMIN';
    }

    // SIAGISTA PERMISSIONS (Generator + Reports + Incidents)
    if (role === 'SIAGISTA') {
        document.getElementById('tab-generator').style.display = 'block';
        // Reports and Incidents are visible by default
    }

    // AUXILIAR can see Scanner, Reports, Incidents (Default visible)

    setTimeout(subscribeToStudents, 500);
}

// DEBUG FUNCTIONS
async function debugForceRegister() {
    if (!db || !myDeviceId) return alert("No DB/ID");
    try {
        await db.collection('authorized_devices').doc(myDeviceId).set({
            id: myDeviceId,
            uid: firebase.auth().currentUser ? firebase.auth().currentUser.uid : 'anon',
            email: firebase.auth().currentUser ? firebase.auth().currentUser.email : 'anon@test.com',
            name: "DISPOSITIVO DEBUG " + Math.random().toString(36).substring(7),
            status: 'pending',
            requestedAt: new Date().toISOString(),
            userAgent: navigator.userAgent
        });
        alert("✅ Registro forzado exitoso. Recarga la lista.");
        loadDeviceRequests();
    } catch (e) {
        alert("❌ Error forzando registro: " + e.message);
    }
}

// Admin: Load Request List
function loadDeviceRequests() {
    try {
        // alert("Cargando lista de dispositivos..."); // Uncomment if needed

        // DIAGNOSTIC INFO REMOVED

        if (!db) return;
        const pendingList = document.getElementById('pendingDevicesList');
        const approvedList = document.getElementById('approvedDevicesList');

        // Safety check just in case
        if (!pendingList || !approvedList) {
            console.error("Missing table elements");
            return;
        }

        // Live Listener for Pendings
        console.log("Listening for pending devices...");
        db.collection('authorized_devices').where('status', '==', 'pending')
            .onSnapshot(snap => {
                console.log("Pending snap size:", snap.size);
                if (document.getElementById('debugQueryResult')) document.getElementById('debugQueryResult').innerText = "Pendientes: " + snap.size;

                pendingList.innerHTML = "";
                if (snap.empty) {
                    pendingList.innerHTML = "<tr><td colspan='3' style='text-align:center; color:#999'>No hay solicitudes pendientes</td></tr>";
                } else {
                    snap.forEach(doc => {
                        const d = doc.data();
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                           <td>
                               <strong>${d.name}</strong><br>
                               <span style="font-size:11px; color:#666">${d.email}</span>
                           </td>
                           <td style="font-size:11px">${new Date(d.requestedAt).toLocaleDateString()}</td>
                           <td>
                               <button class="btn-primary" style="padding:5px 10px; font-size:12px" onclick="approveDevice('${d.id}')">✅</button>
                               <button class="btn-danger" style="padding:5px 10px; font-size:12px" onclick="rejectDevice('${d.id}')">❌</button>
                           </td>
                       `;
                        pendingList.appendChild(tr);
                    });
                }
            }, err => {
                console.error("Error loading pendings:", err);
                pendingList.innerHTML = `<tr><td colspan='3' style='color:red'>Error: ${err.message}</td></tr>`;
                if (document.getElementById('debugQueryResult')) document.getElementById('debugQueryResult').innerText = "ERROR: " + err.message;
            });

        // One-time load for Approved (or listener if preferred)
        db.collection('authorized_devices').where('status', '==', 'approved').limit(20).get()
            .then(snap => {
                approvedList.innerHTML = "";

                // DEBUG: Update Global Panels
                const countMsg = " | Aprobados: " + snap.size;
                if (document.getElementById('debugQueryResult')) document.getElementById('debugQueryResult').innerText += countMsg;
                // Update Floating Panel Query Result if exists (using floatDebugDB as proxy or new element)
                // Let's use alert for now if size is 0 to be sure
                if (snap.size === 0) console.log("Zero approved devices found");

                if (snap.empty) {
                    approvedList.innerHTML = "<tr><td colspan='3' style='text-align:center; color:#999'>No hay dispositivos aprobados (0)</td></tr>";
                }
                snap.forEach(doc => {
                    const d = doc.data();
                    const isMe = (d.id === myDeviceId);
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                         <td>${d.name} ${isMe ? '(YTú)' : ''}</td>
                         <td>${d.email}</td>
                         <td>
                            ${!isMe ? `<button class="btn-danger" style="padding:2px 5px; font-size:10px" onclick="rejectDevice('${d.id}')">Bloquear</button>` : ''}
                         </td>
                     `;
                    approvedList.appendChild(tr);
                });
            })
            .catch(err => {
                console.error("Error loading approved:", err);
                approvedList.innerHTML = `<tr><td colspan='3' style='color:red'>Error Aprobados: ${err.message}</td></tr>`;
                // CRITICAL: Show error in debug panel
                if (document.getElementById('debugQueryResult')) document.getElementById('debugQueryResult').innerText += " | ERR: " + err.message;
                alert("Error cargando Aprobados: " + err.message);
            });
    } catch (e) {
        alert("CRASH en loadDeviceRequests: " + e.message);
    }
}

function approveDevice(id) {
    if (confirm("¿Permitir acceso a este dispositivo?")) {
        db.collection('authorized_devices').doc(id).update({ status: 'approved', approvedAt: new Date().toISOString() });
    }
}

function rejectDevice(id) {
    if (confirm("¿Bloquear/Rechazar este dispositivo?")) {
        db.collection('authorized_devices').doc(id).update({ status: 'rejected' });
    }
}


function logout() {
    if (unsubscribeDeviceListener) {
        unsubscribeDeviceListener();
        unsubscribeDeviceListener = null;
    }
    firebase.auth().signOut().then(() => {
        console.log("Sesión cerrada");
    }).catch((error) => {
        console.error("Error al cerrar sesión", error);
    });
}

function logoutUI() {
    currentUserRole = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-overlay').style.display = 'flex';
    stopScanner();
    // Clear list to prevent stale data
    if (document.getElementById('generatedList')) document.getElementById('generatedList').innerHTML = "";
}

// Legacy Device Info (Kept if needed for logs, but not for auth)
function getDeviceInfo() {
    const ua = navigator.userAgent;
    return ua;
}
// checkDeviceAuth REMOVED
// handleLogoClick REMOVED
// updateAuthDisplay REMOVED (No longer needed, handled by Listener)

// Device Management List REMOVED

// Init
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM LOADED v26.21");
    // alert("SISTEMA ACTUALIZADO v26.0 - Si ves esto, estás en la versión correcta.");

    // Init Date input to Today
    const todayISO = new Date().toISOString().split('T')[0];
    document.getElementById('filterDate').value = todayISO;

    // Check if previously logged in? For security, always ask PIN on refresh.
    // logout(); // Ensure clean state
    // updateAuthDisplay(); // REMOVED: Function undefined and not needed

    // Load default report logic moved to openTab('reports') to avoid auth errors on init

    // Ensure Scanner is open by default logic via HTML classes, but we can enforce it:
    openTab('scanner');
});

async function generateFilteredReport(autoPrint = false) {
    if (!db) return;

    const dateVal = document.getElementById('filterDate').value; // YYYY-MM-DD
    const gradeVal = document.getElementById('filterGrade').value;
    const sectionVal = document.getElementById('filterSection').value;

    if (!dateVal) {
        showToast("Seleccione una fecha", "error");
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
        const typeText = (row.type === 'salida') ? 'Salida' : 'Ingreso';
        tr.innerHTML = `
            <td style="border: 1px solid #000; padding: 5px; text-align: center;">${index + 1}</td>
            <td style="border: 1px solid #000; padding: 5px;">${row.displayTime}</td>
            <td style="border: 1px solid #000; padding: 5px;"><strong>${typeText}</strong></td>
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

async function revokeAllDevices(manualTrigger = true) {
    if (manualTrigger) {
        if (!confirm("⚠️ ¿REVOCAR ABSOLUTAMENTE TODOS LOS DISPOSITIVOS?\n\nEsta acción borrará TODOS los permisos de acceso.\nTodos los dispositivos (incluido este) perderán el acceso y deberán volver a usar la clave Maestra.")) {
            return;
        }
        const input = prompt("Para confirmar, escribe: BORRAR TODO");
        if (input !== 'BORRAR TODO') return showToast("Acción cancelada.", "info");
    }

    try {
        await deleteCollection('authorized_devices');
        showToast("✅ TODOS LOS DISPOSITIVOS REVOCADOS.", "success");
        setTimeout(() => location.reload(), 2000);
    } catch (e) {
        console.error(e);
        showToast("Error al borrar: " + e.message, "error");
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
    if (dni.length !== 8) return showToast("Ingrese un DNI de 8 dígitos", "error");

    try {
        const snap = await db.collection('students').where('id', '==', dni).get();
        if (snap.empty) {
            showToast("Alumno no encontrado", "error");
            selectedIncidentStudent = null;
            document.getElementById('incidentStudentInfo').style.display = 'none';
            return;
        }

        const data = snap.docs[0].data();
        selectedIncidentStudent = {
            dni: data.id,
            name: data.n,
            grade: data.g,
            section: data.s
        };

        document.getElementById('incidentStudentName').innerText = `${data.n} (${data.g}° "${data.s}")`;
        document.getElementById('incidentStudentInfo').style.display = 'block';

    } catch (e) {
        console.error(e);
        showToast("Error al buscar alumno", "error");
    }
}

async function registerIncident() {
    if (!selectedIncidentStudent) return showToast("Seleccione un alumno primero", "info");

    const type = document.getElementById('incidentType').value;
    const description = document.getElementById('incidentComment').value.trim();

    if (!description) return showToast("Ingrese un comentario sobre la incidencia.", "error");

    try {
        await db.collection('incidents').add({
            studentDni: selectedIncidentStudent.dni,
            studentName: selectedIncidentStudent.name,
            studentGrade: selectedIncidentStudent.grade,
            studentSection: selectedIncidentStudent.section,
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
        showToast("Error al registrar incidencia", "error");
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
                        <small style="color:#666;">DNI: ${data.studentDni} | ${data.studentGrade || ''}° "${data.studentSection || ''}"</small>
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
        showToast("Error al resolver incidencia", "error");
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
    if (!db) return showToast("No hay conexión con la base de datos.", "error");

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
            showToast("No hay incidencias en la Nube.", "info");
            if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        // BOM for Excel
        csvContent += "\ufeff";
        csvContent += "Fecha;Alumno;DNI;Grado;Sección;Tipo de Incidencia;Descripción;Estado;Fecha Resolución\n";

        snapshot.forEach(doc => {
            const row = doc.data();
            const date = formatDateFriendly(row.date);
            const resolvedAt = row.resolvedAt ? formatDateFriendly(row.resolvedAt) : '-';
            const safeName = `"${row.studentName || ''}"`;
            const safeDesc = `"${(row.description || '').replace(/"/g, '""')}"`;
            const status = row.status === 'active' ? 'Activa' : 'Resuelta';

            csvContent += `${date};${safeName};${row.studentDni};${row.studentGrade || ''};${row.studentSection || ''};${row.type};${safeDesc};${status};${resolvedAt}\n`;
        });

        downloadCSV(csvContent, `Historial_Incidencias_${new Date().toISOString().slice(0, 10)}.csv`);

    } catch (e) {
        console.error("Error exportando incidencias:", e);
        showToast("Error al descargar: " + e.message, "error");
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
            showToast("Caché limpiado. Recargando...", "success");
            window.location.reload(true);
        } catch (e) {
            console.error("Error clearing cache:", e);
            window.location.reload(true);
        }
    }
}

// Restore DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    // Init Date input to Today
    const filterDate = document.getElementById('filterDate');
    if (filterDate) {
        const todayISO = new Date().toISOString().split('T')[0];
        filterDate.value = todayISO;
    }
});

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
