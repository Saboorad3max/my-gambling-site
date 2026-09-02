import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, addDoc, onSnapshot, query, orderBy, limit, runTransaction, where, getDocs, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let housePoolData = { poolBalance: 10000, maxLossLimit: 5000 };
let isGameProcessing = false;
let isClaimProcessing = false;

// --- TIP TOAST NOTIFICATIONS ---
function showTipNotification(message) {
  const toast = document.getElementById("tip-notification-toast");
  if (!toast) return;

  toast.innerText = message;
  toast.classList.remove("hidden");
  toast.style.opacity = "1";

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 300);
  }, 2000);
}

let initialTipLoad = true;
function listenForTipNotifications() {
  const q = query(collection(db, "tip_notifications"), orderBy("timestamp", "desc"), limit(1));
  
  onSnapshot(q, (snapshot) => {
    if (initialTipLoad) {
      initialTipLoad = false;
      return;
    }

    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const data = change.doc.data();
        showTipNotification(data.message);
      }
    });
  });
}

// Helper function to calculate target win probability based on house pool status (50% win chance for coinflip/blackjack)[cite: 4]
function getWinChance(bet) {
  if (housePoolData.poolBalance <= 0) {
    return 0; 
  }
  return 0.50;                     
}

// --- DAILY WAGER LEADERBOARD LOGIC ---
function startLeaderboardTimer() {
  const timerEl = document.getElementById('leaderboard-timer');
  if (!timerEl) return;

  const updateTimer = async () => {
    const now = new Date();
    const night = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    let diff = night - now;

    if (diff <= 0) {
      diff = 24 * 60 * 60 * 1000; 
    }

    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    timerEl.innerText = `Reset in: ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  };

  updateTimer();
  setInterval(updateTimer, 1000);
}

function listenForLeaderboard() {
  const q = query(collection(db, "users"), orderBy("wagered", "desc"), limit(10));
  
  onSnapshot(q, (snapshot) => {
    const container = document.getElementById("leaderboard-list");
    if (!container) return;
    
    container.innerHTML = "";
    
    if (snapshot.empty) {
      container.innerHTML = `<div style="color: #9ca3af; text-align: center; padding: 12px;">No wagers recorded yet.</div>`;
      return;
    }

    let rank = 1;
    snapshot.forEach((docSnap) => {
      const uData = docSnap.data();
      const wagerVal = uData.wagered || 0;

      const row = document.createElement("div");
      row.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: #111827; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px;";
      
      row.innerHTML = `
        <span style="color: #fff;"><strong>#${rank}</strong> ${uData.username || "Anonymous"}</span>
        <span style="color: #3b82f6; font-weight: bold;">${wagerVal} Wagered</span>
      `;
      container.appendChild(row);
      rank++;
    });
  });
}

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
      email, username, balance: 0, wagered: 0, isAdmin
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

        // Render rakeback panel dynamically on data sync
        renderRewardsPanel();

        if (userData.isAdmin || currentUser.email.toLowerCase() === "saboorezz@gmail.com") {
          document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
          loadAdminPanel();
        }
      }
    });

    onSnapshot(doc(db, "settings", "housePool"), (docSnap) => {
      if (docSnap.exists()) {
        housePoolData = docSnap.data();
        const poolEl = document.getElementById("display-house-pool");
        const lossEl = document.getElementById("display-max-loss");
        const inputPool = document.getElementById("input-house-pool");
        const inputLoss = document.getElementById("input-max-loss");

        if (poolEl) poolEl.innerText = `${housePoolData.poolBalance} Coins`;
        if (lossEl) lossEl.innerText = `${housePoolData.maxLossLimit} Coins`;
        if (inputPool && document.activeElement !== inputPool) inputPool.value = housePoolData.poolBalance;
        if (inputLoss && document.activeElement !== inputLoss) inputLoss.value = housePoolData.maxLossLimit;
      } else {
        setDoc(doc(db, "settings", "housePool"), { poolBalance: 10000, maxLossLimit: 5000 });
      }
    });

    loadStore();
    listenChat();
    listenForTipNotifications();
    startLeaderboardTimer();
    listenForLeaderboard();
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
  if (isGameProcessing) return;
  const betInput = document.getElementById("coinflip-bet");
  const bet = parseInt(betInput.value);
  const resultText = document.getElementById("coinflip-result");
  const coin = document.getElementById("coin");

  if (isNaN(bet) || bet < 1 || bet > userData.balance) {
    return alert("Invalid bet amount or insufficient balance!");
  }

  isGameProcessing = true;

  coin.style.transition = "none";
  coin.className = "coin";
  void coin.offsetWidth;
  coin.style.transition = "transform 3s cubic-bezier(0.15, 0.85, 0.35, 1.2)";

  const winChance = getWinChance(bet);
  const won = Math.random() < winChance;
  
  let outcome = won ? choice : (choice === "heads" ? "tails" : "heads");
  const netChange = won ? bet : -bet;
  const lossIncrement = !won ? bet : 0;

  coin.classList.add(outcome === "heads" ? "animate-heads" : "animate-tails");
  resultText.innerText = "Flipping...";
  resultText.className = "game-status-text text-blue";

  setTimeout(async () => {
    try {
      const userRef = doc(db, "users", currentUser.uid);
      const poolRef = doc(db, "settings", "housePool");

      await updateDoc(userRef, {
        balance: increment(netChange),
        wagered: increment(bet),
        totalLosses: increment(lossIncrement)
      });

      await updateDoc(poolRef, {
        poolBalance: increment(-netChange)
      });

      if (won) {
        resultText.innerText = `🎉 You Won! Flipped ${outcome.toUpperCase()}. (+${bet} coins)`;
        resultText.className = "game-status-text text-green";
      } else {
        resultText.innerText = `❌ You Lost! Flipped ${outcome.toUpperCase()}. (-${bet} coins)`;
        resultText.className = "game-status-text text-red";
      }
    } catch (err) {
      resultText.innerText = `⚠️ ${err.message}`;
      resultText.className = "game-status-text text-red";
    } finally {
      isGameProcessing = false;
    }
  }, 3000);
};

// --- DICE GAME (33% Win Chance) ---
window.playDice = async () => {
  if (isGameProcessing) return;[cite: 4]

  const bet = parseInt(document.getElementById("dice-bet").value);
  const target = document.getElementById("dice-target").value;
  const resultText = document.getElementById("dice-result");
  const display = document.getElementById("dice-display");

  if (isNaN(bet) || bet < 1 || bet > userData.balance) {
    resultText.innerText = "Invalid bet amount or insufficient balance!";
    resultText.className = "game-status-text text-red";
    return;
  }

  isGameProcessing = true;

  // Set win chance to 33% if house pool has balance, else 0%
  const winChance = housePoolData.poolBalance > 0 ? 0.33 : 0;
  const won = Math.random() < winChance;

  const rangeMap = {
    "1-2": { valid: [1, 2], invalid: [3, 4, 5, 6] },
    "3-4": { valid: [3, 4], invalid: [1, 2, 5, 6] },
    "5-6": { valid: [5, 6], invalid: [1, 2, 3, 4] }
  };

  const selectedRange = rangeMap[target] || rangeMap["1-2"];
  
  let roll;
  if (won) {
    roll = selectedRange.valid[Math.floor(Math.random() * selectedRange.valid.length)];
  } else {
    roll = selectedRange.invalid[Math.floor(Math.random() * selectedRange.invalid.length)];
  }

  const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  display.innerText = diceEmojis[roll];

  const multiplier = 3;
  const totalPayout = Math.floor(bet * multiplier);
  const netProfit = totalPayout - bet;
  
  const netChange = won ? netProfit : -bet;
  const lossIncrement = !won ? bet : 0;

  try {
    const userRef = doc(db, "users", currentUser.uid);
    const poolRef = doc(db, "settings", "housePool");

    await updateDoc(userRef, {
      balance: increment(netChange),
      wagered: increment(bet),
      totalLosses: increment(lossIncrement)
    });

    const poolChange = won ? -netProfit : bet;
    await updateDoc(poolRef, {
      poolBalance: increment(poolChange)
    });

    if (won) {
      resultText.innerText = `Rolled ${roll}! You won ${totalPayout} coins! 🎉 (3x Payout)`;
      resultText.className = "game-status-text text-green";
    } else {
      resultText.innerText = `Rolled ${roll}. You lost ${bet} coins.`;
      resultText.className = "game-status-text text-red";
    }
  } catch (err) {
    resultText.innerText = `Error: ${err.message}`;
    resultText.className = "game-status-text text-red";
  } finally {
    isGameProcessing = false;
  }
};
// --- BLACKJACK GAME ---
let bjDeck = [], playerHand = [], dealerHand = [], bjBetAmount = 0, bjIsForcedLoss = false;

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
  isGameProcessing = false;
}

window.startBlackjack = async () => {
  if (isGameProcessing) return[cite: 4];

  bjBetAmount = parseInt(document.getElementById('bj-bet').value);
  const resultText = document.getElementById('bj-result');

  if (isNaN(bjBetAmount) || bjBetAmount < 1 || bjBetAmount > userData.balance) {
    resultText.innerText = "Invalid bet amount or insufficient balance!";
    resultText.className = "game-status-text text-red";
    return;
  }

  isGameProcessing = true;
  const winChance = getWinChance(bjBetAmount);
  bjIsForcedLoss = Math.random() >= winChance;

  await updateDoc(doc(db, "users", currentUser.uid), {
    wagered: increment(bjBetAmount)
  });

  bjDeck = createDeck();
  
  if (bjIsForcedLoss) {
    playerHand = [{ value: '10', suit: '♠' }, { value: '5', suit: '♥' }];
    dealerHand = [{ value: '10', suit: '♦' }, { value: '10', suit: '♣' }];
  } else {
    playerHand = [bjDeck.pop(), bjDeck.pop()];
    dealerHand = [bjDeck.pop(), bjDeck.pop()];
  }

  document.getElementById('bj-setup-btns').classList.add('hidden');
  document.getElementById('bj-action-btns').classList.remove('hidden');
  resultText.innerText = "";

  renderBJ();

  if (calculateHand(playerHand) === 21 && !bjIsForcedLoss) {
    const payout = Math.floor(bjBetAmount * 1.5);
    await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(payout) });
    await updateDoc(doc(db, "settings", "housePool"), { poolBalance: increment(-payout) });
    endBJ(`Blackjack! You won ${payout} coins! 🎉`, 'text-green');
  }
};

window.hitBlackjack = async () => {
  if (bjIsForcedLoss) {
    playerHand.push({ value: '10', suit: '♠' });
  } else {
    playerHand.push(bjDeck.pop());
  }
  
  renderBJ();
  
  if (calculateHand(playerHand) > 21) {
    await updateDoc(doc(db, "users", currentUser.uid), { 
      balance: increment(-bjBetAmount),
      totalLosses: increment(bjBetAmount)
    });
    await updateDoc(doc(db, "settings", "housePool"), { poolBalance: increment(bjBetAmount) });
    endBJ(`Bust! You lost ${bjBetAmount} coins.`, 'text-red');
  }
};

window.standBlackjack = async () => {
  if (bjIsForcedLoss) {
    dealerHand = [{ value: '10', suit: '♦' }, { value: '10', suit: '♣' }];
  } else {
    while (calculateHand(dealerHand) < 17) {
      dealerHand.push(bjDeck.pop());
    }
  }
  
  renderBJ(true);

  const pScore = calculateHand(playerHand), dScore = calculateHand(dealerHand);
  
  if (!bjIsForcedLoss && (dScore > 21 || pScore > dScore)) {
    await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(bjBetAmount) });
    await updateDoc(doc(db, "settings", "housePool"), { poolBalance: increment(-bjBetAmount) });
    endBJ(`You win ${bjBetAmount} coins! 🎉`, 'text-green');
  } else if (!bjIsForcedLoss && pScore === dScore) {
    endBJ(`Push! Your bet was returned.`, 'text-blue');
  } else {
    await updateDoc(doc(db, "users", currentUser.uid), { 
      balance: increment(-bjBetAmount),
      totalLosses: increment(bjBetAmount)
    });
    await updateDoc(doc(db, "settings", "housePool"), { poolBalance: increment(bjBetAmount) });
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
    timestamp: serverTimestamp()
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

  if (!recipientName || isNaN(amount) || amount <= 0) return alert("Invalid tip details");

  const isAdmin = userData.isAdmin || currentUser.email.toLowerCase() === "saboorezz@gmail.com";

  if (!isAdmin && amount > userData.balance) {
    return alert("Insufficient balance!");
  }

  try {
    const q = query(collection(db, "users"), where("username", "==", recipientName));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error("Recipient does not exist");

    const targetDoc = snap.docs[0];

    if (!isAdmin) {
      await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(-amount) });
    }
    await updateDoc(doc(db, "users", targetDoc.id), { balance: increment(amount) });

    const tipMsg = isAdmin 
      ? `Admin tipped ${amount} coins to ${recipientName}` 
      : `${userData.username} tipped ${amount} coins to ${recipientName}`;

    await addDoc(collection(db, "tip_notifications"), {
      message: tipMsg,
      timestamp: serverTimestamp()
    });

    showTipNotification(isAdmin ? `Successfully added ${amount} coins to ${recipientName}` : `You tipped ${amount} coins to ${recipientName}`);

    document.getElementById("tip-modal")?.classList.add("hidden");
    document.getElementById("tip-recipient").value = "";
    document.getElementById("tip-amount").value = "";
  } catch (err) {
    alert(err.message);
  }
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
    await updateDoc(doc(db, "users", currentUser.uid), { balance: increment(-totalCoinsSpent) });
    
    await addDoc(collection(db, "withdrawals"), {
      userId: currentUser.uid,
      username: userData.username,
      itemName: name,
      cost: totalCoinsSpent,
      details: displayDetails,
      status: "pending",
      timestamp: serverTimestamp()
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
      const uid = d.id;
      list.innerHTML += `
        <div class="user-row" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; background:#111827; padding:8px 12px; border-radius:6px;">
          <span style="cursor:pointer;" onclick="viewUserStats('${uid}', '${u.username.replace(/'/g, "\\'")}', '${u.email}', ${u.balance}, ${u.wagered || 0})">
            <strong style="color:#3b82f6; text-decoration:underline;">${u.username}</strong> (${u.email}) - <strong>${u.balance} Coins</strong>
          </span>
          <div style="display:flex; gap:6px;">
            <button onclick="openAdminTip('${u.username.replace(/'/g, "\\'")}')" style="background:#2563eb; color:#fff; border:none; padding:4px 10px; border-radius:4px; cursor:pointer;">Tip</button>
            <button onclick="deductUserBalance('${uid}', '${u.username.replace(/'/g, "\\'")}', ${u.balance})" style="background:#dc2626; color:#fff; border:none; padding:4px 10px; border-radius:4px; cursor:pointer;">Deduct</button>
          </div>
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

document.getElementById("btn-save-pool")?.addEventListener("click", async () => {
  const poolBalance = parseFloat(document.getElementById("input-house-pool").value);
  const maxLossLimit = parseFloat(document.getElementById("input-max-loss").value);

  if (isNaN(poolBalance) || isNaN(maxLossLimit)) {
    return alert("Please enter valid numeric values for both fields.");
  }

  try {
    await setDoc(doc(db, "settings", "housePool"), { poolBalance, maxLossLimit }, { merge: true });
    alert("House Reserve Pool settings updated successfully!");
  } catch (err) {
    alert(`Error updating settings: ${err.message}`);
  }
});

window.viewUserStats = (uid, username, email, balance, wagered) => {
  document.getElementById("stats-username").innerText = `${username}'s Profile`;
  document.getElementById("stats-email").innerText = email;
  document.getElementById("stats-balance").innerText = balance;
  document.getElementById("stats-wagered").innerText = wagered;
  document.getElementById("user-stats-modal").classList.remove("hidden");
};

document.getElementById("btn-close-stats")?.addEventListener("click", () => {
  document.getElementById("user-stats-modal").classList.add("hidden");
});

window.openAdminTip = (username) => {
  document.getElementById("tip-recipient").value = username;
  document.getElementById("tip-modal").classList.remove("hidden");
};

window.deductUserBalance = async (uid, username, currentBalance) => {
  const amountStr = prompt(`Enter number of coins to deduct from ${username}:`);
  if (!amountStr) return;

  const amount = parseInt(amountStr);
  if (isNaN(amount) || amount <= 0) {
    return alert("Please enter a valid positive number.");
  }

  if (amount > currentBalance) {
    return alert(`Cannot deduct ${amount} coins. User only has ${currentBalance} coins.`);
  }

  try {
    await updateDoc(doc(db, "users", uid), {
      balance: increment(-amount)
    });
    alert(`Deducted ${amount} coins from ${username}.`);
  } catch (err) {
    alert(err.message);
  }
};

window.approveWithdraw = async (reqId) => {
  await updateDoc(doc(db, "withdrawals", reqId), { status: "approved" });
  alert("Request approved!");
};

window.rejectWithdraw = async (reqId, userId, refundCost) => {
  try {
    await updateDoc(doc(db, "users", userId), { balance: increment(refundCost) });
    await updateDoc(doc(db, "withdrawals", reqId), { status: "rejected" });
    alert("Request rejected & coins refunded!");
  } catch (err) {
    alert(err.message);
  }
};

// --- RAKEBACK SYSTEM LOGIC ---
function renderRewardsPanel() {
  if (!userData) return;

  const userRakeback = userData.rakeback || { checkpointWager: 0, checkpointLoss: 0 };
  
  const currentWagered = userData.wagered || 0;
  const currentLosses = userData.totalLosses || 0;
  
  const eligibleWager = currentWagered - (userRakeback.checkpointWager || 0);
  const eligibleLoss = currentLosses - (userRakeback.checkpointLoss || 0);

  let calculatedReward = (eligibleWager * 0.005);
  if (eligibleLoss > 0) {
    calculatedReward += (eligibleLoss * 0.03);
  }
  calculatedReward = Math.floor(calculatedReward);

  const isUnlocked = eligibleWager >= 150 && calculatedReward > 0;

  const statusLabel = document.getElementById("instant-status-label");
  const amountDisplay = document.getElementById("instant-amount-display");
  const claimBtn = document.getElementById("btn-claim-instant");

  if (statusLabel) statusLabel.innerText = isUnlocked ? 'Ready to Claim' : 'Wager to Unlock';
  
  if (amountDisplay) {
    if (calculatedReward > 0) {
      amountDisplay.style.display = "block";
      amountDisplay.innerText = `${calculatedReward} Coins`;
    } else {
      amountDisplay.style.display = "none";
    }
  }

  if (claimBtn) {
    if (isClaimProcessing) {
      claimBtn.style.background = "#374151";
      claimBtn.style.color = "#9ca3af";
      claimBtn.style.cursor = "not-allowed";
      claimBtn.disabled = true;
    } else if (isUnlocked) {
      claimBtn.style.background = "#10b981";
      claimBtn.style.color = "#fff";
      claimBtn.style.cursor = "pointer";
      claimBtn.disabled = false;
    } else {
      claimBtn.style.background = "#374151";
      claimBtn.style.color = "#9ca3af";
      claimBtn.style.cursor = "not-allowed";
      claimBtn.disabled = true;
    }

    claimBtn.onclick = () => claimInstantRakeback();
  }

  const dailyBtn = document.getElementById("btn-claim-daily");
  const dailyStatusLabel = document.getElementById("daily-status-label");

  if (dailyStatusLabel) {
    dailyStatusLabel.innerText = "Claim Soon!";
  }

  if (dailyBtn) {
    dailyBtn.style.background = "#374151";
    dailyBtn.style.color = "#9ca3af";
    dailyBtn.style.cursor = "not-allowed";
    dailyBtn.disabled = true;
    dailyBtn.innerText = "Coming Soon";
  }
}

window.claimInstantRakeback = async () => {
  if (!currentUser || isClaimProcessing) return;

  isClaimProcessing = true;
  const claimBtn = document.getElementById("btn-claim-instant");
  if (claimBtn) {
    claimBtn.disabled = true;
    claimBtn.style.cursor = "not-allowed";
    claimBtn.style.background = "#374151";
  }

  const userRef = doc(db, "users", currentUser.uid);

  try {
    let claimedAmount = 0;

    await runTransaction(db, async (t) => {
      const uDoc = await t.get(userRef);
      if (!uDoc.exists()) throw new Error("User data not found!");

      const data = uDoc.data();
      const currentWager = data.wagered || 0;
      const currentLoss = data.totalLosses || 0;
      
      const rb = data.rakeback || { checkpointWager: 0, checkpointLoss: 0 };
      const eligibleWager = currentWager - (rb.checkpointWager || 0);
      const eligibleLoss = currentLoss - (rb.checkpointLoss || 0);

      let reward = (eligibleWager * 0.005);
      if (eligibleLoss > 0) {
        reward += (eligibleLoss * 0.03);
      }
      reward = Math.floor(reward);

      if (eligibleWager < 150 || reward <= 0) {
        throw new Error("No reward available to claim!");
      }

      claimedAmount = reward;
      const updatedRakeback = {
        checkpointWager: currentWager,
        checkpointLoss: currentLoss
      };

      t.update(userRef, {
        balance: increment(claimedAmount),
        rakeback: updatedRakeback
      });
    });

    alert(`Successfully claimed ${claimedAmount} coins instant rakeback!`);
  } catch (err) {
    alert(err.message);
  } finally {
    isClaimProcessing = false;
    renderRewardsPanel();
  }
};
