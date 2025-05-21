// renderer.js (with delete + edit support re-applied)
let isWindowFocused = true;
window.addEventListener('focus', () => isWindowFocused = true);
window.addEventListener('blur', () => isWindowFocused = false);

const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const { BrowserWindow } = require('@electron/remote');
const { ipcRenderer } = require('electron');

const firebaseConfig = {
  apiKey: "AIzaSyCaYc_wMXDZc9TGuN8j2MMJYM_0s4p-wec",
  authDomain: "realtime-chat-35c74.firebaseapp.com",
  databaseURL: "https://realtime-chat-35c74-default-rtdb.firebaseio.com",
  projectId: "realtime-chat-35c74",
  storageBucket: "realtime-chat-35c74.appspot.com",
  messagingSenderId: "694778960295",
  appId: "1:694778960295:web:cbd2f9423634251c527e82",
  measurementId: "G-GRHXFRCG6H"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let userName = "";
let lastSentMessage = "";
let lastSentTime = null;
let lastNotifiedTimestamp = 0;
let firstSnapshotLoaded = false;
let allMessages = [];

const audio = new Audio('assets/notify.mp3');

const sendBtn = document.getElementById('sendBtn');
const msgInput = document.getElementById('msgInput');
const messagesDiv = document.getElementById('messages');
const closeBtn = document.getElementById('close-btn');
const minBtn = document.getElementById('min-btn');
const overlay = document.getElementById('username-overlay');
const usernameInput = document.getElementById('username-input');
const enterBtn = document.getElementById('enter-chat-btn');
const themeToggle = document.getElementById('theme-toggle');
const clearChatBtn = document.getElementById('clear-chat-btn');
const searchInput = document.getElementById('search-input');
const usersList = document.getElementById('users-list');

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') enterBtn.click();
});

enterBtn.addEventListener('click', () => {
  const name = usernameInput.value.trim();
  if (!name) return;
  userName = name;
  overlay.style.display = 'none';

  db.collection('onlineUsers').doc(userName).set({
    lastSeen: firebase.firestore.FieldValue.serverTimestamp()
  });

  setInterval(() => {
    if (userName) {
      db.collection('onlineUsers').doc(userName).update({
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  }, 20000);
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendBtn.click();
  }
});

sendBtn.addEventListener('click', async () => {
  const text = msgInput.value.trim();
  if (!text || !userName) return;

  lastSentMessage = text;
  lastSentTime = new Date();

  await db.collection('companyChat').add({
    name: userName,
    message: text,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });

  msgInput.value = '';
});

db.collection('companyChat')
  .orderBy('timestamp')
  .onSnapshot(snapshot => {
    allMessages = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      allMessages.push({ id: doc.id, ...data });

      const name = data.name;
      const message = data.message;
      const messageTime = data.timestamp?.toDate();

      if (
        firstSnapshotLoaded &&
        name !== userName &&
        messageTime &&
        !isWindowFocused &&
        typeof messageTime.getTime === 'function'
      ) {
        const currentMsgTime = messageTime.getTime();

        ipcRenderer.invoke('get-last-hide-time').then(lastHideTime => {
          if (
            lastHideTime &&
            currentMsgTime > lastHideTime &&
            currentMsgTime > lastNotifiedTimestamp
          ) {
            lastNotifiedTimestamp = currentMsgTime;
            audio.play().catch(err => console.warn('Sound play error:', err));
            if (Notification.permission === 'granted') {
              new Notification(`${name}`, {
                body: message,
                silent: true
              });
            }
            ipcRenderer.send('new-message', {
              timestamp: currentMsgTime,
              text: message,
              name: name
            });
          }
        });
      }
    });

    renderMessages();
    firstSnapshotLoaded = true;
  });

function renderMessages() {
  const query = searchInput.value.trim().toLowerCase();
  messagesDiv.innerHTML = '';

  const filtered = allMessages.filter(data => {
    const name = data.name || '';
    const msg = data.message || '';
    return name.toLowerCase().includes(query) || msg.toLowerCase().includes(query);
  });

  filtered.forEach((data, index) => {
    const time = data.timestamp?.toDate()?.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit'
    }) || '';

    const div = document.createElement('div');
    div.classList.add('message-bubble');
    const isOwn = data.name === userName;

    div.innerHTML = `
      <div class="avatar">${data.name?.charAt(0).toUpperCase() || 'U'}</div>
      <div class="bubble-content">
        <div class="bubble-header">
          <span class="name">${data.name}</span>
          <span class="time">${time}</span>
        </div>
        <div class="bubble-text" id="text-${index}">${renderMessageContent(data.message)}</div>
        ${isOwn ? `
        <div class="bubble-actions">
          <button class="edit-btn" data-index="${index}" data-id="${data.id}" data-original="${data.message.replace(/`/g, '\`')}">✏️</button>
          <button class="delete-btn" data-id="${data.id}">🗑</button>
        </div>` : ''}
      </div>
    `;
    messagesDiv.appendChild(div);
  });

  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  messagesDiv.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirm("Delete this message?")) {
        await db.collection('companyChat').doc(id).delete();
      }
    });
  });

  messagesDiv.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = btn.getAttribute('data-index');
      const id = btn.getAttribute('data-id');
      const originalText = btn.getAttribute('data-original');

      const bubbleText = document.getElementById(`text-${index}`);
      bubbleText.innerHTML = `
        <textarea id="edit-input-${index}" class="edit-textarea">${originalText}</textarea>
        <div class="edit-actions">
          <button id="save-${index}">✅</button>
          <button id="cancel-${index}">❌</button>
        </div>
      `;

      document.getElementById(`save-${index}`).addEventListener('click', async () => {
        const newMsg = document.getElementById(`edit-input-${index}`).value.trim();
        if (newMsg && newMsg !== originalText) {
          await db.collection('companyChat').doc(id).update({ message: newMsg });
        }
      });

      document.getElementById(`cancel-${index}`).addEventListener('click', () => {
        bubbleText.innerHTML = renderMessageContent(originalText);
      });
    });
  });
}

minBtn.addEventListener('click', () => {
  ipcRenderer.send('allow-minimize');
  BrowserWindow.getFocusedWindow().hide();
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('confirm-close');
});

if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark');
  themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  themeToggle.textContent = isDark ? '☀️' : '🌙';
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

clearChatBtn.addEventListener('click', async () => {
  const confirmClear = confirm("⚠️ Are you sure you want to delete all chat messages?");
  if (!confirmClear) return;

  const snapshot = await db.collection('companyChat').get();
  const batch = db.batch();
  snapshot.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  lastSentTime = null;
  firstSnapshotLoaded = false;
  messagesDiv.innerHTML = '';
  alert("✅ Chat cleared.");
});

searchInput.addEventListener('input', renderMessages);

if (Notification.permission !== 'granted') {
  Notification.requestPermission();
}

function renderMessageContent(message) {
  if (!message) return '';
  const imageRegex = /(https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|gif))/gi;
  const match = message.match(imageRegex);
  if (match) {
    return `<a href="${match[0]}" target="_blank">${match[0]}</a><br><img src="${match[0]}" class="preview-img" />`;
  }
  return message.replace(/(https?:\/\/[^\s]+)/g, `<a href="$1" target="_blank">$1</a>`);
}

db.collection('onlineUsers').onSnapshot(snapshot => {
  const now = new Date();
  const online = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    const lastSeen = data.lastSeen?.toDate();
    if (lastSeen && (now - lastSeen) < 30000) {
      online.push(doc.id);
    }
  });
  usersList.textContent = online.join(', ');
});

window.addEventListener('beforeunload', () => {
  if (userName) {
    db.collection('onlineUsers').doc(userName).delete();
  }
});
