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
    // FIJANDO VERSION WEB PARA EVITAR ERROR 'WidFactory' / 'getChat'
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: false,
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
    console.log(`⚡ ESCANEA ESTE QR PARA: ${sessionName.toUpperCase()}`);
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log(`🔑 ${sessionName}: AUTENTICADO CORRECTAMENTE`);
});

let fallbackTimeout;

client.on('ready', () => {
    console.log(`✅ ${sessionName}: LISTO Y CONECTADO. Esperando trabajo...`);
    if (fallbackTimeout) clearTimeout(fallbackTimeout); // Cancel fallback if ready fires
    listenForMessages();
});

// Fallback only if ready doesn't fire
fallbackTimeout = setTimeout(() => {
    console.log(`⚠️ ${sessionName}: Forzando inicio de listener (Fallback por demora en 'ready')...`);
    listenForMessages();
}, 15000); // Increased to 15s to be safe

client.initialize();

// --- LISTENER LOGIC (DISTRIBUTED WORKER) ---

// --- LISTENER LOGIC (DISTRIBUTED WORKER) ---

let isProcessing = false;
let massCounter = 0;
let latestSnapshot = null; // Cache the latest view of the queue

function listenForMessages() {
    console.log(`👀 ${sessionName}: Monitor de cola activado.`);

    db.collection('mail_queue')
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            latestSnapshot = snapshot; // Always update our view of reality
            attemptToWork(); // Try to grab a job
        }, error => {
            console.error("❌ Error Firestore:", error);
        });

    // Heartbeat to show life in console
    setInterval(() => {
        console.log(`💓 ${sessionName}: Bot activo y esperando... (Latido)`);
    }, 300000); // 5 minutes
}

// Wrapper to safely check/start work
function attemptToWork() {
    if (isProcessing) return; // Busy? Do nothing.
    if (!latestSnapshot || latestSnapshot.empty) return; // No work? Do nothing.

    processQueueCandidate();
}

async function processQueueCandidate() {
    if (isProcessing) return; // Double check

    // Convert snapshot to array
    const docs = [];
    latestSnapshot.forEach(doc => docs.push(doc));

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
    isProcessing = true;
    let claimedDocId = null;
    let claimedData = null;

    try {
        for (const candidate of docs) {
            // Local check
            if (candidate.data().status !== 'pending') continue;

            try {
                const didClaim = await db.runTransaction(async (t) => {
                    const docRef = db.collection('mail_queue').doc(candidate.id);
                    const doc = await t.get(docRef);

                    if (!doc.exists) return false;
                    if (doc.data().status !== 'pending') return false;

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
                    break; // Got work
                }
            } catch (e) {
                console.error("Transaction Error:", e);
            }
        }

        if (claimedDocId && claimedData) {
            console.log(`🔒 ${sessionName}: Mensaje reclamado (${claimedData.name}). Procesando...`);
            await processMessageLogic(claimedDocId, claimedData);
        }

    } catch (e) {
        console.error("Critical Worker Error:", e);
    } finally {
        isProcessing = false;

        // CRITICAL FIX:
        // Immediately check if there is MORE work in the buffer.
        // We don't wait for onSnapshot to fire again.
        // Small delay to let other bots update DB if needed, but not strictly necessary.
        setTimeout(attemptToWork, 1000);
    }
}

async function processMessageLogic(docId, data) {
    const msgType = data.type || 'mass';
    let delay = 0;

    if (msgType === 'attendance') {
        // High Priority: 10s - 15s (As requested by user for robots)
        delay = Math.floor(Math.random() * 5000) + 10000;
        console.log(`🚑 ${sessionName}: Esperando ${Math.floor(delay / 1000)}s... (Asistencia)`);
    } else {
        // Low Priority: 50s - 80s (Super Safe Mode mass sending for robots)
        delay = Math.floor(Math.random() * 30000) + 50000;
        console.log(`🐢 ${sessionName}: Esperando ${Math.floor(delay / 1000)}s... (Masivo)`);

        // Batch Logic (Per Bot)
        massCounter++;
        // Random batch size: 15 to 25 messages
        const batchLimit = Math.floor(Math.random() * 10) + 15;

        if (massCounter >= batchLimit) {
            // Random break: 5 to 10 minutes
            const breakTimeMin = Math.floor(Math.random() * 5) + 5;
            const breakTimeMs = breakTimeMin * 60 * 1000;

            console.log(`🛑 ${sessionName}: Límite de lote (${batchLimit}) alcanzado.`);
            console.log(`😴 ${sessionName}: Tomando siesta larga de ${breakTimeMin} minutos...`);

            await new Promise(r => setTimeout(r, breakTimeMs));
            massCounter = 0;
        }
    }

    await new Promise(r => setTimeout(r, delay));

    // Send
    try {
        let phone = data.phone.replace(/\D/g, '');
        if (phone.length === 9) phone = '51' + phone;

        // VALIDATE NUMBER EXISTS ON WHATSAPP
        let chatId;
        try {
            const numberDetails = await client.getNumberId(phone);
            if (numberDetails) {
                chatId = numberDetails._serialized;
            } else {
                throw new Error("El número no existe en WhatsApp (Check 1)");
            }
        } catch (e) {
            console.warn(`⚠️ ${sessionName}: 'getNumberId' falló (${e.message}). Usando Fallback ID manual.`);
            // FALLBACK FOR 'WidFactory' ERROR
            chatId = `${phone}@c.us`;
        }

        // Typing simulation (Optional - Fail safe)
        try {
            if (client && client.pupPage) { // Check if client and page are alive
                const chat = await client.getChatById(chatId);
                if (chat) {
                    await chat.sendStateTyping();
                    const typingTime = Math.floor(Math.random() * 3000) + 2000;
                    await new Promise(r => setTimeout(r, typingTime));
                }
            } else {
                console.warn(`⚠️ ${sessionName}: Client/Page not ready for typing simulation.`);
            }
        } catch (e) {
            console.warn(`⚠️ ${sessionName}: Typing simulation skipped (${e.message})`);
            // Continue to send anyway
        }

        // Timeout Promise Wrapper
        const sendPromise = client.sendMessage(chatId, data.message, { sendSeen: false });
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Tiempo de espera agotado al enviar mensaje (45s)")), 45000)
        );

        await Promise.race([sendPromise, timeoutPromise]);
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
