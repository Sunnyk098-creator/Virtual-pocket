const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const axios = require('axios');

// 🔑 Aapki values
const BOT_TOKEN = "8674727998:AAFWVf3uuXDa12nUOWLAHgTaceljlexUGOw";
const API_KEY = "VP-lmVTRUekUVVWplhi1gZFTPw3";
const API_URL = "https://vp-secure-gateway.online/v1/api";
const DATABASE_URL = "https://jo-aapko-dalna-ho-dal-dena-default-rtdb.firebaseio.com";

// 🤖 Bot start
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// 🔥 Firebase connect
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL
});

const db = admin.database();

// START
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "👋 Welcome!\nWithdraw ke liye amount bhejo");
});

// BALANCE
bot.onText(/\/balance/, async (msg) => {
  let id = msg.chat.id;

  let snap = await db.ref("users/" + id).once("value");

  if (!snap.exists()) {
    return bot.sendMessage(id, "❌ Account nahi mila");
  }

  bot.sendMessage(id, "💰 Balance: ₹" + snap.val().balance);
});

// WITHDRAW SYSTEM
bot.on('message', async (msg) => {
  let id = msg.chat.id;
  let text = msg.text;

  if (text.startsWith("/")) return;

  let amount = Number(text);

  if (isNaN(amount)) {
    return bot.sendMessage(id, "❌ Sirf number bhejo");
  }

  if (amount < 10) {
    return bot.sendMessage(id, "❌ Minimum ₹10 withdraw");
  }

  try {
    let ref = db.ref("users/" + id);
    let snap = await ref.once("value");

    if (!snap.exists()) {
      return bot.sendMessage(id, "❌ User not found");
    }

    let user = snap.val();
    let balance = user.balance;

    if (balance < amount) {
      return bot.sendMessage(id, "❌ Balance kam hai");
    }

    bot.sendMessage(id, "⏳ Processing...");

    // 🔥 PAYMENT API CALL
    let res = await axios.post(API_URL, {
      api_key: API_KEY,
      amount: amount,
      user_id: id
    });

    console.log(res.data);

    if (res.data.status === "success") {

      await ref.update({
        balance: balance - amount
      });

      bot.sendMessage(id, "✅ Withdraw Successful 🎉");

    } else {
      bot.sendMessage(id, "❌ Payment Failed");
    }

  } catch (e) {
    console.log(e);
    bot.sendMessage(id, "⚠️ Server Error aaya");
  }
});