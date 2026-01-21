const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function clearQueue() {
    console.log("⏳ Buscando mensajes pendientes...");

    // Get all pending messages
    const snapshot = await db.collection('mail_queue')
        .where('status', '==', 'pending')
        .get();

    if (snapshot.empty) {
        console.log("✅ No hay mensajes pendientes en la cola.");
        return;
    }

    console.log(`🗑️ Se encontraron ${snapshot.size} mensajes pendientes. Eliminando...`);

    // Delete in batches of 400 (safe limit)
    let batch = db.batch();
    let counter = 0;
    let totalDeleted = 0;

    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        counter++;
        totalDeleted++;

        if (counter >= 400) {
            await batch.commit();
            console.log(`... lote de ${counter} eliminado.`);
            batch = db.batch();
            counter = 0;
        }
    }

    if (counter > 0) {
        await batch.commit();
    }

    console.log(`🎉 LISTO. Se eliminaron un total de ${totalDeleted} mensajes de la cola.`);
    process.exit(0);
}

clearQueue().catch(console.error);
