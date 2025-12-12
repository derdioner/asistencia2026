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

// --- GENERATOR LOGIC ---
let qrCodeObj = null;
let generatedCount = parseInt(localStorage.getItem('generatedCount')) || 0;
// Load generated students database
let generatedStudents = JSON.parse(localStorage.getItem('generatedStudents')) || [];

function generateQR() {
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

    // Check for duplicate DNI
    const duplicate = generatedStudents.find(student => student.id === dni);
    if (duplicate) {
        alert("Este DNI ya ha sido registrado para: " + duplicate.n);
        return;
    }

    // Create a data object
    const studentData = {
        n: name,
        id: dni,
        g: grade,
        s: section,
        p: phone
    };

    // Convert to string for QR
    const qrString = JSON.stringify(studentData);

    const container = document.getElementById('qrcode');
    container.innerHTML = ""; // Clear previous

    qrCodeObj = new QRCode(container, {
        text: qrString,
        width: 180,
        height: 180,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('downloadBtn').style.display = 'block';
    const qrText = document.getElementById('qr-text');
    qrText.innerText = `${name} - ${grade}° "${section}"`;
    qrText.style.display = 'block';

    // Update Count in background (optional)
    generatedCount++;
    localStorage.setItem('generatedCount', generatedCount);

    // Save to Students Database
    // Add timestamp for record keeping
    studentData.created = new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString();
    generatedStudents.push(studentData);
    localStorage.setItem('generatedStudents', JSON.stringify(generatedStudents));

    // Success Feedback & Auto-Clear
    alert("¡Pase Generado con Éxito!");

    // Clear inputs but keep QR visible
    nameInput.value = '';
    dniInput.value = '';
    phoneInput.value = '';
    // Optional: Reset selects or keep them? Keeping grade/section is usually helpful for batching.
    // Let's keep grade/section as they likely generate a whole class at once.
    nameInput.focus();
}

function exportGeneratedDatabase() {
    if (generatedStudents.length === 0) {
        alert("No hay estudiantes en la base de datos.");
        return;
    }

    // CSV Header (Using ; for Spanish Excel compatibility)
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Nombre;DNI;Grado;Seccion;Telefono Apoderado;Fecha Creacion\n";

    // CSV Rows
    generatedStudents.forEach(st => {
        // Escape content
        const safeName = `"${st.n}"`;
        csvContent += `${safeName};${st.id};${st.g};${st.s};${st.p || ''};${st.created}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `BaseDatos_Alumnos_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadQR() {
    const qrImg = document.querySelector('#qrcode img');
    if (qrImg) {
        const link = document.createElement('a');
        link.href = qrImg.src;
        link.download = `QR_Asistencia_${document.getElementById('studentName').value}.png`;
        link.click();
    }
}

// --- SCANNER LOGIC ---
let html5QrcodeScanner = null;
let isScanning = false;

function startScanner() {
    if (isScanning) return;

    // We use the Html5Qrcode class for more control or Html5QrcodeScanner for UI
    // Using Html5QrcodeScanner for simplicity as requested

    // Small delay to ensure DOM is ready
    setTimeout(() => {
        if (!html5QrcodeScanner) {
            html5QrcodeScanner = new Html5QrcodeScanner(
                "reader",
                { fps: 10, qrbox: { width: 250, height: 250 } },
                /* verbose= */ false
            );

            html5QrcodeScanner.render(onScanSuccess, onScanFailure);
            isScanning = true;
        }
    }, 100);
}

function stopScanner() {
    // We typically don't stop the 'Scanner' widget automatically because it handles itself,
    // but if we wanted to pause it we could. For now, we leave it active or let the library handle tab focus.
    // Actually, re-rendering usually requires clearing. Let's rely on the library's state.
}

// Attendance History Array
let attendanceHistory = JSON.parse(localStorage.getItem('attendanceHistory')) || [];

function onScanSuccess(decodedText, decodedResult) {
    // Prevent duplicate fast scans (debounce)
    const now = new Date();
    const lastScan = attendanceHistory.length > 0 ? new Date(attendanceHistory[0].timestamp) : null;

    if (lastScan && (now - lastScan) < 3000) {
        // Less than 3 seconds since last scan, ignore to prevent double/triple scanning same person
        return;
    }

    try {
        const data = JSON.parse(decodedText);

        // Basic validation
        if (!data.n || !data.id) throw new Error("QR Inválido");

        // Unique Daily Scan Validation
        const todayDate = now.toLocaleDateString();
        const alreadyScanned = attendanceHistory.find(r => r.dni === data.id && r.displayDate === todayDate);

        if (alreadyScanned) {
            showToast(`⚠️ ${data.n} ya registró asistencia hoy`, 'error');
            return;
        }

        const record = {
            name: data.n,
            dni: data.id,
            grade: data.g,
            section: data.s,
            phone: data.p,
            timestamp: now.toISOString(),
            displayTime: now.toLocaleTimeString(),
            displayDate: todayDate
        };

        attendanceHistory.unshift(record);
        saveHistory();
        renderHistory();

        // Non-blocking success message
        showToast(`✅ Asistencia: ${data.n}`, 'success');

    } catch (e) {
        console.error("Error parsing QR", e);
        // alert("QR no válido o formato incorrecto");
    }
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.className = 'toast'; // Hide
    }, 3000); // 3 seconds
}

function onScanFailure(error) {
    // console.warn(`Code scan error = ${error}`);
}

// --- DATA MANAGEMENT ---
function saveHistory() {
    localStorage.setItem('attendanceHistory', JSON.stringify(attendanceHistory));
}

function renderHistory() {
    const list = document.getElementById('attendanceList');
    list.innerHTML = "";

    attendanceHistory.forEach(record => {
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

    // Update attendance count
    document.getElementById('attendanceCount').innerText = `Total Hoy: ${attendanceHistory.length}`;
}

function clearHistory() {
    if (attendanceHistory.length === 0) return;

    const password = prompt("Ingrese la contraseña de administrador para borrar el historial:");
    if (password === "1234") { // Simple password
        if (confirm("¿Seguro que quieres borrar todo el historial?")) {
            attendanceHistory = [];
            saveHistory();
            renderHistory();
            alert("Historial eliminado.");
        }
    } else if (password !== null) {
        alert("Contraseña incorrecta.");
    }
}

function exportToExcel() {
    if (attendanceHistory.length === 0) {
        alert("No hay datos para exportar.");
        return;
    }

    // CSV Header (Using ; for Spanish Excel compatibility)
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Fecha;Hora;Nombre;DNI;Grado;Seccion;Telefono Apoderado\n";

    // CSV Rows
    attendanceHistory.forEach(row => {
        // Escape content
        const safeName = `"${row.name}"`;
        const date = row.displayDate;
        const time = row.displayTime;

        csvContent += `${date};${time};${safeName};${row.dni};${row.grade};${row.section};${row.phone}\n`;
    });


    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    // Filename with date
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `asistencia_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    renderHistory();
});
