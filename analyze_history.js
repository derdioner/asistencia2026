const admin = require('firebase-admin');
const serviceAccount = require('../whatsapp-server-backup/serviceAccountKey.json');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function analyzeHistory() {
    console.log("📊 Analizando Historial de Escaneos (Último Mes)...");

    // Time range: Last 30 days
    const now = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(now.getDate() - 30);
    console.log(`📅 Desde: ${oneMonthAgo.toLocaleDateString()} hasta ${now.toLocaleDateString()}`);

    const uniqueDnis = new Set();
    const studentsFound = {}; // Map DNI -> Name

    try {
        // SOURCE 1: ATTENDANCE COLLECTION
        const attSnap = await db.collection('attendance')
            .where('timestamp', '>=', oneMonthAgo)
            .get();

        console.log(`\n📂 Colección 'attendance': ${attSnap.size} registros encontrados.`);
        attSnap.forEach(doc => {
            const data = doc.data();
            if (data.dni) {
                uniqueDnis.add(data.dni);
                if (!studentsFound[data.dni]) studentsFound[data.dni] = data.name;
            }
        });

        // SOURCE 2: MAIL_QUEUE COLLECTION (Backup Memory)
        // Note: Check if 'timestamp' exists, otherwise use 'created' or similar if different schema
        // script.js uses 'timestamp': serverTimestamp()
        try {
            const queueSnap = await db.collection('mail_queue')
                .where('timestamp', '>=', oneMonthAgo)
                .get();

            console.log(`📂 Colección 'mail_queue': ${queueSnap.size} registros encontrados.`);
            queueSnap.forEach(doc => {
                const data = doc.data();
                if (data.dni) {
                    uniqueDnis.add(data.dni);
                    if (!studentsFound[data.dni]) studentsFound[data.dni] = data.name;
                }
            });
        } catch (e) {
            console.warn("⚠️ No se pudo leer mail_queue o no existe índice:", e.message);
        }

        console.log("-----------------------------------------");
        console.log(`✅ TOTAL ESTUDIANTES ÚNICOS ESCANEADOS: ${uniqueDnis.size}`);

        // Get Total Students for comparison
        const studSnap = await db.collection('students').get();
        const allStudents = [];
        studSnap.forEach(doc => {
            const d = doc.data();
            allStudents.push({
                dni: d.id || doc.id,
                name: d.n,
                g: d.g || d.grade,
                s: d.s || d.section
            });
        });

        console.log(`✅ TOTAL ESTUDIANTES REGISTRADOS: ${allStudents.length}`);

        // Calculate Missing
        const scannedDnis = new Set(uniqueDnis);
        const missing = allStudents.filter(s => !scannedDnis.has(s.dni));

        console.log(`⚠️ ALUMNOS QUE FALTAN ESCANEAR (en el último mes): ${missing.length}`);
        console.log("-----------------------------------------");

        // Write report
        const fs = require('fs');
        let report = `📊 REPORTE DE USO DE QR (Últimos 30 días)\n`;
        report += `📅 Periodo: ${oneMonthAgo.toLocaleDateString()} - ${now.toLocaleDateString()}\n`;
        report += `========================================\n`;
        report += `✅ Estudiantes Únicos Escaneados: ${uniqueDnis.size}\n`;
        report += `✅ Total Alumnos Matriculados: ${allStudents.length}\n`;
        report += `⚠️ FALTAN POR USAR EL QR: ${missing.length}\n`;
        report += `----------------------------------------\n`;

        report += `\n📋 LISTA DE ALUMNOS QUE FALTAN (${missing.length}):\n`;

        // Sort by Grade/Section
        missing.sort((a, b) => {
            if (a.g !== b.g) return a.g - b.g;
            if (a.s !== b.s) return a.s.localeCompare(b.s);
            return a.name.localeCompare(b.name);
        });

        missing.forEach(s => {
            report += `[ ] ${s.g}° "${s.s}" - ${s.name} (DNI: ${s.dni})\n`;
        });

        fs.writeFileSync('history_report.txt', report);
        console.log("📄 Reporte guardado en 'history_report.txt'");

        // Export CSV for Excel
        let csvContent = "\ufeffDNI;NOMBRE COMPLETO;GRADO;SECCION\n"; // Header with BOM
        missing.forEach(s => {
            csvContent += `${s.dni};"${s.name}";${s.g};"${s.s}"\n`;
        });

        fs.writeFileSync('Faltantes_QR_30dias.csv', csvContent);
        console.log("📊 Excel guardado en 'Faltantes_QR_30dias.csv'");

    } catch (error) {
        console.error("❌ Error CRITICO:", error);
    }
}

analyzeHistory();
