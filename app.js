import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, collection, addDoc, onSnapshot, query, orderBy, limit, runTransaction, where, getDocs, increment } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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

// Helper function to calculate target win probability based on bet amount
function getWinChance(bet) {
  if (bet < 10) return 0.40;        // Less than 10c -> 40%
  if (bet > 20) return 0.25;        // More than 20c -> 25%
  return 0.30;                      // Between 10c and 20c (inclusive) -> 30%
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
      email, username, balance: 0, wagered: 0, isAdmin, claimedMilestones: []
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

        // Refresh milestones when user data updates
        loadMilestones();
      }
    });

    loadStore();
    listenChat();
    loadMilestones();
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

  // Strict Max Bet Check
  if (isNaN(bet) || bet <= 0) {
    return alert("Please enter a valid bet amount!");
  }
  if (bet > 25) {
    return alert("Maximum bet limit for Coinflip is 25 coins.");
  }
  if (bet > userData.balance) {
    return alert("Insufficient balance!");
  }

  coin.style.transition = "none";
  coin.className = "coin";
  void coin.offsetWidth;
  coin.style.transition = "transform 3s cubic-bezier(0.15, 0.85, 0.35, 1.2)";

  const winChance = getWinChance(bet);
  const won = Math.random() < winChance;
  
  let outcome = won ? choice : (choice === "heads" ? "tails" : "heads");
  const newBalance = won ? userData.balance + bet : userData.balance - bet;

  coin.classList.add(outcome === "heads" ? "animate-heads" : "animate-tails");
  resultText.innerText = "Flipping...";
  resultText.className = "game-status-text text-blue";

  setTimeout(async () => {
    await updateDoc(doc(db, "users", currentUser.uid), { 
      balance: newBalance,
      wagered: increment(bet)
    });

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

  // Strict Max Bet Check
  if (isNaN(bet) || bet <= 0) {
    resultText.innerText = "Please enter a valid bet amount!";
    resultText.className = "game-status-text text-red";
    return;
  }
  if (bet > 50) {
    resultText.innerText = "Maximum bet limit for Dice is 50 coins.";
    resultText.className = "game-status-text text-red";
    return;
  }
  if (bet > userData.balance) {
    resultText.innerText = "Insufficient balance!";
    resultText.className = "game-status-text text-red";
    return;
  }

  const winChance = getWinChance(bet);
  const won = Math.random() < winChance;

  let validNumbers = [];
  let invalidNumbers = [];

  if (target === "under3") {
    validNumbers = [1, 2];
    invalidNumbers = [3, 4, 5, 6];
  } else if (target === "over3") {
    validNumbers = [4, 5, 6];
    invalidNumbers = [1, 2, 3];
  } else if (target === "exact6") {
    validNumbers = [6];
    invalidNumbers = [1, 2, 3, 4, 5];
  }

  const pool = won ? validNumbers : invalidNumbers;
  const roll = pool[Math.floor(Math.random() * pool.length)];

  const diceEmojis = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  display.innerText = diceEmojis[roll];

  const multiplier = target === "exact6" ? 5 : 2;

  if (won) {
    const profit = bet * (multiplier - 1);
    await updateDoc(doc(db, "users", currentUser.uid), { 
      balance: userData.balance + profit,
      wagered: increment(bet)
    });
    resultText.innerText = `Rolled ${roll}! You won ${profit} coins! 🎉`;
    resultText.className = "game-status-text text-green";
  } else {
    await updateDoc(doc(db, "users", currentUser.uid), { 
      balance: userData.balance - bet,
      wagered: increment(bet)
    });
    resultText.innerText = `Rolled ${roll}. You lost ${bet} coins.`;
    resultText.className = "game-status-text text-red";
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
}

window.startBlackjack = async () => {
  bjBetAmount = parseInt(document.getElementById('bj-bet').value);
  const resultText = document.getElementById('bj-result');

  // Strict Max Bet Check
  if (isNaN(bjBetAmount) || bjBetAmount <= 0) {
    resultText.innerText = "Please enter a valid bet amount!";
    resultText.className = "game-status-text text-red";
    return;
  }
  if (bjBetAmount > 30) {
    resultText.innerText = "Maximum bet limit for Blackjack is 30 coins.";
    resultText.className = "game-status-text text-red";
    return;
  }
  if (bjBetAmount > userData.balance) {
    resultText.innerText = "Insufficient balance!";
    resultText.className = "game-status-text text-red";
    return;
  }

  const winChance = getWinChance(bjBetAmount);
  bjIsForcedLoss = Math.random() >= winChance;

  await updateDoc(doc(db, "users", currentUser.uid), {
    wagered: increment(bjBetAmount)
  });

  bjDeck = createDeck();
  
  if (bjIsForcedLoss) {
    playerHand = [{ value: '10', suit: '♠' }, { value: '5', suit: '♥' }];
    dealerHand = [{ value: '10', suit: '♦' }, { value: '9', suit: '♣' }];
  } else {
    playerHand = [bjDeck.pop(), bjDeck.pop()];
    dealerHand = [bjDeck.pop(), bjDeck.pop()];
  }

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
  if (bjIsForcedLoss && calculateHand(playerHand) >= 15) {
    playerHand.push({ value: '10', suit: '♠' });
  } else {
    playerHand.push(bjDeck.pop());
  }
  
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

// --- 3-DAY WAGER MILESTONES ---
function loadMilestones() {
  const container = document.getElementById("milestone-rewards-list");
  if (!container) return;

  const milestones = [
    { id: 1, target: 100, reward: 20 },
    { id: 2, target: 500, reward: 100 },
    { id: 3, target: 1500, reward: 350 },
    { id: 4, target: 5000, reward: 1200 }
  ];

  const wagered = userData?.wagered || 0;
  const claimedMilestones = userData?.claimedMilestones || [];

  container.innerHTML = "";
  milestones.forEach((m) => {
    const progress = Math.min(wagered, m.target);
    const percentage = Math.floor((progress / m.target) * 100);
    const isCompleted = wagered >= m.target;
    const isClaimed = claimedMilestones.includes(m.id);

    const card = document.createElement("div");
    card.className = "panel-card";
    card.style.cssText = "margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;";

    let buttonHtml = '';
    if (isClaimed) {
      buttonHtml = `<button class="btn-game" style="background: #1f2937; color: #9ca3af; cursor: not-allowed;" disabled>Claimed</button>`;
    } else if (isCompleted) {
      buttonHtml = `<button class="btn-game" style="background: #059669; color: #fff; cursor: pointer;" onclick="claimMilestone(${m.id}, ${m.reward})">Claim</button>`;
    } else {
      buttonHtml = `<button class="btn-game" style="background: #374151; color: #fff; cursor: not-allowed;" disabled>Locked</button>`;
    }

    card.innerHTML = `
      <div style="flex: 1; margin-right: 16px;">
        <h4 style="color: #fff; margin-bottom: 4px;">Milestone ${m.id}: Wager ${m.target} Coins</h4>
        <p style="color: #9ca3af; font-size: 0.85rem; margin-bottom: 8px;">Reward: <strong class="text-green">+${m.reward} Coins</strong></p>
        
        <div style="background: #1f2937; height: 8px; border-radius: 4px; overflow: hidden; width: 100%;">
          <div style="background: #3b82f6; width: ${percentage}%; height: 100%; transition: width 0.3s;"></div>
        </div>
        <span style="font-size: 0.75rem; color: #9ca3af; margin-top: 4px; display: inline-block;">Progress: ${progress} / ${m.target} (${percentage}%)</span>
      </div>
      <div>
        ${buttonHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

// --- CLAIM MILESTONE HANDLER ---
window.claimMilestone = async (milestoneId, rewardAmount) => {
  if (!currentUser || !userData) return;

  const claimedMilestones = userData.claimedMilestones || [];
  if (claimedMilestones.includes(milestoneId)) {
    return alert("You have already claimed this milestone!");
  }

  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      balance: increment(rewardAmount),
      claimedMilestones: [...claimedMilestones, milestoneId]
    });
    alert(`🎉 Successfully claimed ${rewardAmount} coins!`);
  } catch (err) {
    alert(err.message);
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

  if (!recipientName ||
