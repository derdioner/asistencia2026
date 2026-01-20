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
    authStrategy: new LocalAuth(), // ✅ ACTIVADO: Memoria persistente
    puppeteer: {
        headless: false, // Changed to false to debug crash
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions'
        ]
    }
});

client.on('qr', (qr) => {
    console.log('⚡ ESCANEA ESTE QR CON TU WHATSAPP (Como WhatsApp Web):');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('🔑 AUTENTICADO CORRECTAMENTE (Esperando sincronización...)');
});

client.on('auth_failure', msg => {
    console.error('❌ FALLO DE AUTENTICACIÓN', msg);
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
// --- LISTENER LOGIC (STRICT QUEUE) ---
let messageBuffer = [];
let isProcessing = false;

function listenForMessages() {
    console.log("👀 Monitor de cola activado. Esperando mensajes...");

    // 1. Listen and FILL buffer
    db.collection('mail_queue')
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    const docId = change.doc.id;

                    console.log(`📥 [BUFFER] Nuevo mensaje para: ${data.name}`);

                    // Add to local buffer if not already present (avoid dupes)
                    if (!messageBuffer.find(m => m.id === docId)) {
                        messageBuffer.push({ id: docId, data: data });
                    }
                }
            });

            // Trigger processor if asleep
            if (!isProcessing && messageBuffer.length > 0) {
                processQueue();
            }

        }, error => {
            console.error("❌ Error escuchando Firestore:", error);
        });
}

// 2. Sequential Processor Loop
async function processQueue() {
    if (messageBuffer.length === 0) {
        isProcessing = false;
        console.log("💤 Cola vacía. Esperando...");
        return;
    }

    isProcessing = true;
    const task = messageBuffer.shift(); // Get first item

    // SAFETY DELAY (15 - 25 seconds)
    // Randomize to look human
    const delay = Math.floor(Math.random() * 10000) + 15000;
    console.log(`⏳ Esperando seguridad (${(delay / 1000).toFixed(1)}s) antes de enviar a ${task.data.name}...`);

    await new Promise(r => setTimeout(r, delay));

    await processMessage(task.id, task.data);

    // Loop
    processQueue();
}

async function processMessage(docId, data) {
    // Format Phone
    let phone = data.phone.replace(/\D/g, '');
    if (phone.length === 9) phone = '51' + phone;
    const chatId = `${phone}@c.us`;

    const messageBody = data.message;

    try {
        await client.sendMessage(chatId, messageBody, { sendSeen: false });
        console.log(`✅ [ENVIADO] -> ${data.name} (${phone})`);

        // Mark as sent
        await db.collection('mail_queue').doc(docId).update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (error) {
        console.error(`❌ [ERROR] Falló envío a ${data.name}:`, error.message);

        // Mark as error
        await db.collection('mail_queue').doc(docId).update({
            status: 'error',
            error: error.message
        });
    }
}
