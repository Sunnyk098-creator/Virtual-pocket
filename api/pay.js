import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, query, orderByChild, equalTo, update } from "firebase/database";

// Aapki Nayi Virtual Pocket Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyBqR40Sa9qFSJaYSyzOjtXeTzmK1zaEBaE",
    authDomain: "virtual-pocketsk.firebaseapp.com",
    databaseURL: "https://virtual-pocketsk-default-rtdb.firebaseio.com",
    projectId: "virtual-pocketsk",
    storageBucket: "virtual-pocketsk.firebasestorage.app",
    messagingSenderId: "214243045131",
    appId: "1:214243045131:web:a98c6261a4b229ca4e3c0e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default async function handler(req, res) {
    // CORS Allow - Taki Telegram bot aur API block na ho
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    // Agar OPTIONS request aati hai (Preflight), toh yahi se success bhej do
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { key, paytm, amount, comment } = req.query;

        // 1. Basic Validation
        if (!key || !paytm || !amount) {
            return res.status(400).json({ status: "error", message: "Missing parameters! Need key, paytm, and amount." });
        }

        const withdrawAmount = Number(amount);
        if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
            return res.status(400).json({ status: "error", message: "Invalid amount!" });
        }

        // 2. VP- Key validation
        if (!key.startsWith("VP-")) {
            return res.status(401).json({ status: "error", message: "Invalid API Key format!" });
        }

        // 3. Find Admin/Bot Owner via API Key (Realtime Database Query)
        const usersRef = ref(db, "users");
        const qAdmin = query(usersRef, orderByChild("apiKey"), equalTo(key));
        const adminSnap = await get(qAdmin);

        if (!adminSnap.exists()) {
            return res.status(401).json({ status: "error", message: "Invalid or Expired API Key!" });
        }

        let adminPhone = null;
        let adminData = null;
        
        adminSnap.forEach((child) => {
            adminPhone = child.key;
            adminData = child.val();
        });

        // 4. Admin Balance Check
        const currentAdminBal = Number(adminData.balance) || 0;
        if (currentAdminBal < withdrawAmount) {
            return res.status(400).json({ status: "error", message: "API Owner has insufficient balance!" });
        }

        // 5. Receiver Number Format Check
        let receiverPhone = paytm.trim();
        if (receiverPhone.length === 10) {
            receiverPhone = "+91" + receiverPhone; // Automatically adding +91
        } else if (!receiverPhone.startsWith("+91") && receiverPhone.length === 12) {
             receiverPhone = "+" + receiverPhone;
        }

        // 6. Check if Receiver Exists
        const receiverRef = ref(db, "users/" + receiverPhone);
        const receiverSnap = await get(receiverRef);

        if (!receiverSnap.exists()) {
            return res.status(404).json({ status: "error", message: `User ${paytm} is not registered in Virtual Pocket!` });
        }

        const currentReceiverBal = Number(receiverSnap.val().balance) || 0;

        // 7. Process Transactions (Atomic Updates without using increment to avoid silent fails)
        const updates = {};
        
        // A) Deduct from Admin securely
        updates[`users/${adminPhone}/balance`] = currentAdminBal - withdrawAmount;
        
        // B) Add to Receiver securely
        updates[`users/${receiverPhone}/balance`] = currentReceiverBal + withdrawAmount;

        // 8. Save History Logs (Dual Sync logic for both Admin panel and User panel)
        const exactDate = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const txnId1 = "API_OUT" + Date.now();
        const txnId2 = "API_IN" + Date.now();

        // --- ADMIN LOGS ---
        // Global for Admin Panel (Paisa Gaya)
        updates[`transactions/${txnId1}`] = {
            id: txnId1,
            userPhone: adminPhone,
            receiver: receiverPhone,
            amount: withdrawAmount,
            type: "API SEND",
            status: "SUCCESS",
            date: exactDate,
            timestamp: Date.now(),
            comment: comment || "Bot Payout"
        };

        // Personal User History folder for Admin (Agar admin user panel khelega toh use yahan dikhega)
        updates[`users/${adminPhone}/transactions/${txnId1}`] = {
            id: txnId1, type: "TXN", title: "API Payment Sent", amount: withdrawAmount,
            status: "SUCCESS", timestamp: Date.now(), date: exactDate,
            isCredit: false, sign: "-", info: "To: " + receiverPhone
        };

        // --- RECEIVER LOGS ---
        // Global for Admin Panel (Paisa Aaya)
        updates[`transactions/${txnId2}`] = {
            id: txnId2,
            userPhone: receiverPhone,
            sender: "API System",
            amount: withdrawAmount,
            type: "API RECEIVED",
            status: "SUCCESS",
            date: exactDate,
            timestamp: Date.now(),
            comment: comment || "Received from Bot"
        };

        // Personal User History folder for Receiver (Taki User Panel me P2P history tab me display ho)
        updates[`users/${receiverPhone}/transactions/${txnId2}`] = {
            id: txnId2, type: "TXN", title: "API Payment Received", amount: withdrawAmount,
            status: "SUCCESS", timestamp: Date.now(), date: exactDate,
            isCredit: true, sign: "+", info: "From API"
        };

        // Execute all updates simultaneously (Atomic)
        await update(ref(db), updates);

        // 9. Send Success Response back to Bot
        return res.status(200).json({
            status: "success",
            message: "Payment successful",
            data: {
                transaction_id: txnId2,
                amount: withdrawAmount,
                receiver: receiverPhone,
                timestamp: exactDate
            }
        });

    } catch (error) {
        console.error("API Crash: ", error);
        // Hamesha JSON return karega, server crash nahi hoga
        return res.status(500).json({ 
            status: "error", 
            message: "Internal Server Error", 
            details: error.message 
        });
    }
}
