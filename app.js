import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, onSnapshot, query, orderBy, limit, runTransaction, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBHZwUmzG9SZLLr6D3HZyY63gEwkr1PVkw",
  authDomain: "virtual-coins-90dcc.firebaseapp.com",
  projectId: "virtual-coins-90dcc",
  storageBucket: "virtual-coins-90dcc.firebasestorage.app",
  messagingSenderId: "954901410669",
  appId: "1:954901410669:web:c958a4862a80a6ecf5e064",
  measurementId: "G-PV47P946DS"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let userData = null;

// Default store rates setup
const defaultItems = [
  { name: "android phone per min", cost: 7 },
  { name: "iphone per min", cost: 20 },
  { name: "mama phone per min", cost: 10 },
  { name: "livik 1 match", cost: 400 },
  { name: "mobile time", cost: 15 },
  { name: "tv time", cost: 25 },
  { name: "abeeha phone time", cost: 30 }
];

// --- AUTHENTICATION ---
document.getElementById("btn-signup").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const username = document.getElementById("auth-username").value.trim();

  if (!email || !password || !username) return alert("Fill all fields!");

  try {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    const isAdmin = email.toLowerCase() === "saboorezz@gmail.com";
    
    await setDoc(doc(db, "users", res.user.uid), {
      email, username, balance: 100, isAdmin
    });
    alert("Account created successfully!");
  } catch (err) { alert(err.message); }
});

document.getElementById("btn-login").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) { alert(err.message); }
});

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("auth-container").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");

    // Listen to current user balance live
    onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      userData = docSnap.data();
      document.getElementById("display-user").innerText = userData.username;
      document.getElementById("display-balance").innerText = userData.balance;

      if (userData.isAdmin) {
        document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
        loadAdminPanel();
      }
    });

    initDefaultStore();
    loadStore();
    listenChat();
  } else {
    document.getElementById("auth-container").classList.remove("hidden");
    document.getElementById("app-container").classList.add("hidden");
  }
});

// --- TAB SYSTEM NAVIGATION ---
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// --- COINFLIP GAME ---
window.playCoinflip = async (choice) => {
  const bet = parseInt(document.getElementById("coinflip-bet").value);
  if (isNaN(bet) || bet <= 0 || bet > userData.balance) return alert("Invalid bet!");

  const result = Math.random() < 0.5 ? "heads" : "tails";
  const won = result === choice;
  const newBalance = won ? userData.balance + bet : userData.balance - bet;

  await updateDoc(doc(db, "users", currentUser.uid), { balance: newBalance });
  document.getElementById("coinflip-result").innerText = won ? `🎉 You Won! Flipped ${result}.` : `❌ You Lost! Flipped ${result}.`;
};

// --- LIVE CHAT & /tip COMMAND ---
const chatInput = document.getElementById("chat-input");
document.getElementById("btn-send-chat").addEventListener("click", sendMessage);

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  if (text.toLowerCase() === "/tip") {
    chatInput.value = "";
    document.getElementById("tip-modal").classList.remove("hidden");
    return;
  }

  await addDoc(collection(db, "chat"), {
    sender: userData.username,
    text: text,
    timestamp: new Date()
  });
  chatInput.value = "";
}

function listenChat() {
  const q = query(collection(db, "chat"), orderBy("timestamp", "asc"), limit(50));
  onSnapshot(q, (snapshot) => {
    const chatBox = document.getElementById("chat-messages");
    chatBox.innerHTML = "";
    snapshot.forEach(doc => {
      const msg = doc.data();
      chatBox.innerHTML += `<div class="chat-msg"><strong>${msg.sender}:</strong> ${msg.text}</div>`;
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

// TIP MODAL ACTIONS
document.getElementById("btn-close-tip").onclick = () => document.getElementById("tip-modal").classList.add("hidden");
document.getElementById("btn-confirm-tip").onclick = async () => {
  const recipientName = document.getElementById("tip-recipient").value.trim();
  const amount = parseInt(document.getElementById("tip-amount").value);

  if (!recipientName || isNaN(amount) || amount <= 0) return alert("Invalid input!");
  if (amount > userData.balance) return alert("Not enough balance!");

  try {
    await runTransaction(db, async (transaction) => {
      const q = query(collection(db, "users"), where("username", "==", recipientName));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("User not found!");

      const targetDoc = snap.docs[0];
      const targetData = targetDoc.data();

      transaction.update(doc(db, "users", currentUser.uid), { balance: userData.balance - amount });
      transaction.update(doc(db, "users", targetDoc.id), { balance: targetData.balance + amount });
    });

    alert(`Successfully tipped ${amount} coins to ${recipientName}!`);
    document.getElementById("tip-modal").classList.add("hidden");
  } catch (err) { alert(err.message); }
};

// --- STORE & WITHDRAWALS ---
async function initDefaultStore() {
  for (let item of defaultItems) {
    const itemRef = doc(db, "store", item.name);
    const snap = await getDoc(itemRef);
    if (!snap.exists()) {
      await setDoc(itemRef, item);
    }
  }
}

function loadStore() {
  onSnapshot(collection(db, "store"), (snap) => {
    const container = document.getElementById("store-list");
    container.innerHTML = "";
    snap.forEach(d => {
      const item = d.data();
      const card = document.createElement("div");
      card.className = "store-card";
      card.style.display = "flex";
      card.style.flexDirection = "column";
      card.style.alignItems = "stretch";
      card.style.padding = "15px";
      card.style.border = "1px solid #374151";
      card.style.borderRadius = "8px";
      card.style.marginBottom = "10px";
      card.style.backgroundColor = "#1f2937";
      
      card.innerHTML = `
        <div style="margin-bottom: 8px;">
          <h4 style="margin:0; font-size:1.1em; color:#fff;">${item.name}</h4>
          <p style="margin: 2px 0; color: #9ca3af; font-size: 0.9em;">Rate: <strong style="color:#3b82f6;">${item.cost} Coins</strong> / unit</p>
        </div>
        
        <div style="display:flex; gap: 5px; margin-bottom: 8px;">
          <input type="number" class="coin-input" placeholder="e.g. 70" min="${item.cost}" style="flex:1; padding: 8px; border-radius:4px; border:1px solid #4b5563; background:#111827; color:#fff;">
          <button type="button" class="btn-quick-add" data-add="10" style="padding: 4px 8px; font-size: 0.8em; background: #374151; color: #fff; border: none; border-radius: 4px; cursor: pointer;">+10</button>
          <button type="button" class="btn-quick-add" data-add="50" style="padding: 4px 8px; font-size: 0.8em; background: #374151; color: #fff; border: none; border-radius: 4px; cursor: pointer;">+50</button>
        </div>

        <div class="calc-display-box" style="background: #111827; padding: 10px; border-radius: 6px; text-align: center; margin-bottom: 10px; border: 1px dashed #4b5563;">
          <span style="font-size:0.8em; color:#9ca3af;">Calculated Output:</span>
          <div class="calc-output" style="font-size: 1.05em; font-weight: bold; color: #10b981; margin-top: 3px;">Type coins above (e.g., 70)</div>
        </div>

        <button class="claim-btn" style="width: 100%; padding: 10px; background: #2563eb; color: #fff; font-weight: bold; border: none; border-radius: 6px; cursor: pointer;">Withdraw Time / Item</button>`;

      const input = card.querySelector(".coin-input");
      const output = card.querySelector(".calc-output");
      const claimBtn = card.querySelector(".claim-btn");

      // Function to recalculate and display output based on typed coin value
      const calculateTime = () => {
        const coinsSpent = parseInt(input.value);
        if (isNaN(coinsSpent) || coinsSpent <= 0) {
          output.innerText = "Type coins above (e.g., 70)";
          output.style.color = "#10b981";
          return;
        }

        if (coinsSpent < item.cost) {
          output.innerText = `Min required: ${item.cost} coins`;
          output.style.color = "#ef4444";
          return;
        }

        const quantity = (coinsSpent / item.cost).toFixed(1);
        const isPerMin = item.name.toLowerCase().includes("per min") || item.name.toLowerCase().includes("time");
        const unitLabel = isPerMin ? "min" : "units/matches";

        output.innerText = `You get: ${quantity} ${unitLabel}`;
        output.style.color = "#10b981";
      };

      // Listen for typing inside input field
      input.addEventListener("input", calculateTime);

      // Handle +10 and +50 quick increment buttons
      card.querySelectorAll(".btn-quick-add").forEach(btn => {
        btn.addEventListener("click", () => {
          const addVal = parseInt(btn.dataset.add);
          const currentVal = parseInt(input.value) || 0;
          input.value = currentVal + addVal;
          calculateTime();
        });
      });

      // Submit withdrawal request on button click
      claimBtn.onclick = () => {
        const coinsSpent = parseInt(input.value);
        if (isNaN(coinsSpent) || coinsSpent < item.cost) {
          return alert(`Please enter at least ${item.cost} coins to proceed!`);
        }
        requestWithdraw(item.name, item.cost, coinsSpent);
      };

      container.appendChild(card);
    });
  });
}

async function requestWithdraw(name, baseCost, totalCoinsSpent) {
  if (userData.balance < totalCoinsSpent) {
    return alert(`Not enough coins! You have ${userData.balance} coins, but tried to spend ${totalCoinsSpent}.`);
  }

  const quantity = (totalCoinsSpent / baseCost).toFixed(1);
  const isPerMin = name.toLowerCase().includes("per min") || name.toLowerCase().includes("time");
  const unitLabel = isPerMin ? "min" : "units/matches";
  const displayDetails = `${quantity} ${unitLabel} (${totalCoinsSpent} coins spent)`;

  try {
    await runTransaction(db, async (t) => {
      const userRef = doc(db, "users", currentUser.uid);
      const uDoc = await t.get(userRef);
      if (uDoc.data().balance < totalCoinsSpent) throw new Error("Not enough coins!");

      t.update(userRef, { balance: uDoc.data().balance - totalCoinsSpent });
      t.set(doc(collection(db, "withdrawals")), {
        userId: currentUser.uid,
        username: userData.username,
        itemName: name,
        cost: totalCoinsSpent,
        details: displayDetails,
        status: "pending",
        timestamp: new Date()
      });
    });

    alert(`Success! Withdrawal request submitted for ${displayDetails}. Sent to Admin for approval.`);
  } catch (err) {
    alert(err.message);
  }
}

// --- ADMIN PANEL FUNCTIONS ---
function loadAdminPanel() {
  // Add item / update rate
  document.getElementById("btn-add-item").onclick = async () => {
    const name = document.getElementById("new-item-name").value.trim();
    const cost = parseInt(document.getElementById("new-item-cost").value);
    if (!name || isNaN(cost)) return alert("Invalid inputs!");

    await setDoc(doc(db, "store", name), { name, cost });
    alert("Store item updated!");
  };

  // View users & quick tip
  onSnapshot(collection(db, "users"), (snap) => {
    const list = document.getElementById("admin-user-list");
    list.innerHTML = "";
    snap.forEach(d => {
      const u = d.data();
      list.innerHTML += `
        <div class="user-row">
          <span>${u.username} (${u.email}) - <strong>${u.balance} Coins</strong></span>
          <button onclick="openAdminTip('${u.username}')">Tip User</button>
        </div>`;
    });
  });

  // View pending withdrawals with calculation details
  onSnapshot(collection(db, "withdrawals"), (snap) => {
    const list = document.getElementById("admin-withdraw-list");
    list.innerHTML = "";
    snap.forEach(d => {
      const w = d.data();
      if (w.status === "pending") {
        const itemInfo = w.details ? w.details : `${w.itemName} (${w.cost}c)`;
        list.innerHTML += `
          <div class="req-row">
            <span><strong>${w.username}</strong> requested <strong>${itemInfo}</strong></span>
            <div>
              <button onclick="approveWithdraw('${d.id}')">Approve</button>
              <button class="btn-danger" onclick="rejectWithdraw('${d.id}', '${w.userId}', ${w.cost})">Reject & Refund</button>
            </div>
          </div>`;
      }
    });
  });
}

window.openAdminTip = (username) => {
  document.getElementById("tip-recipient").value = username;
  document.getElementById("tip-modal").classList.remove("hidden");
};

window.approveWithdraw = async (reqId) => {
  await updateDoc(doc(db, "withdrawals", reqId), { status: "approved" });
  alert("Request approved!");
};

window.rejectWithdraw = async (reqId, userId, refundCost) => {
  await runTransaction(db, async (t) => {
    const userDoc = await t.get(doc(db, "users", userId));
    t.update(doc(db, "users", userId), { balance: userDoc.data().balance + refundCost });
    t.update(doc(db, "withdrawals", reqId), { status: "rejected" });
  });
  alert("Request rejected & coins refunded!");
};
