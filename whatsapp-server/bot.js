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
let massCounter = 0;

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

    // PRIORITY SORT: 'attendance' first, then 'mass' (or others)
    messageBuffer.sort((a, b) => {
        const typeA = a.data.type || 'mass';
        const typeB = b.data.type || 'mass';
        if (typeA === 'attendance' && typeB !== 'attendance') return -1;
        if (typeA !== 'attendance' && typeB === 'attendance') return 1;
        return 0; // Keep insertion order otherwise
    });

    const task = messageBuffer.shift(); // Get first item
    const msgType = task.data.type || 'mass'; // Default to mass if missing

    // --- DYNAMIC DELAY LOGIC ---
    let delay = 0;

    if (msgType === 'attendance') {
        // High Priority: Fast but safe (10s - 20s)
        delay = Math.floor(Math.random() * 10000) + 10000;
        console.log(`🚑 ALTA PRIORIDAD (${task.data.name}): Esperando solo ${Math.floor(delay / 1000)}s...`);
    } else {
        // Low Priority (Mass): Slow and steady (45s - 90s)
        delay = Math.floor(Math.random() * 45000) + 45000;
        console.log(`🐢 MASIVO / NORMAL (${task.data.name}): Esperando seguridad ${Math.floor(delay / 1000)}s...`);

        // BATCH COOL DOWN LOGIC (Only for Mass)
        massCounter++;
        if (massCounter >= 20) {
            console.log("🛑 LÍMITE DE LOTE ALCANZADO (20 mensajes). Pausando 5 MINUTOS para evitar bloqueo...");
            await new Promise(r => setTimeout(r, 300000)); // 5 minutes
            massCounter = 0;
            console.log("♻️ Resumiendo envío masivo...");
        }
    }

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
        // TYPING SIMULATION (Human behavior)
        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();
        // Wait a bit while "typing"
        await new Promise(r => setTimeout(r, 3000));

        await client.sendMessage(chatId, messageBody, { sendSeen: false });
        console.log(`✅ [ENVIADO - ${data.type || 'mass'}] -> ${data.name} (${phone})`);

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
