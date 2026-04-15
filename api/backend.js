import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, update, increment, remove } from "firebase/database";

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
                name: data.name, phone: data.phone, password: data.password, pin: data.pin,
                balance: 0, url: "https://virtual-pocketmrking77.vercel.app", securityKey: "2824519534",
                banned: false, joinedAt: new Date().toISOString()
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

        // --- PROFILE/PIN/API LOGIC ---
        if (action === 'UPDATE_PROFILE') { await update(ref(db, `users/${data.phone}`), { name: data.name }); return res.json({ data: "Success" }); }
        if (action === 'UPDATE_PIN') { await update(ref(db, `users/${data.phone}`), { pin: data.pin }); return res.json({ data: "Success" }); }
        if (action === 'GENERATE_API') {
            const newKey = 'VP-' + Math.random().toString(36).substr(2, 6).toUpperCase() + Date.now().toString(36).substr(4, 4).toUpperCase();
            await update(ref(db, `users/${data.phone}`), { apiKey: newKey, merchantApiKey: newKey });
            return res.json({ data: newKey });
        }

        // --- DEPOSIT/WITHDRAW LOGIC ---
        if (action === 'DEPOSIT') {
            const txnId = "DEP" + Date.now();
            const updates = {
                [`deposits/${txnId}`]: { id: txnId, userPhone: data.phone, userName: data.name, type: "DEP", amount: data.amount, utr: data.utr, status: "PENDING", timestamp: Date.now(), date: new Date().toLocaleString('en-IN') },
                [`users/${data.phone}/transactions/${txnId}`]: { id: txnId, type: "DEP", title: "Deposit Request", amount: data.amount, status: "PENDING", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: true, sign: "+", info: "UTR: " + data.utr }
            };
            await update(ref(db), updates); return res.json({ data: "Success" });
        }

        if (action === 'WITHDRAW') {
            if (data.amount < 30) throw new Error("Minimum withdrawal amount is ₹30!");
            const txnId = "WTH" + Date.now();
            const updates = {
                [`users/${data.phone}/balance`]: increment(-data.amount),
                [`withdrawals/${txnId}`]: { id: txnId, userPhone: data.phone, userName: data.name, type: "WITH", amount: data.amount, upi: data.upi, status: "PENDING", timestamp: Date.now(), date: new Date().toLocaleString('en-IN') },
                [`users/${data.phone}/transactions/${txnId}`]: { id: txnId, type: "WITH", title: "Withdrawal Request", amount: data.amount, status: "PENDING", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: false, sign: "-", info: "UPI: " + data.upi }
            };
            await update(ref(db), updates); return res.json({ data: "Success" });
        }

        // --- TRANSACTIONS LOGIC ---
        if (action === 'PAY') {
            const updates = {
                [`users/${data.sender}/balance`]: increment(-data.amount),
                [`users/${data.receiver}/balance`]: increment(data.amount),
                [`transactions/SND${Date.now()}`]: { userPhone: data.sender, receiver: data.receiver, amount: data.amount, type: 'SEND', status: 'SUCCESS', timestamp: Date.now() },
                [`transactions/RCV${Date.now()}`]: { userPhone: data.receiver, sender: data.sender, amount: data.amount, type: 'RECEIVE', status: 'SUCCESS', timestamp: Date.now() },
                [`users/${data.sender}/transactions/SND${Date.now()}`]: { id: `SND${Date.now()}`, type: "TXN", title: "Sent Money", amount: data.amount, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: false, sign: "-", info: "To: " + data.receiver },
                [`users/${data.receiver}/transactions/RCV${Date.now()}`]: { id: `RCV${Date.now()}`, type: "TXN", title: "Received Money", amount: data.amount, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: true, sign: "+", info: "From: " + data.sender }
            };
            await update(ref(db), updates); return res.json({ data: "Success" });
        }

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
            await update(ref(db), updates); return res.json({ data: "Success" });
        }

        // --- OLD GIFT CODE LOGIC (Kept for compatibility) ---
        if (action === 'CREATE_GIFT') {
            const total = data.amount * data.usersCount;
            const newCode = "VP-" + Math.random().toString(36).substring(2, 8).toUpperCase();
            const updates = {
                [`users/${data.phone}/balance`]: increment(-total),
                [`promoCodes/${newCode}`]: { amount: data.amount, maxUsers: data.usersCount, claimedBy: [], status: "active", createdBy: data.phone, timestamp: Date.now() },
                [`transactions/GEN${Date.now()}`]: { userPhone: data.phone, amount: total, type: "GIFT CREATE", status: "SUCCESS", timestamp: Date.now() },
                [`users/${data.phone}/transactions/GEN${Date.now()}`]: { id: `GEN${Date.now()}`, type: "TXN", title: "Gift Code Create", amount: total, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: false, sign: "-", info: "Code: " + newCode }
            };
            await update(ref(db), updates); return res.json({ data: newCode });
        }

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
            await update(ref(db), updates); return res.json({ data: pData.amount });
        }

        // =========================================================
        //                 NEW LIFAFA SYSTEM LOGIC
        // =========================================================

        if (action === 'CREATE_LIFAFA') {
            let totalDeduct = 0;
            if (data.type === 'STANDARD' || data.type === 'TOSS') totalDeduct = Number(data.amount) * Number(data.totalUsers);
            if (data.type === 'SCRATCH') totalDeduct = Number(data.maxAmount) * Number(data.totalUsers);

            if (totalDeduct <= 0 || isNaN(totalDeduct)) throw new Error("Invalid Amount Parameters!");

            const uRef = ref(db, `users/${data.phone}`);
            const snap = await get(uRef);
            if (!snap.exists() || snap.val().balance < totalDeduct) throw new Error(`Insufficient Balance! You need ₹${totalDeduct}`);

            // Generate 12 Char Alphanumeric ID
            const lifafaId = Math.random().toString(36).substring(2, 8).toUpperCase() + Math.random().toString(36).substring(2, 8).toUpperCase();

            const newLifafa = {
                id: lifafaId,
                creator: data.phone,
                type: data.type,
                amount: Number(data.amount) || 0,
                minAmount: Number(data.minAmount) || 0,
                maxAmount: Number(data.maxAmount) || 0,
                tossWin: data.tossWin || '',
                totalUsers: Number(data.totalUsers),
                claimedUsers: 0,
                telegram: data.telegram,
                code: data.code || '',
                timestamp: Date.now(),
                status: 'ACTIVE'
            };

            const updates = {
                [`users/${data.phone}/balance`]: increment(-totalDeduct),
                [`lifafas/${lifafaId}`]: newLifafa,
                [`transactions/LFC${Date.now()}`]: { userPhone: data.phone, amount: totalDeduct, type: "LIFAFA CREATE", status: "SUCCESS", timestamp: Date.now() },
                [`users/${data.phone}/transactions/LFC${Date.now()}`]: { id: `LFC${Date.now()}`, type: "TXN", title: "Lifafa Created", amount: totalDeduct, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: false, sign: "-", info: "ID: " + lifafaId }
            };
            await update(ref(db), updates);
            return res.json({ data: lifafaId });
        }

        if (action === 'MY_LIFAFAS') {
            const snap = await get(ref(db, `lifafas`));
            let myLifafas = [];
            if (snap.exists()) {
                snap.forEach(child => {
                    const l = child.val();
                    if(l.creator === data.phone) {
                        // 72 hours auto-expire visually
                        const isExpired = (Date.now() - l.timestamp > 72 * 60 * 60 * 1000);
                        myLifafas.push({ ...l, isExpired: isExpired || l.status !== 'ACTIVE' });
                    }
                });
            }
            return res.json({ data: myLifafas });
        }

        if (action === 'GET_LIFAFA_DETAILS') {
            const snap = await get(ref(db, `lifafas/${data.id}`));
            if (!snap.exists()) throw new Error("Lifafa not found or invalid link!");
            
            const l = snap.val();
            // 72 hour Auto-Delete Check
            if (Date.now() - l.timestamp > 72 * 60 * 60 * 1000) {
                await update(ref(db, `lifafas/${data.id}`), { status: 'EXPIRED' });
                throw new Error("This Lifafa has expired (72 hours passed)!");
            }
            if (l.status !== 'ACTIVE' || l.claimedUsers >= l.totalUsers) throw new Error("This Lifafa is already fully claimed or inactive!");

            // Send limited safe data to frontend
            return res.json({ 
                data: { 
                    id: l.id,
                    type: l.type, 
                    telegram: l.telegram, 
                    hasCode: !!l.code, 
                    amount: l.amount, 
                    minAmount: l.minAmount, 
                    maxAmount: l.maxAmount, 
                    tossWin: l.tossWin 
                } 
            });
        }

        if (action === 'CLAIM_LIFAFA') {
            // Very basic IP grab for tracking (Works better in standard Express setups)
            const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || "UNKNOWN_IP";
            const phone = data.phone;

            const snap = await get(ref(db, `lifafas/${data.id}`));
            if (!snap.exists()) throw new Error("Lifafa not found!");
            
            const l = snap.val();
            
            // Re-validate expiration
            if (Date.now() - l.timestamp > 72 * 60 * 60 * 1000) {
                await update(ref(db, `lifafas/${data.id}`), { status: 'EXPIRED' });
                throw new Error("This Lifafa has expired!");
            }
            if (l.status !== 'ACTIVE' || l.claimedUsers >= l.totalUsers) throw new Error("This Lifafa is already fully claimed!");
            if (l.code && l.code !== data.code) throw new Error("Incorrect Unique Code!");

            // Check IP and Phone uniqueness
            const claims = l.claimedData || {};
            for (let key in claims) {
                if (claims[key].phone === phone) throw new Error("Your wallet has already claimed this Lifafa!");
                if (claims[key].ip === ip && ip !== "UNKNOWN_IP") throw new Error("Your device/IP has already claimed this Lifafa!");
            }

            // Wallet registration check
            let uPhoneToCredit = phone;
            if(uPhoneToCredit.length === 10) uPhoneToCredit = "+91" + uPhoneToCredit;
            const uSnap = await get(ref(db, `users/${uPhoneToCredit}`));
            if (!uSnap.exists()) throw new Error("Wallet Account (Mobile) is not registered in Virtual Pocket!");

            // Determine Amount based on Game Type
            let wonAmount = 0;
            let success = true;

            if (l.type === 'STANDARD') {
                wonAmount = l.amount;
            } else if (l.type === 'SCRATCH') {
                // Generate random amount securely on backend
                wonAmount = Math.floor(Math.random() * (l.maxAmount - l.minAmount + 1)) + l.minAmount;
            } else if (l.type === 'TOSS') {
                // Determine Toss Result
                const randomToss = Math.random() < 0.5 ? 'HEAD' : 'TAIL';
                if (randomToss === l.tossWin) {
                    wonAmount = l.amount;
                } else {
                    success = false;
                    wonAmount = 0; // Lost
                }
            }

            const claimId = `LFM${Date.now()}`;
            const updates = {};
            
            // Register Claim
            updates[`lifafas/${data.id}/claimedUsers`] = increment(1);
            updates[`lifafas/${data.id}/claimedData/${claimId}`] = { phone: uPhoneToCredit, ip: ip, amount: wonAmount, timestamp: Date.now() };

            // Auto-Close if limit reached
            if (l.claimedUsers + 1 >= l.totalUsers) {
                updates[`lifafas/${data.id}/status`] = 'COMPLETED';
            }

            // Credit the amount if won
            if (success && wonAmount > 0) {
                updates[`users/${uPhoneToCredit}/balance`] = increment(wonAmount);
                updates[`transactions/${claimId}`] = { userPhone: uPhoneToCredit, amount: wonAmount, type: "LIFAFA CLAIM", status: "SUCCESS", timestamp: Date.now() };
                updates[`users/${uPhoneToCredit}/transactions/${claimId}`] = { id: claimId, type: "TXN", title: "Lifafa Claimed", amount: wonAmount, status: "SUCCESS", timestamp: Date.now(), date: new Date().toLocaleString('en-IN'), isCredit: true, sign: "+", info: "Lifafa ID: " + data.id };
            }

            await update(ref(db), updates);
            return res.json({ data: { success, amount: wonAmount, type: l.type } });
        }

        return res.status(400).json({ error: "Unknown Action" });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
