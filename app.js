import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, addDoc, onSnapshot, query, orderBy, limit, runTransaction, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// --- AUTHENTICATION ---
document.getElementById("btn-signup")?.addEventListener("click", async () => {
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

document.getElementById("btn-login")?.addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) { alert(err.message); }
});

document.getElementById("btn-logout")?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    document.getElementById("auth-container").classList.add("hidden");
    document.getElementById("app-container").classList.remove("hidden");

    onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        userData = docSnap.data();
        document.getElementById("display-user").innerText = userData.username;
        document.getElementById("display-balance").innerText = userData.balance;

        if (userData.isAdmin || currentUser.email.toLowerCase() === "saboorezz@gmail.com") {
          document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
          loadAdminPanel();
        }
      }
    });

    // Removed initDefaultStore() so deleted items are NOT re-created on refresh
    loadStore();
    listenChat();
  } else {
    document.getElementById("auth-container").classList.remove("hidden");
    document.getElementById("app-container").classList.add("hidden");
  }
});

// --- TAB NAVIGATION ---
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

// --- GAME LOBBY ROUTING ---
window.openGame = (gameId) => {
  document.getElementById("games-lobby").classList.add("hidden");
  document.querySelectorAll(".game-stage").forEach(el => el.classList.add("hidden"));
  
  const stage = document.getElementById(`game-stage-${gameId}`);
  if (stage) stage.classList.remove("hidden");
};

window.closeGame = () => {
  document.querySelectorAll(".game-stage").forEach(el => el.classList.add("hidden"));
  document.getElementById("games-lobby").classList.remove("hidden");
};

// --- 3D ANIMATED COINFLIP ---
window.play3DCoinflip = async (choice) => {
  const betInput = document.getElementById("coinflip-bet");
  const bet = parseInt(betInput.value);
  const resultText = document.getElementById("coinflip-result");
  const coin = document.getElementById("coin");

  if (isNaN(bet) || bet <= 0 || bet > userData.balance) {
    return alert("Invalid bet amount!");
  }

  coin.style.transition = "none";
  coin.className = "coin";
  void coin.offsetWidth;
  coin.style.transition = "transform 3s cubic-bezier(0.15, 0.85, 0.35, 1.2)";

  const outcome = Math.random() < 0.5 ? "heads" : "tails";
  const won = outcome === choice;
  const newBalance = won ? userData.balance + bet : userData.balance - bet;

  coin.classList.add(outcome === "heads" ? "animate-heads" : "animate-tails");
  resultText.innerText = "Flipping...";
  resultText.className = "game-status-text text-blue";

  setTimeout(async () => {
    await updateDoc(doc(db, "users", currentUser.uid), { balance: newBalance });

    if (won) {
      resultText.innerText = `🎉 You Won! Flipped ${outcome.toUpperCase()}. (+${bet} coins)`;
      resultText.className = "game-status-text text-green";
    } else {
      resultText.innerText = `❌ You Lost! Flipped ${outcome.toUpperCase()}. (-${bet} coins)`;
      resultText.className = "game-status-text text-red";
    }
  }, 3000);
};

// --- DICE GAME ---
window.playDice = async () => {
  const bet = parseInt(document.getElementById("dice-bet").value);
  const target = document.getElementById("dice-target").value;
  const resultText = document.getElementById("dice-result");
  const display = document.getElementById("dice-display");

  if (isNaN(bet) || bet <= 0 || bet > userData.balance) {
    resultText.innerText = "Invalid bet amount or insufficient balance!";
    resultText.className = "game-status-text text-red";
    return;
  }

  const roll = Math.floor(Math.random() * 6) + 1;
  const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  display.innerText = diceEmojis[roll];

  let won = false;
  let multiplier = 0;

  if (target === "under3" && roll < 3) { won = true; multiplier = 2; }
  else if (target === "over3" && roll > 3) { won = true; multiplier = 2; }
  else if (target === "exact6" && roll === 6) { won = true; multiplier = 5; }

  if (won) {
    const profit = bet * (multiplier - 1);
    await updateDoc(doc(db, "users", currentUser.uid), { balance: userData.balance + profit });
    resultText.innerText = `Rolled ${roll}! You won ${profit} coins! 🎉`;
    resultText.className = "game-status-text text-green";
  } else {
    await updateDoc(doc(db, "users", currentUser.uid), { balance: userData.balance - bet });
    resultText.innerText = `Rolled ${roll}. You lost ${bet} coins.`;
    resultText.className = "game-status-text text-red";
  }
};

// --- BLACKJACK GAME ---
let bjDeck = [], playerHand = [], dealerHand = [], bjBetAmount = 0;

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣'], values = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  let deck = [];
  suits.forEach(s => values.forEach(v => deck.push({ value: v, suit: s })));
  return deck.sort(() => Math.random() - 0.5);
}

function calculateHand(hand) {
  let score = 0, aces = 0;
  hand.forEach(card => {
    if (['J','Q','K'].includes(card.value)) score += 10;
    else if (card.value === 'A') { score += 11; aces += 1; }
    else score += parseInt(card.value);
  });
  while (score > 21 && aces > 0) { score -= 10; aces -= 1; }
  return score;
}

function renderBJ(showDealer = false) {
  document.getElementById('bj-player-hand').innerText = playerHand.map(c => c.value + c.suit).join(' ');
  document.getElementById('bj-player-score').innerText = `(${calculateHand(playerHand)})`;

  if (showDealer) {
    document.getElementById('bj-dealer-hand').innerText = dealerHand.map(c => c.value + c.suit).join(' ');
    document.getElementById('bj-dealer-score').innerText = `(${calculateHand(dealerHand)})`;
  } else {
    document.getElementById('bj-dealer-hand').innerText = dealerHand[0].value + dealerHand[0].suit + ' 🂠';
    document.getElementById('bj-dealer-score').innerText = '';
  }
}

function endBJ(msg, colorClass) {
  const res = document.getElementById('bj-result');
  res.innerText = msg;
  res.className = `game-status-text ${colorClass}`;
  document.getElementById('bj-setup-btns').classList.remove('hidden');
  document.getElementById('bj-action-btns').classList.add('hidden');
}

window.startBlackjack = async () => {
  bjBetAmount = parseInt(document.getElementById('bj-bet').value);
  const resultText = document.getElementById('bj-result');

  if (isNaN(bjBetAmount) || bjBetAmount <= 0 || bjBetAmount > userData.balance) {
    resultText.innerText = "Invalid bet amount or insufficient balance!";
    resultText.className = "game-status-text text-red";
    return;
  }

  bjDeck = createDeck();
  playerHand = [bjDeck.pop(), bjDeck.pop()];
  dealerHand = [bjDeck.pop(), bjDeck.pop()];

  document.getElementById('bj-setup-btns').classList.add('hidden');
  document.getElementById('bj-action-btns').classList.remove('hidden');
  resultText.innerText = "";

  renderBJ();

  if (calculateHand(playerHand) === 21) {
    const payout = Math.floor(bjBetAmount * 1.5);
    await updateDoc(doc(db, "users", currentUser.uid), { balance: userData.balance + payout });
    endBJ(`Blackjack! You won ${payout} coins! 🎉`, 'text-green');
  }
};

window.hitBlackjack = async () => {
  playerHand.push(bjDeck.pop());
  renderBJ();
  
  if (calculateHand(playerHand) > 21) {
    await updateDoc(doc(db, "users", currentUser.uid), { balance: userData.balance - bjBetAmount });
    endBJ(`Bust! You lost ${bjBetAmount} coins.`, 'text-red');
  }
};

window.standBlackjack = async () => {
  while (calculateHand(dealerHand) < 17) {
    dealerHand.push(bjDeck.pop());
  }
  renderBJ(true);

  const pScore = calculateHand(playerHand), dScore = calculateHand(dealerHand);
  
  if (dScore > 21 || pScore > dScore) {
    await updateDoc(doc(db, "users", currentUser.uid), { balance: userData.balance + bjBetAmount });
    endBJ(`You win ${bjBetAmount} coins! 🎉`, 'text-green');
  } else if (pScore === dScore) {
    endBJ(`Push! Your bet was returned.`, 'text-blue');
  } else {
    await updateDoc(doc(db, "users", currentUser.uid), { balance: userData.balance - bjBetAmount });
    endBJ(`Dealer wins. You lost ${bjBetAmount} coins.`, 'text-red');
  }
};

// --- CHAT & TIPPING ---
const chatInput = document.getElementById("chat-input");
document.getElementById("btn-send-chat")?.addEventListener("click", sendMessage);

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
    if (!chatBox) return;
    chatBox.innerHTML = "";
    snapshot.forEach(doc => {
      const msg = doc.data();
      chatBox.innerHTML += `<div class="chat-msg"><strong>${msg.sender}:</strong> ${msg.text}</div>`;
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

document.getElementById("btn-close-tip")?.addEventListener("click", () => {
  document.getElementById("tip-modal").classList.add("hidden");
});

document.getElementById("btn-confirm-tip")?.addEventListener("click", async () => {
  const recipientName = document.getElementById("tip-recipient").value.trim();
  const amount = parseInt(document.getElementById("tip-amount").value);

  if (!recipientName || isNaN(amount) || amount <= 0) return alert("Invalid input!");

  const isAdmin = userData.isAdmin || currentUser.email.toLowerCase() === "saboorezz@gmail.com";

  if (!isAdmin && amount > userData.balance) {
    return alert("Not enough balance!");
  }

  try {
    await runTransaction(db, async (transaction) => {
      const q = query(collection(db, "users"), where("username", "==", recipientName));
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("User not found!");

      const targetDoc = snap.docs[0];
      const targetData = targetDoc.data();

      if (!isAdmin) {
        transaction.update(doc(db, "users", currentUser.uid), { balance: userData.balance - amount });
      }

      transaction.update(doc(db, "users", targetDoc.id), { balance: targetData.balance + amount });
    });

    alert(`Successfully tipped ${amount} coins to ${recipientName}!`);
    document.getElementById("tip-modal").classList.add("hidden");
  } catch (err) { alert(err.message); }
});

// --- STORE MANAGEMENT ---
function loadStore() {
  onSnapshot(collection(db, "store"), (snap) => {
    const container = document.getElementById("store-list");
    if (!container) return;
    container.innerHTML = "";
    
    const isAdmin = userData && (userData.isAdmin || currentUser?.email.toLowerCase() === "saboorezz@gmail.com");

    snap.forEach(d => {
      const item = d.data();
      const card = document.createElement("div");
      card.className = "game-card store-card";
      card.style.position = "relative";
      
      const adminActionsHTML = isAdmin ? `
        <div style="position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 5;">
          <button onclick="editStoreItemModal('${d.id}', '${item.name.replace(/'/g, "\\'")}', ${item.cost})" 
                  style="background: none; border: none; cursor: pointer; font-size: 16px;" title="Edit Item">✏️</button>
          <button onclick="deleteStoreItem('${d.id}')" 
                  style="background: none; border: none; cursor: pointer; font-size: 16px; color: red;" title="Remove Item">✖</button>
        </div>
      ` : '';

      card.innerHTML = `
        ${adminActionsHTML}
        <div class="card-header">
          <h4 class="item-title" style="margin-right: 50px;">${item.name}</h4>
          <p class="item-rate">Rate: <strong class="text-blue">${item.cost} Coins</strong> / unit</p>
        </div>
        
        <div class="input-group">
          <input type="number" class="coin-input" placeholder="e.g. 70" min="${item.cost}">
          <button type="button" class="btn-quick-add" data-add="10">+10</button>
          <button type="button" class="btn-quick-add" data-add="50">+50</button>
        </div>

        <div class="calc-display-box hidden">
          <span class="calc-label">Calculated Output:</span>
          <div class="calc-output"></div>
        </div>

        <button class="claim-btn">Withdraw Time / Item</button>`;

      const input = card.querySelector(".coin-input");
      const box = card.querySelector(".calc-display-box");
      const output = card.querySelector(".calc-output");
      const claimBtn = card.querySelector(".claim-btn");

      const calculateTime = () => {
        const coinsSpent = parseInt(input.value);

        if (isNaN(coinsSpent) || coinsSpent <= 0) {
          box.classList.add("hidden");
          return;
        }

        box.classList.remove("hidden");

        if (coinsSpent < item.cost) {
          output.innerText = `Min required: ${item.cost} coins`;
          output.className = "calc-output text-red";
          return;
        }

        const quantity = (coinsSpent / item.cost).toFixed(1);
        const isPerMin = item.name.toLowerCase().includes("per min") || item.name.toLowerCase().includes("time");
        const unitLabel = isPerMin ? "min" : "units/matches";

        output.innerText = `You get: ${quantity} ${unitLabel}`;
        output.className = "calc-output text-green";
      };

      input.addEventListener("input", calculateTime);

      card.querySelectorAll(".btn-quick-add").forEach(btn => {
        btn.addEventListener("click", () => {
          const addVal = parseInt(btn.dataset.add);
          const currentVal = parseInt(input.value) || 0;
          input.value = currentVal + addVal;
          calculateTime();
        });
      });

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

// --- ITEM MODAL HANDLERS ---
const itemModal = document.getElementById("item-modal");

document.getElementById("btn-open-add-item")?.addEventListener("click", () => {
  document.getElementById("item-modal-title").textContent = "Add Store Item";
  document.getElementById("item-modal-id").value = "";
  document.getElementById("item-modal-name").value = "";
  document.getElementById("item-modal-cost").value = "";
  itemModal.classList.remove("hidden");
});

document.getElementById("btn-close-item-modal")?.addEventListener("click", () => {
  itemModal.classList.add("hidden");
});

window.editStoreItemModal = (id, name, cost) => {
  document.getElementById("item-modal-title").textContent = "Edit Store Item";
  document.getElementById("item-modal-id").value = id;
  document.getElementById("item-modal-name").value = name;
  document.getElementById("item-modal-cost").value = cost;
  itemModal.classList.remove("hidden");
};

document.getElementById("btn-save-item")?.addEventListener("click", async () => {
  const oldId = document.getElementById("item-modal-id").value;
  const name = document.getElementById("item-modal-name").value.trim();
  const cost = parseInt(document.getElementById("item-modal-cost").value);

  if (!name || isNaN(cost) || cost <= 0) {
    return alert("Please enter a valid item name and cost!");
  }

  try {
    if (oldId && oldId !== name) {
      await deleteDoc(doc(db, "store", oldId));
    }
    await setDoc(doc(db, "store", name), { name, cost });
    itemModal.classList.add("hidden");
  } catch (err) {
    alert(err.message);
  }
});

window.deleteStoreItem = async (itemId) => {
  if (confirm(`Are you sure you want to delete "${itemId}"?`)) {
    try {
      await deleteDoc(doc(db, "store", itemId));
    } catch (err) {
      alert(err.message);
    }
  }
};

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
  onSnapshot(collection(db, "users"), (snap) => {
    const list = document.getElementById("admin-user-list");
    if (!list) return;
    list.innerHTML = "";
    snap.forEach(d => {
      const u = d.data();
      list.innerHTML += `
        <div class="user-row" style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span>${u.username} (${u.email}) - <strong>${u.balance} Coins</strong></span>
          <button onclick="openAdminTip('${u.username}')">Tip User</button>
        </div>`;
    });
  });

  onSnapshot(collection(db, "withdrawals"), (snap) => {
    const list = document.getElementById("admin-withdraw-list");
    if (!list) return;
    list.innerHTML = "";
    snap.forEach(d => {
      const w = d.data();
      if (w.status === "pending") {
        const itemInfo = w.details ? w.details : `${w.itemName} (${w.cost}c)`;
        list.innerHTML += `
          <div class="req-row" style="display:flex; justify-content:space-between; margin-bottom:8px;">
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
