const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const remoteMain = require('@electron/remote/main');
const { autoUpdater } = require('electron-updater'); // ✅ Auto-updater

remoteMain.initialize();

let isMainWindowHidden = false;
let mainWin;
let bubbleWin;
let unreadCount = 0;
let allowMinimize = false;
let lastBubblePosition = { x: null, y: null };
let lastHiddenTimestamp = null;
let lastWindowHideTime = null;


// ✅ Create the bubble window
function showBubbleWindow() {
  if (bubbleWin && bubbleWin.isDestroyed()) bubbleWin = null;
  if (bubbleWin) return;

  console.log("🟢 Showing bubble...");

  bubbleWin = new BrowserWindow({
    width: 300,
    height: 160,
    x: lastBubblePosition.x ?? undefined,
    y: lastBubblePosition.y ?? undefined,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  remoteMain.enable(bubbleWin.webContents);
  bubbleWin.loadFile('bubble.html');
  bubbleWin.setAlwaysOnTop(true, 'floating');
  bubbleWin.setVisibleOnAllWorkspaces(true);
  bubbleWin.setIgnoreMouseEvents(false);
  bubbleWin.setFocusable(true);



  bubbleWin.on('closed', () => {
    bubbleWin = null;
  });
}

// ✅ Create main chat window
function createWindows() {
  mainWin = new BrowserWindow({
    width: 350,
    height: 500,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  mainWin.loadFile('index.html');
  remoteMain.enable(mainWin.webContents);

  mainWin.on('hide', () => {
  console.log("Main window hidden, showing bubble...");
  isMainWindowHidden = true;
  unreadCount = 0;
  lastWindowHideTime = Date.now(); // ✅ mark time when hidden
  showBubbleWindow();
});

  mainWin.on('show', () => {
    isMainWindowHidden = false;
  });

  mainWin.on('blur', () => {
    if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) {
      showBubbleWindow();
    }
  });

  mainWin.on('close', () => {
    mainWin = null;
  });
}

// ✅ When app is ready
app.whenReady().then(() => {
  createWindows();

  // ✅ Ctrl+Q shortcut to reopen chat
  globalShortcut.register('Control+Q', () => {
    console.log("🔁 Ctrl+Q pressed");

    if (!mainWin) {
      createWindows();
    } else {
      mainWin.show();
      mainWin.focus();
    }

    if (bubbleWin && !bubbleWin.isDestroyed()) {
      bubbleWin.close();
    }
  });

  // ✅ Recheck visibility every second
  setInterval(() => {
    if (mainWin && !mainWin.isDestroyed()) {
      if (!mainWin.isVisible() && !bubbleWin) {
        console.log("🔄 Main window hidden and bubble gone. Restoring bubble...");
        showBubbleWindow();
      }
    }
  }, 1000);

  // ✅ Start checking for updates
  autoUpdater.checkForUpdatesAndNotify();
});

// ✅ Auto-Updater Events
autoUpdater.on('checking-for-update', () => {
  console.log("🔍 Checking for update...");
});

autoUpdater.on('update-available', (info) => {
  console.log(`⬇️ Update available: v${info.version}`);
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available. It will be downloaded in the background.`
  });
});

autoUpdater.on('update-not-available', () => {
  console.log("✅ No updates available.");
});

autoUpdater.on('error', (err) => {
  console.error("❌ Update error:", err);
});

autoUpdater.on('download-progress', (progress) => {
  console.log(`📥 Downloading update: ${Math.floor(progress.percent)}%`);
});

autoUpdater.on('update-downloaded', () => {
  console.log("✅ Update downloaded. Prompting user to install.");

  const response = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    title: 'Update Ready',
    message: 'An update has been downloaded. Would you like to restart the app now to apply the update?'
  });

  if (response === 0) {
    autoUpdater.quitAndInstall();
  }
});

// ✅ Handle chat window open from bubble
ipcMain.on('open-chat', () => {
  console.log("📨 Received open-chat from bubble");

  if (!mainWin) {
    createWindows();
  } else {
    mainWin.show();
    mainWin.focus();
  }

  unreadCount = 0;

  if (bubbleWin && !bubbleWin.isDestroyed()) {
    const bounds = bubbleWin.getBounds();
    lastBubblePosition = { x: bounds.x, y: bounds.y };
    bubbleWin.webContents.send('reset-badge');
    bubbleWin.close();
  }
});

// ✅ Handle unread message count
ipcMain.on('new-message', (event, messageData) => {
  const { timestamp, text, name } = messageData;

  if (isMainWindowHidden && timestamp && timestamp > lastWindowHideTime) {
    unreadCount++;
    if (bubbleWin && (!mainWin || !mainWin.isFocused())) {
      console.log("🧪 Sending to bubble:", name, text);
      bubbleWin.webContents.send('update-badge', unreadCount);
      bubbleWin.webContents.send('preview-message', {
        name: name || 'Unknown',
        text: text || ''
      });
    }
  }
});




// ✅ Allow renderer to query when window was last hidden
ipcMain.handle('get-last-hide-time', () => {
  return lastWindowHideTime || 0;
});



// ✅ Minimize flag
ipcMain.on('allow-minimize', () => {
  allowMinimize = true;
  setTimeout(() => {
    allowMinimize = false;
  }, 1000);
});

// ✅ Confirm before close
ipcMain.on('confirm-close', () => {
  const result = dialog.showMessageBoxSync(BrowserWindow.getFocusedWindow(), {
    type: 'question',
    buttons: ['Cancel', 'Exit'],
    defaultId: 0,
    cancelId: 0,
    title: 'Exit Chat',
    message: 'Are you sure you want to exit the chat?'
  });

  if (result === 1) {
    app.quit();
  }
});

// ✅ Cleanup on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
