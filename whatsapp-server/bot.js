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

    // Convert snapshot to array to check candidates
    const docs = [];
    snapshot.forEach(doc => docs.push(doc));

    // Simple strategy: Pick the OLDEST one first (FIFO)
    // Or Priority: Attendance first
    docs.sort((a, b) => {
        const dA = a.data();
        const dB = b.data();
        // Priority 1: Type 'attendance' wins
        if (dA.type === 'attendance' && dB.type !== 'attendance') return -1;
        if (dA.type !== 'attendance' && dB.type === 'attendance') return 1;
        // Priority 2: Timestamp (Oldest first)
        return (dA.timestamp?.seconds || 0) - (dB.timestamp?.seconds || 0);
    });

    const candidate = docs[0];
    if (!candidate) return;

    // --- CLAIM TRANSACTION ---
    // Only ONE bot can process this message. We use a transaction to "claim" it.
    isProcessing = true;

    try {
        const didClaim = await db.runTransaction(async (t) => {
            const docRef = db.collection('mail_queue').doc(candidate.id);
            const doc = await t.get(docRef);

            if (!doc.exists) return false;
            const data = doc.data();

            if (data.status !== 'pending') {
                return false; // Someone else took it!
            }

            // Claim it!
            t.update(docRef, {
                status: 'processing',
                processedBy: sessionName,
                pickedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            return true;
        });

        if (didClaim) {
            console.log(`🔒 ${sessionName}: Mensaje reclamado (${candidate.data().name}). Procesando...`);
            await processMessageLogic(candidate.id, candidate.data());
        } else {
            console.log(`⚠️ ${sessionName}: Perdí la carrera. Otro bot tomó el mensaje.`);
            // Wait a small random bit before checking again to desist sync
            await new Promise(r => setTimeout(r, Math.random() * 2000));
        }

    } catch (e) {
        console.error("Transaction Error:", e);
    } finally {
        isProcessing = false;
        // Check if there are more? The snapshot listener will trigger again if pending docs remain.
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
        const chatId = `${phone}@c.us`;

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
