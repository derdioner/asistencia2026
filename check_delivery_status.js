const admin = require('firebase-admin');
const serviceAccount = require('../whatsapp-server-backup/serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function analyzeDelivery() {
    console.log("📊 Analizando estado de entregas QR (Modo Detallado)...");

    try {
        // 1. Get ALL STUDENTS
        const studentsSnapshot = await db.collection('students').get();
        const allStudents = [];
        studentsSnapshot.forEach(doc => {
            const data = doc.data();
            allStudents.push({
                id: doc.id,
                dni: data.dni || doc.id,
                name: data.name || data.nombre || "Desconocido",
                grade: data.grade || data.grado || data.g || "?",
                section: data.section || data.seccion || data.s || "?",
                qr_delivered: data.qr_delivered || false
            });
        });
        console.log(`✅ Total Alumnos Registrados: ${allStudents.length}`);

        // 2. Count DELIVERED based on flag in STUDENT document
        // Logic found in script.js: db.collection('students').doc(id).update({ qr_delivered: true })
        const deliveredDnis = new Set();

        allStudents.forEach(s => {
            if (s.qr_delivered === true) {
                deliveredDnis.add(s.dni);
            }
        });
        console.log(`✅ Total QRs Entregados: ${deliveredDnis.size}`);

        // 3. Compare
        // missing is just those without the flag
        const missing = allStudents.filter(s => !s.qr_delivered);

        // Group by Grade/Section
        const byClass = {};
        missing.forEach(s => {
            const key = `${s.grade}° "${s.section}"`;
            if (!byClass[key]) byClass[key] = 0;
            byClass[key]++;
        });

        // Write to file
        const fs = require('fs');
        let report = `📊 REPORTE DE ENTREGAS QR faltantes\n`;
        report += `========================================\n`;
        report += `ℹ️ Project ID: ${serviceAccount.project_id}\n`;
        report += `✅ Total Alumnos Registrados: ${allStudents.length}\n`;

        // DEBUG: Show first student data keys
        if (allStudents.length > 0) {
            report += `🔍 Debug 1st Student Keys: ${Object.keys(allStudents[0]).join(', ')}\n`;
            report += `🔍 Debug 1st Student qr_delivered: ${allStudents[0].qr_delivered} (Type: ${typeof allStudents[0].qr_delivered})\n`;
        }

        report += `✅ Total QRs Entregados (Flag 'qr_delivered'): ${deliveredDnis.size}\n`;
        report += `⚠️ FALTAN POR ENTREGAR: ${missing.length}\n`;
        report += `----------------------------------------\n`;

        // CHECK ATTENDANCE FOR TODAY
        const todayStr = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }); // dd/mm/yyyy
        // Fix format to match script.js: DD/MM/YYYY
        const now = new Date();
        const d = now.getDate().toString().padStart(2, '0');
        const m = (now.getMonth() + 1).toString().padStart(2, '0');
        const y = now.getFullYear();
        const displayDate = `${d}/${m}/${y}`;

        const attendanceSnap = await db.collection('attendance').where('displayDate', '==', displayDate).get();
        report += `📅 Asistencias de HOY (${displayDate}): ${attendanceSnap.size}\n`;
        report += `   (Nota: Si aquí hay ~30 y arriba 0, es posible que se escanearon en 'Asistencia' y no en 'Entrega')\n`;
        report += `----------------------------------------\n`;

        const sortedKeys = Object.keys(byClass).sort();
        sortedKeys.forEach(key => {
            report += `  - ${key}: Faltan ${byClass[key]}\n`;
        });

        report += `\n(Nota: Si el grado es '?', verifique los datos del alumno)\n`;

        fs.writeFileSync('delivery_report_internal.txt', report);
        console.log("Reporte guardado en delivery_report_internal.txt");

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

analyzeDelivery();
