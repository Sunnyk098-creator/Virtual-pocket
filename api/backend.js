import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, update, increment } from "firebase/database";

// Aapka Original Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyCtxGByTxoZCEBtl5JhVUj0ueksJnmZhPE",
  authDomain: "virtual-pocket-37d39.firebaseapp.com",
  databaseURL: "https://virtual-pocket-37d39-default-rtdb.firebaseio.com",
  projectId: "virtual-pocket-37d39",
  storageBucket: "virtual-pocket-37d39.firebasestorage.app",
  messagingSenderId: "451510620983",
  appId: "1:451510620983:web:63895dae1cb38e393400b2"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default async function handler(req, res) {
    // CORS configuration (Sabhi jagah se allow karne ke liye)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: "Only POST allowed" });

    const { action, data } = req.body;

    try {
        // --- LOGIN LOGIC ---
        if (action === 'LOGIN') {
            const uRef = ref(db, `users/${data.phone}`);
            const snap = await get(uRef);
            if (!snap.exists() || snap.val().password !== data.password) throw new Error("Invalid Mobile or Password!");
            if (snap.val().banned) throw new Error("Account Banned by Admin.");
            return res.json({ data: snap.val() });
        }

        // --- REGISTER LOGIC ---
        if (action === 'REGISTER') {
            const uRef = ref(db, `users/${data.phone}`);
            const snap = await get(uRef);
            if (snap.exists()) throw new Error("Number already registered!");
            
            const newUser = {
                name: data.name, 
                phone: data.phone, 
                password: data.password, 
                pin: data.pin,
                balance: 0, 
                url: "https://virtual-pocketmrking77.vercel.app", // Aapka naya URL
                securityKey: "2824519534",
                banned: false, 
                joinedAt: new Date().toISOString()
            };
            await set(uRef, newUser);
            return res.json({ data: newUser });
        }

        // --- REALTIME SYNC LOGIC ---
        if (action === 'SYNC') {
            const [uSnap, cSnap] = await Promise.all([ get(ref(db, `users/${data.phone}`)), get(ref(db, "settings/config")) ]);
            if (!uSnap.exists()) throw new Error("User not found");
            return res.json({ data: { user: uSnap.val(), config: cSnap.val() || {} } });
        }

        // --- HISTORY FETCH LOGIC ---
        if (action === 'HISTORY') {
            const hSnap = await get(ref(db, `users/${data.phone}/transactions`));
            let txns = [];
            if (hSnap.exists()) hSnap.forEach(c => { txns.push(c.val()); });
            return res.json({ data: txns });
        }

        // --- CHECK RECEIVER LOGIC ---
        if (action === 'CHECK_RECEIVER') {
            const snap = await get(ref(db, `users/${data.phone}`));
            if (!snap.exists()) throw new Error("Not Registered");
            return res.json({ data: snap.val().name });
        }

        // --- PROFILE UPDATE LOGIC ---
        if (action === 'UPDATE_PROFILE') {
            await update(ref(db, `users/${data.phone}`), { name: data.name });
            return res.json({ data: "Success" });
        }

        // --- PIN UPDATE LOGIC ---
        if (action === 'UPDATE_PIN') {
            await update(ref(db, `users/${data.phone}`), { pin: data.pin });
            return res.json({ data: "Success" });
        }

        // --- GENERATE API KEY LOGIC ---
        if (action === 'GENERATE_API') {
            const newKey = 'VP-' + Math.random().toString(36).substr(2, 6).toUpperCase() + Date.now().toString(36).substr(4, 4).toUpperCase();
            await update(ref(db, `users/${data.phone}`), { apiKey: newKey, merchantApiKey: newKey });
            return res.json({ data: newKey });
        }

        // --- DEPOSIT REQUEST ---
        if (action === 'DEPOSIT') {
            const txnId = "DEP" + Date.now();
            const updates = {
                [`deposits/${txnId}`]: { id: txnId, userPhone: data.phone, userName: data.name, type: "DEP", amount: data.amount, utr: data.utr, status: "PENDING", timestamp: Date.now(), date: new Date().toLocaleString('en-IN') },
                [`users/${data.phone}/transactions/${txnId}`]: { id: txnId, type: "DEP", title: "Deposit Request", amount: data.amount, status: "PENDING", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: true, sign: "+", info: "UTR: " + data.utr }
            };
            await update(ref(db), updates);
            return res.json({ data: "Success" });
        }

        // --- WITHDRAW REQUEST ---
        if (action === 'WITHDRAW') {
            if (data.amount < 30) throw new Error("Minimum withdrawal amount is ₹30!"); // Secure backend validation added
            const txnId = "WTH" + Date.now();
            const updates = {
                [`users/${data.phone}/balance`]: increment(-data.amount),
                [`withdrawals/${txnId}`]: { id: txnId, userPhone: data.phone, userName: data.name, type: "WITH", amount: data.amount, upi: data.upi, status: "PENDING", timestamp: Date.now(), date: new Date().toLocaleString('en-IN') },
                [`users/${data.phone}/transactions/${txnId}`]: { id: txnId, type: "WITH", title: "Withdrawal Request", amount: data.amount, status: "PENDING", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: false, sign: "-", info: "UPI: " + data.upi }
            };
            await update(ref(db), updates);
            return res.json({ data: "Success" });
        }

        // --- P2P PAY LOGIC ---
        if (action === 'PAY') {
            const updates = {
                [`users/${data.sender}/balance`]: increment(-data.amount),
                [`users/${data.receiver}/balance`]: increment(data.amount),
                [`transactions/SND${Date.now()}`]: { userPhone: data.sender, receiver: data.receiver, amount: data.amount, type: 'SEND', status: 'SUCCESS', timestamp: Date.now() },
                [`transactions/RCV${Date.now()}`]: { userPhone: data.receiver, sender: data.sender, amount: data.amount, type: 'RECEIVE', status: 'SUCCESS', timestamp: Date.now() },
                [`users/${data.sender}/transactions/SND${Date.now()}`]: { id: `SND${Date.now()}`, type: "TXN", title: "Sent Money", amount: data.amount, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: false, sign: "-", info: "To: " + data.receiver },
                [`users/${data.receiver}/transactions/RCV${Date.now()}`]: { id: `RCV${Date.now()}`, type: "TXN", title: "Received Money", amount: data.amount, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: true, sign: "+", info: "From: " + data.sender }
            };
            await update(ref(db), updates);
            return res.json({ data: "Success" });
        }

        // --- BULK PAY LOGIC ---
        if (action === 'BULK_PAY') {
            const total = data.amount * data.receivers.length;
            const updates = { [`users/${data.sender}/balance`]: increment(-total) };
            
            data.receivers.forEach(num => {
                updates[`users/${num}/balance`] = increment(data.amount);
                const outId = "B_OUT" + Date.now() + Math.random().toString(36).substr(2, 4);
                const inId = "B_IN" + Date.now() + Math.random().toString(36).substr(2, 4);
                
                updates[`transactions/${outId}`] = { userPhone: data.sender, amount: data.amount, type: 'BULK SEND', status: 'SUCCESS', to: num, timestamp: Date.now() };
                updates[`users/${data.sender}/transactions/${outId}`] = { id: outId, type: "TXN", title: "Bulk Transfer", amount: data.amount, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: false, sign: "-", info: "To: " + num };
                
                updates[`transactions/${inId}`] = { userPhone: num, amount: data.amount, type: 'RECEIVED', status: 'SUCCESS', from: data.sender, timestamp: Date.now() };
                updates[`users/${num}/transactions/${inId}`] = { id: inId, type: "TXN", title: "Bulk Received", amount: data.amount, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: true, sign: "+", info: "From: " + data.sender };
            });
            await update(ref(db), updates);
            return res.json({ data: "Success" });
        }

        // --- CREATE GIFT CODE LOGIC ---
        if (action === 'CREATE_GIFT') {
            const total = data.amount * data.usersCount;
            const newCode = "VP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
            const updates = {
                [`users/${data.phone}/balance`]: increment(-total),
                [`promoCodes/${newCode}`]: { amount: data.amount, maxUsers: data.usersCount, claimedBy: [], status: "active", createdBy: data.phone, timestamp: Date.now() },
                [`transactions/GEN${Date.now()}`]: { userPhone: data.phone, amount: total, type: "GIFT CREATE", status: "SUCCESS", timestamp: Date.now() },
                [`users/${data.phone}/transactions/GEN${Date.now()}`]: { id: `GEN${Date.now()}`, type: "TXN", title: "Gift Code Create", amount: total, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: false, sign: "-", info: "Code: " + newCode }
            };
            await update(ref(db), updates);
            return res.json({ data: newCode });
        }

        // --- CLAIM GIFT CODE LOGIC ---
        if (action === 'CLAIM_GIFT') {
            const codeSnap = await get(ref(db, `promoCodes/${data.code}`));
            if (!codeSnap.exists() || codeSnap.val().status !== "active") throw new Error("Invalid or Expired Code!");
            
            const pData = codeSnap.val();
            let claimed = pData.claimedBy || [];
            if (claimed.includes(data.phone)) throw new Error("Already Claimed!");
            if (claimed.length >= (pData.maxUsers || 1)) throw new Error("Usage Limit Reached!");

            claimed.push(data.phone);
            const updates = {
                [`users/${data.phone}/balance`]: increment(pData.amount),
                [`promoCodes/${data.code}/claimedBy`]: claimed,
                [`promoCodes/${data.code}/status`]: claimed.length >= (pData.maxUsers || 1) ? "used" : "active",
                [`transactions/CLM${Date.now()}`]: { userPhone: data.phone, amount: pData.amount, type: "GIFT CLAIM", status: "SUCCESS", timestamp: Date.now() },
                [`users/${data.phone}/transactions/CLM${Date.now()}`]: { id: `CLM${Date.now()}`, type: "TXN", title: "Gift Code Claim", amount: pData.amount, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: true, sign: "+", info: "Code: " + data.code }
            };
            await update(ref(db), updates);
            return res.json({ data: pData.amount });
        }

        return res.status(400).json({ error: "Unknown Action" });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
