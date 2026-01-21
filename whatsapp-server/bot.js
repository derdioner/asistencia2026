const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// --- ARGUMENT PARSING (IDENTITY) ---
// Usage: node bot.js auxiliar1
const sessionName = process.argv[2] || 'default-session';
console.log(`🤖 INICIANDO BOT CON IDENTIDAD: [${sessionName.toUpperCase()}]`);

// Set Terminal Title for easier identification
process.title = `🤖 BOT WHATSAPP - ${sessionName.toUpperCase()}`;

process.on('unhandledRejection', (reason, p) => {
    console.error('❌ ERROR NO CAPTURADO (PROMISE):', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ ERROR CRÍTICO NO CAPTURADO:', error);
    // keep alive if possible or let the user see it
});

// --- FIREBASE ADMIN INIT ---
try {
    if (!admin.apps.length) { // Prevent re-init error if code reloads
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("🔥 Firebase Admin Conectado");
    }
} catch (e) {
    console.error("❌ Error conectando Firebase Admin. ¿Falta serviceAccountKey.json?");
    console.error(e.message);
    process.exit(1);
}

const db = admin.firestore();

// --- WHATSAPP CLIENT INIT ---
// Each session stores its own login data in .wwebjs_auth/session-<name>
const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionName }),
    puppeteer: {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu', // GPU sometimes crashes on low-end VPS
            '--disable-extensions'
        ]
    }
});

client.on('qr', (qr) => {
    console.log(`⚡ ESCANEA ESTE QR PARA: ${sessionName.toUpperCase()}`);
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log(`🔑 ${sessionName}: AUTENTICADO CORRECTAMENTE`);
});

client.on('auth_failure', msg => {
    console.error(`❌ ${sessionName}: FALLO DE AUTENTICACIÓN`, msg);
});

client.on('ready', () => {
    console.log(`✅ ${sessionName}: LISTO Y CONECTADO. Esperando trabajo...`);
    listenForMessages();
});

client.initialize();

// --- LISTENER LOGIC (DISTRIBUTED WORKER) ---

let isProcessing = false;
let massCounter = 0;

function listenForMessages() {
    console.log(`👀 ${sessionName}: Monitor de cola activado.`);

    // Listen to "pending" messages
    // Note: All bots listen. The first one to "Claim" wins.
    db.collection('mail_queue')
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            if (isProcessing) return; // Busy working? Ignore updates until free.

            // Find a candidate?
            if (!snapshot.empty) {
                processQueueCandidate(snapshot);
            }
        }, error => {
            console.error("❌ Error Firestore:", error);
        });
}

async function processQueueCandidate(snapshot) {
    if (isProcessing) return;

    // Convert snapshot to array
    const docs = [];
    snapshot.forEach(doc => docs.push(doc));

    if (docs.length === 0) return;

    // Sort: Priority to 'attendance', then 'mass' (oldest first)
    docs.sort((a, b) => {
        const dA = a.data();
        const dB = b.data();
        if (dA.type === 'attendance' && dB.type !== 'attendance') return -1;
        if (dA.type !== 'attendance' && dB.type === 'attendance') return 1;
        return (dA.createdAt?.seconds || 0) - (dB.createdAt?.seconds || 0);
    });

    // --- CLAIM LOOP ---
    // Try to claim a message. If race lost, try the next one immediately.
    isProcessing = true;
    let claimedDocId = null;
    let claimedData = null;

    for (const candidate of docs) {
        // Double check local status before transaction overhead
        if (candidate.data().status !== 'pending') continue;

        try {
            const didClaim = await db.runTransaction(async (t) => {
                const docRef = db.collection('mail_queue').doc(candidate.id);
                const doc = await t.get(docRef);

                if (!doc.exists) return false;
                if (doc.data().status !== 'pending') return false; // Already taken

                // Claim it!
                t.update(docRef, {
                    status: 'processing',
                    processedBy: sessionName,
                    pickedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                return true;
            });

            if (didClaim) {
                claimedDocId = candidate.id;
                claimedData = candidate.data();
                break; // Exit loop, we got work!
            } else {
                console.log(`⚠️ ${sessionName}: Conflicto en ${candidate.data().name}. Intentando siguiente...`);
            }

        } catch (e) {
            console.error("Transaction Error:", e);
        }
    }

    if (claimedDocId && claimedData) {
        console.log(`🔒 ${sessionName}: Mensaje reclamado (${claimedData.name}). Procesando...`);
        await processMessageLogic(claimedDocId, claimedData);
    } else {
        // If we looped everything and got nothing, just relax.
        isProcessing = false;
    }
}

async function processMessageLogic(docId, data) {
    const msgType = data.type || 'mass';
    let delay = 0;

    // --- DELAY LOGIC (Jitter) ---
    if (msgType === 'attendance') {
        // High Priority: 8s - 25s
        delay = Math.floor(Math.random() * 17000) + 8000;
        console.log(`🚑 ${sessionName}: Esperando ${Math.floor(delay / 1000)}s...`);
    } else {
        // Low Priority: 45s - 90s
        delay = Math.floor(Math.random() * 45000) + 45000;
        console.log(`🐢 ${sessionName}: Esperando ${Math.floor(delay / 1000)}s...`);

        // Batch Logic (Per Bot)
        massCounter++;
        if (massCounter >= 20) {
            console.log(`🛑 ${sessionName}: Descanso de 5 min...`);
            await new Promise(r => setTimeout(r, 300000));
            massCounter = 0;
        }
    }

    await new Promise(r => setTimeout(r, delay));

    // Send
    try {
        let phone = data.phone.replace(/\D/g, '');
        if (phone.length === 9) phone = '51' + phone;

        // VALIDATE NUMBER EXISTS ON WHATSAPP
        const numberDetails = await client.getNumberId(phone);
        if (!numberDetails) {
            throw new Error("El número no existe en WhatsApp");
        }

        const chatId = numberDetails._serialized;

        // Typing simulation
        const chat = await client.getChatById(chatId);
        await chat.sendStateTyping();
        const typingTime = Math.floor(Math.random() * 3000) + 2000;
        await new Promise(r => setTimeout(r, typingTime));

        await client.sendMessage(chatId, data.message, { sendSeen: false });
        console.log(`✅ ${sessionName}: ENVIADO -> ${data.name}`);

        // Mark done
        await db.collection('mail_queue').doc(docId).update({
            status: 'sent',
            sentBy: sessionName,
            sentAt: admin.firestore.FieldValue.serverTimestamp()
        });

    } catch (error) {
        console.error(`❌ ${sessionName}: Error enviando:`, error.message);
        await db.collection('mail_queue').doc(docId).update({
            status: 'error',
            error: error.message,
            failedBy: sessionName
        });
    }
}
