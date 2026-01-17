const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // User needs to provide this

// --- FIREBASE ADMIN INIT ---
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("🔥 Firebase Admin Conectado");
} catch (e) {
    console.error("❌ Error conectando Firebase Admin. ¿Falta serviceAccountKey.json?");
    console.error(e.message);
    process.exit(1);
}

const db = admin.firestore();

// --- WHATSAPP CLIENT INIT ---
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Set to false if you want to see the browser pop up
        args: ['--no-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('⚡ ESCANEA ESTE QR CON TU WHATSAPP (Como WhatsApp Web):');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ BOT WHATSAPP ESTÁ LISTO Y CONECTADO');
    listenForMessages();
});

client.on('auth_failure', msg => {
    console.error('❌ FALLO DE AUTENTICACIÓN', msg);
});

client.initialize();

// --- LISTENER LOGIC ---
function listenForMessages() {
    console.log("👀 Escuchando cola de mensajes en 'mail_queue'...");

    // Listen for docs with status 'pending'
    db.collection('mail_queue')
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const docId = change.doc.id;

                    console.log(`📩 Nuevo mensaje detectado para: ${data.name}`);

                    // Add small delay to avoid spam filters if many come at once
                    const randomDelay = Math.floor(Math.random() * 3000) + 1000;
                    setTimeout(() => processMessage(docId, data), randomDelay);
                }
            });
        }, error => {
            console.error("❌ Error escuchando Firestore:", error);
        });
}

async function processMessage(docId, data) {
    // Format Phone Number: 51987654321@c.us
    let phone = data.phone.replace(/\D/g, ''); // Remove non-numbers
    if (phone.length === 9) phone = '51' + phone; // Add Peru Prefix
    const chatId = `${phone}@c.us`;

    const messageBody = data.message;

    try {
        await client.sendMessage(chatId, messageBody);
        console.log(`✅ Enviado a ${data.name} (${phone})`);

        // Update status in Firestore
        await db.collection('mail_queue').doc(docId).update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (error) {
        console.error(`❌ Falló envío a ${data.name}:`, error.message);

        // Mark as error
        await db.collection('mail_queue').doc(docId).update({
            status: 'error',
            error: error.message
        });
    }
}
