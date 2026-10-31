const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const API_ROOT = 'https://api.telegram.org';
const ADMINS_PATH = process.env.TELEGRAM_ADMINS_PATH || '/root/telegram-admins.json';
const BACKUP_STATUS_PATH = process.env.BACKUP_STATUS_PATH || '/root/backups/backup-status.json';
const DEPLOY_STATUS_PATH = process.env.DEPLOY_STATUS_PATH || '/root/deploy-status.json';
const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT_PATH || '/root/backup.sh';
const MAX_PASSWORD_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

const sessions = new Map();
const authorizedChats = new Set();
let backupRunning = false;

function token() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue));
  const right = Buffer.from(String(rightValue));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function commandOf(text) {
  if (typeof text !== 'string' || !text.startsWith('/')) {
    return '';
  }
  return text.slice(1).split(/[\s@]/)[0].toLowerCase();
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) {
    return 'unknown';
  }
  const gigabytes = bytes / (1024 ** 3);
  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(1)} GB`;
  }
  return `${Math.max(1, Math.round(bytes / (1024 ** 2)))} MB`;
}

function formatDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const remainMinutes = minutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${remainMinutes}m`;
  }
  return `${remainMinutes}m`;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function loadAuthorizedChats() {
  const saved = readJson(ADMINS_PATH);
  const chatIds = Array.isArray(saved?.chatIds) ? saved.chatIds : [];
  chatIds.forEach((chatId) => {
    const numericId = Number(chatId);
    if (Number.isFinite(numericId)) {
      authorizedChats.add(numericId);
    }
  });
}

function saveAuthorizedChats() {
  fs.mkdirSync(path.dirname(ADMINS_PATH), { recursive: true });
  fs.writeFileSync(
    ADMINS_PATH,
    `${JSON.stringify({ chatIds: [...authorizedChats] }, null, 2)}\n`,
    { mode: 0o600 },
  );
}

function sessionFor(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { awaitingPassword: false, failures: 0, lockedUntil: 0 });
  }
  return sessions.get(chatId);
}

function isAuthorized(chatId) {
  return authorizedChats.has(Number(chatId));
}

async function telegram(method, body) {
  const response = await fetch(`${API_ROOT}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) {
    const error = new Error(data.description || `Telegram ${method} failed`);
    error.statusCode = data.error_code;
    throw error;
  }
  return data.result;
}

function homeKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Server', callback_data: 'server' },
        { text: 'Backup', callback_data: 'backup' },
      ],
      [
        { text: 'Deploy', callback_data: 'deploy' },
        { text: 'Watchdog', callback_data: 'watchdog' },
      ],
    ],
  };
}

function withBack(rows) {
  return { inline_keyboard: [...rows, [{ text: 'Back', callback_data: 'menu' }]] };
}

async function present(chatId, messageId, text, replyMarkup) {
  if (messageId) {
    try {
      await telegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
      });
      return;
    } catch (error) {
      if (/message is not modified/i.test(error.message)) {
        return;
      }
    }
  }

  await telegram('sendMessage', {
    chat_id: chatId,
    text,
    reply_markup: replyMarkup,
  });
}

async function showMenu(chatId, messageId) {
  await present(
    chatId,
    messageId,
    'Sabeel\nServer, backups, deploys, watchdog.',
    homeKeyboard(),
  );
}

async function askForPassword(chatId) {
  const session = sessionFor(chatId);
  session.awaitingPassword = true;
  await telegram('sendMessage', {
    chat_id: chatId,
    text: 'Send the admin password.',
  });
}

function readDisk() {
  try {
    const stats = fs.statfsSync('/');
    return {
      total: stats.blocks * stats.bsize,
      available: stats.bavail * stats.bsize,
    };
  } catch {
    return null;
  }
}

async function readPm2() {
  try {
    const { stdout } = await execFileAsync('pm2', ['jlist'], {
      timeout: 8000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const list = JSON.parse(stdout);
    return Array.isArray(list) ? list : [];
  } catch {
    return null;
  }
}

function formatProcess(list, name) {
  if (!list) {
    return `${name}   unavailable`;
  }
  const processInfo = list.find((item) => item.name === name);
  if (!processInfo) {
    return `${name}   not running`;
  }
  const status = processInfo.pm2_env?.status || 'unknown';
  const startedAt = processInfo.pm2_env?.pm_uptime;
  const uptime = startedAt ? formatDuration(Date.now() - startedAt) : '0m';
  const memory = formatBytes(processInfo.monit?.memory || 0);
  const restarts = processInfo.pm2_env?.restart_time ?? 0;
  return `${name}   ${status}   ${uptime}   ${memory}   restarts ${restarts}`;
}

async function serverText() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const load = os.loadavg()[0];
  const cores = Math.max(1, os.cpus().length);
  const cpu = Math.min(100, Math.round((load / cores) * 100));
  const disk = readDisk();
  const diskLine = disk
    ? `Disk    ${formatBytes(disk.total - disk.available)} / ${formatBytes(disk.total)}   free ${formatBytes(disk.available)}`
    : 'Disk    unavailable';
  const processes = await readPm2();

  return [
    'Server',
    `RAM     ${formatBytes(usedMemory)} / ${formatBytes(totalMemory)}   free ${formatBytes(freeMemory)}`,
    `CPU     ${cpu}%   load ${load.toFixed(2)}`,
    diskLine,
    'PM2',
    formatProcess(processes, 'frontend'),
    formatProcess(processes, 'backend'),
  ].join('\n');
}

function backupText() {
  const status = readJson(BACKUP_STATUS_PATH);
  if (!status) {
    return 'Backup\nNo backup has been recorded yet.';
  }
  return [
    'Backup',
    `Last run   ${status.finishedAt || 'unknown'}`,
    `Result     ${status.ok ? 'Success' : 'Failed'}`,
    `Database   ${formatBytes(status.databaseBytes)}`,
    `Uploads    ${formatBytes(status.uploadsBytes)}`,
    `Drive      ${status.drive || 'unknown'}`,
    backupRunning ? 'A backup is running now.' : '',
  ].filter(Boolean).join('\n');
}

function deployText() {
  const status = readJson(DEPLOY_STATUS_PATH);
  if (!status) {
    return 'Deploy\nNo deploy has been recorded yet.';
  }
  return [
    'Deploy',
    `Last     ${status.finishedAt || 'unknown'}`,
    `Target   ${status.target || 'unknown'}`,
    `Result   ${status.ok ? 'Success' : 'Failed'}`,
  ].join('\n');
}

function watchdogText() {
  return [
    'Watchdog',
    'Cloudflare checks /api/health every minute.',
    'Up and down alerts appear in this chat:',
    '🟢 [EXTERNAL WATCHDOG]',
    '🔴 [EXTERNAL WATCHDOG - DOWN]',
  ].join('\n');
}

async function showServer(chatId, messageId) {
  await present(chatId, messageId, await serverText(), withBack([
    [{ text: 'Refresh', callback_data: 'server' }],
  ]));
}

async function showBackup(chatId, messageId) {
  await present(chatId, messageId, backupText(), withBack([
    [{ text: 'Run backup', callback_data: 'backup:ask' }],
    [{ text: 'Refresh', callback_data: 'backup' }],
  ]));
}

async function showDeploy(chatId, messageId) {
  await present(chatId, messageId, deployText(), withBack([
    [{ text: 'Refresh', callback_data: 'deploy' }],
  ]));
}

async function showWatchdog(chatId, messageId) {
  await present(chatId, messageId, watchdogText(), withBack([]));
}

function startBackup() {
  if (backupRunning) {
    return false;
  }
  backupRunning = true;
  const child = spawn(BACKUP_SCRIPT, [], { detached: true, stdio: 'ignore' });
  child.on('error', () => {
    backupRunning = false;
  });
  child.on('exit', () => {
    backupRunning = false;
  });
  child.unref();
  return true;
}

async function handlePassword(message) {
  const chatId = message.chat.id;
  const session = sessionFor(chatId);
  if (session.lockedUntil > Date.now()) {
    await telegram('sendMessage', {
      chat_id: chatId,
      text: 'Too many attempts. Try again in 15 minutes.',
    });
    return;
  }

  const accepted = safeEqual(message.text || '', process.env.TELEGRAM_ADMIN_PASSWORD || '');
  telegram('deleteMessage', {
    chat_id: chatId,
    message_id: message.message_id,
  }).catch(() => {});

  if (!accepted) {
    session.failures += 1;
    if (session.failures >= MAX_PASSWORD_ATTEMPTS) {
      session.failures = 0;
      session.lockedUntil = Date.now() + LOCK_MS;
      session.awaitingPassword = false;
      await telegram('sendMessage', {
        chat_id: chatId,
        text: 'Too many attempts. Try again in 15 minutes.',
      });
      return;
    }
    await telegram('sendMessage', {
      chat_id: chatId,
      text: 'Wrong password.',
    });
    return;
  }

  session.awaitingPassword = false;
  session.failures = 0;
  authorizedChats.add(Number(chatId));
  try {
    saveAuthorizedChats();
  } catch (error) {
    console.error('Failed to save Telegram admins:', error.message);
  }
  await showMenu(chatId);
}

async function handleMessage(message) {
  if (!message?.chat || message.chat.type !== 'private') {
    return;
  }

  const chatId = message.chat.id;
  const command = commandOf(message.text);
  const session = sessionFor(chatId);

  if (command === 'logout') {
    authorizedChats.delete(Number(chatId));
    session.awaitingPassword = false;
    try {
      saveAuthorizedChats();
    } catch (error) {
      console.error('Failed to save Telegram admins:', error.message);
    }
    await telegram('sendMessage', {
      chat_id: chatId,
      text: 'This chat is logged out. Send /start to enter the password again.',
    });
    return;
  }

  if (command === 'start') {
    if (isAuthorized(chatId)) {
      await showMenu(chatId);
      return;
    }
    await askForPassword(chatId);
    return;
  }

  if (command === 'menu') {
    if (!isAuthorized(chatId)) {
      await askForPassword(chatId);
      return;
    }
    await showMenu(chatId);
    return;
  }

  if (!isAuthorized(chatId) && session.awaitingPassword) {
    await handlePassword(message);
    return;
  }

  if (!isAuthorized(chatId)) {
    await telegram('sendMessage', {
      chat_id: chatId,
      text: 'Send /start to enter the password.',
    });
  }
}

async function handleCallback(callback) {
  const message = callback.message;
  if (!message?.chat || message.chat.type !== 'private') {
    return;
  }

  const chatId = message.chat.id;
  await telegram('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {});

  if (!isAuthorized(chatId)) {
    await telegram('sendMessage', {
      chat_id: chatId,
      text: 'Send /start to enter the password.',
    });
    return;
  }

  const action = callback.data;
  if (action === 'menu') {
    await showMenu(chatId, message.message_id);
    return;
  }
  if (action === 'server') {
    await showServer(chatId, message.message_id);
    return;
  }
  if (action === 'backup') {
    await showBackup(chatId, message.message_id);
    return;
  }
  if (action === 'backup:ask') {
    await present(
      chatId,
      message.message_id,
      'Run a backup now? It dumps the database, archives uploads, and uploads them to Drive.',
      {
        inline_keyboard: [[
          { text: 'Run now', callback_data: 'backup:run' },
          { text: 'Cancel', callback_data: 'backup' },
        ]],
      },
    );
    return;
  }
  if (action === 'backup:run') {
    const started = startBackup();
    await present(
      chatId,
      message.message_id,
      started
        ? 'Backup started. The result will arrive here when it finishes.'
        : 'A backup is already running.',
      withBack([[{ text: 'Refresh', callback_data: 'backup' }]]),
    );
    return;
  }
  if (action === 'deploy') {
    await showDeploy(chatId, message.message_id);
    return;
  }
  if (action === 'watchdog') {
    await showWatchdog(chatId, message.message_id);
  }
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await telegram('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message', 'callback_query'],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        try {
          if (update.message) {
            await handleMessage(update.message);
          } else if (update.callback_query) {
            await handleCallback(update.callback_query);
          }
        } catch (error) {
          console.error('Telegram update failed:', error.message);
        }
      }
    } catch (error) {
      console.error('Telegram poll failed:', error.message);
      await sleep(3000);
    }
  }
}

function startTelegramBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_ADMIN_PASSWORD) {
    console.log('Telegram bot skipped: token or admin password is unset');
    return;
  }

  loadAuthorizedChats();
  console.log('Telegram bot listening');
  poll().catch((error) => {
    console.error('Telegram bot stopped:', error.message);
  });
}

module.exports = { startTelegramBot };
