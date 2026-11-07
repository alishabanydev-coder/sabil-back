const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, spawn } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const API_ROOT = "https://api.telegram.org";
const ADMINS_PATH =
  process.env.TELEGRAM_ADMINS_PATH || "/root/telegram-admins.json";
const BACKUP_STATUS_PATH =
  process.env.BACKUP_STATUS_PATH || "/root/backups/backup-status.json";
const DEPLOY_STATUS_PATH =
  process.env.DEPLOY_STATUS_PATH || "/root/deploy-status.json";
const BACKUP_SCRIPT = process.env.BACKUP_SCRIPT_PATH || "/root/backup.sh";
const MAX_PASSWORD_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const STATUS_TTL_MS = 10 * 1000;
const WELCOME = [
  "Sabeel",
  "Server, backups, deploys, and uptime.",
  "",
  "Open Menu, then /start.",
  "After the password, Menu shows Server, Backup, Deploy, and Watchdog.",
  "Cloudflare already texts this chat if the site goes down.",
].join("\n");

const GUEST_COMMANDS = [
  { command: "start", description: "Open the bot" },
];

const ADMIN_COMMANDS = [
  { command: "menu", description: "Server, backup, deploy, watchdog" },
  { command: "logout", description: "Lock this phone" },
];

async function setCommands(chatId) {
  const commands =
    chatId && isAuthorized(chatId) ? ADMIN_COMMANDS : GUEST_COMMANDS;
  if (!chatId) {
    await telegram("deleteMyCommands", {});
    await telegram("setMyCommands", {
      commands,
      scope: { type: "all_private_chats" },
    });
    return;
  }
  await telegram("deleteMyCommands", {
    scope: { type: "chat", chat_id: chatId },
  });
  await telegram("setMyCommands", {
    commands,
    scope: { type: "chat", chat_id: chatId },
  });
}

const sessions = new Map();
const authorizedChats = new Set();
const chatPins = new Map();
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
  if (typeof text !== "string" || !text.startsWith("/")) {
    return "";
  }
  return text.slice(1).split(/[\s@]/)[0].toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "unknown";
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 ** 2) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  if (bytes < 1024 ** 3) {
    const megabytes = bytes / 1024 ** 2;
    return `${megabytes.toFixed(megabytes < 10 ? 1 : 0)} MB`;
  }
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatPercent(part, total) {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) {
    return "0%";
  }
  return `${Math.round((part / total) * 100)}%`;
}

function formatWhen(value) {
  if (!value) {
    return "not recorded";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Tehran",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statLine(label, value) {
  return `${escapeHtml(label)}\n<code>${escapeHtml(value)}</code>`;
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
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function pinsFor(chatId) {
  const id = Number(chatId);
  if (!chatPins.has(id)) {
    chatPins.set(id, {
      welcomeId: null,
      menuId: null,
      menuTimer: null,
      passwordId: null,
      statusId: null,
      statusTimer: null,
    });
  }
  return chatPins.get(id);
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
  const savedPins = saved?.pins && typeof saved.pins === "object" ? saved.pins : {};
  Object.entries(savedPins).forEach(([chatId, value]) => {
    const numericId = Number(chatId);
    if (!Number.isFinite(numericId) || !value) {
      return;
    }
    const pins = pinsFor(numericId);
    pins.welcomeId = value.welcomeId || null;
    pins.menuId = value.menuId || null;
    pins.passwordId = value.passwordId || null;
  });
}

function saveAuthorizedChats() {
  const pins = {};
  chatPins.forEach((value, chatId) => {
    if (!value.welcomeId && !value.menuId && !value.passwordId) {
      return;
    }
    pins[chatId] = {
      welcomeId: value.welcomeId,
      menuId: value.menuId,
      passwordId: value.passwordId,
    };
  });
  fs.mkdirSync(path.dirname(ADMINS_PATH), { recursive: true });
  fs.writeFileSync(
    ADMINS_PATH,
    `${JSON.stringify({ chatIds: [...authorizedChats], pins }, null, 2)}\n`,
    { mode: 0o600 }
  );
}

function sessionFor(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      awaitingPassword: false,
      failures: 0,
      lockedUntil: 0,
    });
  }
  return sessions.get(chatId);
}

function isAuthorized(chatId) {
  return authorizedChats.has(Number(chatId));
}

async function telegram(method, body) {
  const response = await fetch(`${API_ROOT}/bot${token()}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
        { text: "Server", callback_data: "server" },
        { text: "Backup", callback_data: "backup" },
      ],
      [
        { text: "Deploy", callback_data: "deploy" },
        { text: "Watchdog", callback_data: "watchdog" },
      ],
    ],
  };
}

function withBack(rows) {
  return {
    inline_keyboard: [...rows, [{ text: "Back", callback_data: "menu" }]],
  };
}

async function showMenu(chatId) {
  const pins = pinsFor(chatId);
  const text = "<b>Sabeel</b>\nServer, backups, deploys, watchdog.";
  const replyMarkup = homeKeyboard();
  if (pins.menuId) {
    try {
      await telegram("editMessageText", {
        chat_id: chatId,
        message_id: pins.menuId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      armMenuTimer(chatId);
      return;
    } catch (error) {
      if (/message is not modified/i.test(error.message)) {
        armMenuTimer(chatId);
        return;
      }
      pins.menuId = null;
    }
  }

  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
  pins.menuId = sent.message_id;
  saveAuthorizedChats();
  armMenuTimer(chatId);
}

async function askForPassword(chatId) {
  const session = sessionFor(chatId);
  session.awaitingPassword = true;
  const pins = pinsFor(chatId);
  if (pins.passwordId) {
    return;
  }
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: "Send the admin password.",
  });
  pins.passwordId = sent.message_id;
  saveAuthorizedChats();
  forgetSoon(chatId, sent.message_id, () => {
    if (pins.passwordId === sent.message_id) {
      pins.passwordId = null;
      saveAuthorizedChats();
    }
  });
}

async function showWelcome(chatId) {
  const pins = pinsFor(chatId);
  if (pins.welcomeId) {
    try {
      await telegram("editMessageCaption", {
        chat_id: chatId,
        message_id: pins.welcomeId,
        caption: WELCOME,
      });
      return;
    } catch (error) {
      if (/message is not modified/i.test(error.message)) {
        return;
      }
      try {
        await telegram("editMessageText", {
          chat_id: chatId,
          message_id: pins.welcomeId,
          text: WELCOME,
        });
        return;
      } catch (editError) {
        if (/message is not modified/i.test(editError.message)) {
          return;
        }
        pins.welcomeId = null;
      }
    }
  }

  try {
    const sent = await telegram("sendPhoto", {
      chat_id: chatId,
      photo: "https://sabeelkids.sabeelgroup.org/icon-512.webp",
      caption: WELCOME,
    });
    pins.welcomeId = sent.message_id;
  } catch (error) {
    console.error("Telegram welcome photo failed:", error.message);
    const sent = await telegram("sendMessage", { chat_id: chatId, text: WELCOME });
    pins.welcomeId = sent.message_id;
  }
  saveAuthorizedChats();
}

function forgetSoon(chatId, messageId, onForget) {
  setTimeout(() => {
    telegram("deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    }).catch(() => {});
    if (onForget) {
      onForget();
    }
  }, STATUS_TTL_MS);
}

function armMenuTimer(chatId) {
  const pins = pinsFor(chatId);
  clearTimeout(pins.menuTimer);
  pins.menuTimer = setTimeout(() => {
    const messageId = pins.menuId;
    pins.menuId = null;
    pins.menuTimer = null;
    if (!messageId) {
      return;
    }
    telegram("deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    }).catch(() => {});
    try {
      saveAuthorizedChats();
    } catch (error) {
      console.error("Failed to save Telegram admins:", error.message);
    }
  }, STATUS_TTL_MS);
}

function clearMenu(chatId) {
  const pins = pinsFor(chatId);
  clearTimeout(pins.menuTimer);
  pins.menuTimer = null;
  const messageId = pins.menuId;
  pins.menuId = null;
  if (!messageId) {
    return;
  }
  telegram("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  }).catch(() => {});
}

async function clearStatus(chatId) {
  const pins = pinsFor(chatId);
  clearTimeout(pins.statusTimer);
  pins.statusTimer = null;
  const messageId = pins.statusId;
  pins.statusId = null;
  if (!messageId) {
    return;
  }
  await telegram("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  }).catch(() => {});
}

function armStatusTimer(chatId) {
  const pins = pinsFor(chatId);
  clearTimeout(pins.statusTimer);
  pins.statusTimer = setTimeout(() => {
    clearStatus(chatId);
  }, STATUS_TTL_MS);
}

async function showStatus(chatId, text, replyMarkup) {
  const pins = pinsFor(chatId);
  clearTimeout(pins.statusTimer);
  pins.statusTimer = null;

  if (pins.statusId) {
    try {
      await telegram("editMessageText", {
        chat_id: chatId,
        message_id: pins.statusId,
        text,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      armStatusTimer(chatId);
      return;
    } catch (error) {
      if (/message is not modified/i.test(error.message)) {
        armStatusTimer(chatId);
        return;
      }
      pins.statusId = null;
    }
  }

  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: replyMarkup,
  });
  pins.statusId = sent.message_id;
  armStatusTimer(chatId);
}

async function refreshCommands(chatId) {
  try {
    await setCommands(chatId);
  } catch (error) {
    console.error("Telegram commands failed:", error.message);
  }
}

function readDisk() {
  try {
    const stats = fs.statfsSync("/");
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
    const { stdout } = await execFileAsync("pm2", ["jlist"], {
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
  const title = `<b>${escapeHtml(name)}</b>`;
  if (!list) {
    return `${title}\nUnavailable`;
  }
  const processInfo = list.find((item) => item.name === name);
  if (!processInfo) {
    return `${title}\nNot running`;
  }
  const status = processInfo.pm2_env?.status || "unknown";
  const startedAt = processInfo.pm2_env?.pm_uptime;
  const uptime = startedAt ? formatDuration(Date.now() - startedAt) : "0m";
  const memory = formatBytes(processInfo.monit?.memory || 0);
  const restarts = processInfo.pm2_env?.restart_time ?? 0;
  return [
    title,
    `Status  <code>${escapeHtml(status)}</code>`,
    `Up  <code>${escapeHtml(uptime)}</code>`,
    `Memory  <code>${escapeHtml(memory)}</code>`,
    `Restarts  <code>${escapeHtml(restarts)}</code>`,
  ].join("\n");
}

async function serverText() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const load = os.loadavg()[0];
  const cores = Math.max(1, os.cpus().length);
  const cpu = Math.min(100, Math.round((load / cores) * 100));
  const disk = readDisk();
  const processes = await readPm2();
  const diskBlock = disk
    ? [
        `<b>Disk</b>  <code>${formatPercent(disk.total - disk.available, disk.total)}</code>`,
        `Used  <code>${escapeHtml(formatBytes(disk.total - disk.available))}</code>`,
        `Free  <code>${escapeHtml(formatBytes(disk.available))}</code>`,
        `Total  <code>${escapeHtml(formatBytes(disk.total))}</code>`,
      ].join("\n")
    : "<b>Disk</b>\nUnavailable";

  return [
    "<b>Server</b>",
    "",
    `<b>Memory</b>  <code>${formatPercent(usedMemory, totalMemory)}</code>`,
    `Used  <code>${escapeHtml(formatBytes(usedMemory))}</code>`,
    `Free  <code>${escapeHtml(formatBytes(freeMemory))}</code>`,
    `Total  <code>${escapeHtml(formatBytes(totalMemory))}</code>`,
    "",
    `<b>CPU</b>  <code>${cpu}%</code>`,
    `Load  <code>${escapeHtml(load.toFixed(2))}</code> on ${cores} cores`,
    "",
    diskBlock,
    "",
    "<b>Apps</b>",
    formatProcess(processes, "frontend"),
    "",
    formatProcess(processes, "backend"),
  ].join("\n");
}

function backupText() {
  const status = readJson(BACKUP_STATUS_PATH);
  if (!status) {
    return "<b>Backup</b>\nNo backup has been recorded yet.";
  }
  return [
    "<b>Backup</b>",
    "",
    statLine("When", formatWhen(status.finishedAt)),
    statLine("Result", status.ok ? "Success" : "Failed"),
    statLine("Database", formatBytes(status.databaseBytes)),
    statLine("Uploads", formatBytes(status.uploadsBytes)),
    statLine("Drive", status.drive || "unknown"),
    backupRunning ? "\nA backup is running now." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function deployText() {
  const status = readJson(DEPLOY_STATUS_PATH);
  if (!status) {
    return "<b>Deploy</b>\nNo deploy has been recorded yet.";
  }
  return [
    "<b>Deploy</b>",
    "",
    statLine("When", formatWhen(status.finishedAt)),
    statLine("Target", status.target || "unknown"),
    statLine("Result", status.ok ? "Success" : "Failed"),
  ].join("\n");
}

function watchdogText() {
  return [
    "<b>Watchdog</b>",
    "Cloudflare checks the site every minute.",
    "",
    "Up",
    "<code>EXTERNAL WATCHDOG</code>",
    "",
    "Down",
    "<code>EXTERNAL WATCHDOG - DOWN</code>",
  ].join("\n");
}

async function showServer(chatId) {
  await showStatus(
    chatId,
    await serverText(),
    withBack([[{ text: "Refresh", callback_data: "server" }]])
  );
}

async function showBackup(chatId) {
  await showStatus(
    chatId,
    backupText(),
    withBack([
      [{ text: "Run backup", callback_data: "backup:ask" }],
      [{ text: "Refresh", callback_data: "backup" }],
    ])
  );
}

async function showDeploy(chatId) {
  await showStatus(
    chatId,
    deployText(),
    withBack([[{ text: "Refresh", callback_data: "deploy" }]])
  );
}

async function showWatchdog(chatId) {
  await showStatus(chatId, watchdogText(), withBack([]));
}

function startBackup() {
  if (backupRunning) {
    return false;
  }
  backupRunning = true;
  const child = spawn(BACKUP_SCRIPT, [], { detached: true, stdio: "ignore" });
  child.on("error", () => {
    backupRunning = false;
  });
  child.on("exit", () => {
    backupRunning = false;
  });
  child.unref();
  return true;
}

async function handlePassword(message) {
  const chatId = message.chat.id;
  const session = sessionFor(chatId);
  if (session.lockedUntil > Date.now()) {
    const locked = await telegram("sendMessage", {
      chat_id: chatId,
      text: "Too many attempts. Try again in 15 minutes.",
    });
    forgetSoon(chatId, locked.message_id);
    return;
  }

  const accepted = safeEqual(
    message.text || "",
    process.env.TELEGRAM_ADMIN_PASSWORD || ""
  );
  telegram("deleteMessage", {
    chat_id: chatId,
    message_id: message.message_id,
  }).catch(() => {});

  if (!accepted) {
    session.failures += 1;
    if (session.failures >= MAX_PASSWORD_ATTEMPTS) {
      session.failures = 0;
      session.lockedUntil = Date.now() + LOCK_MS;
      session.awaitingPassword = false;
      const locked = await telegram("sendMessage", {
        chat_id: chatId,
        text: "Too many attempts. Try again in 15 minutes.",
      });
      forgetSoon(chatId, locked.message_id);
      return;
    }
    const rejected = await telegram("sendMessage", {
      chat_id: chatId,
      text: "Wrong password.",
    });
    forgetSoon(chatId, rejected.message_id);
    return;
  }

  session.awaitingPassword = false;
  session.failures = 0;
  const pins = pinsFor(chatId);
  if (pins.passwordId) {
    telegram("deleteMessage", {
      chat_id: chatId,
      message_id: pins.passwordId,
    }).catch(() => {});
    pins.passwordId = null;
  }
  authorizedChats.add(Number(chatId));
  try {
    saveAuthorizedChats();
  } catch (error) {
    console.error("Failed to save Telegram admins:", error.message);
  }
  await refreshCommands(chatId);
  await showMenu(chatId);
}

async function handleMessage(message) {
  if (!message?.chat || message.chat.type !== "private") {
    return;
  }

  const chatId = message.chat.id;
  const command = commandOf(message.text);
  const session = sessionFor(chatId);

  if (command === "logout") {
    authorizedChats.delete(Number(chatId));
    session.awaitingPassword = false;
    try {
      saveAuthorizedChats();
    } catch (error) {
      console.error("Failed to save Telegram admins:", error.message);
    }
    await refreshCommands(chatId);
    await clearStatus(chatId);
    clearMenu(chatId);
    try {
      saveAuthorizedChats();
    } catch (error) {
      console.error("Failed to save Telegram admins:", error.message);
    }
    await showWelcome(chatId);
    return;
  }

  if (command === "help" || command === "clear") {
    await showWelcome(chatId);
    if (command === "clear" && isAuthorized(chatId)) {
      await showMenu(chatId);
    }
    return;
  }

  if (command === "start") {
    await showWelcome(chatId);
    if (isAuthorized(chatId)) {
      await showMenu(chatId);
      return;
    }
    await askForPassword(chatId);
    return;
  }

  if (
    command === "menu" ||
    command === "server" ||
    command === "backup" ||
    command === "deploy" ||
    command === "watchdog"
  ) {
    if (!isAuthorized(chatId)) {
      await showWelcome(chatId);
      await askForPassword(chatId);
      return;
    }
    if (command === "menu") {
      await showMenu(chatId);
    } else if (command === "server") {
      await showServer(chatId);
    } else if (command === "backup") {
      await showBackup(chatId);
    } else if (command === "deploy") {
      await showDeploy(chatId);
    } else {
      await showWatchdog(chatId);
    }
    return;
  }

  if (!isAuthorized(chatId) && session.awaitingPassword) {
    await handlePassword(message);
    return;
  }

  if (!isAuthorized(chatId)) {
    const hint = await telegram("sendMessage", {
      chat_id: chatId,
      text: "Send /start to enter the password.",
    });
    forgetSoon(chatId, hint.message_id);
  }
}

async function handleCallback(callback) {
  const message = callback.message;
  if (!message?.chat || message.chat.type !== "private") {
    return;
  }

  const chatId = message.chat.id;
  await telegram("answerCallbackQuery", {
    callback_query_id: callback.id,
  }).catch(() => {});

  if (!isAuthorized(chatId)) {
    const hint = await telegram("sendMessage", {
      chat_id: chatId,
      text: "Send /start to enter the password.",
    });
    forgetSoon(chatId, hint.message_id);
    return;
  }

  const action = callback.data;
  if (action === "menu") {
    await clearStatus(chatId);
    await showMenu(chatId);
    return;
  }
  if (action === "server") {
    await showServer(chatId);
    return;
  }
  if (action === "backup") {
    await showBackup(chatId);
    return;
  }
  if (action === "backup:ask") {
    await showStatus(
      chatId,
      "<b>Run a backup now?</b>\nIt dumps the database, archives uploads, and uploads them to Drive.",
      {
        inline_keyboard: [
          [
            { text: "Run now", callback_data: "backup:run" },
            { text: "Cancel", callback_data: "backup" },
          ],
        ],
      },
    );
    return;
  }
  if (action === "backup:run") {
    const started = startBackup();
    await showStatus(
      chatId,
      started
        ? "Backup started. The result will arrive here when it finishes."
        : "A backup is already running.",
      withBack([[{ text: "Refresh", callback_data: "backup" }]])
    );
    return;
  }
  if (action === "deploy") {
    await showDeploy(chatId);
    return;
  }
  if (action === "watchdog") {
    await showWatchdog(chatId);
  }
}

async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await telegram("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "callback_query"],
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
          console.error("Telegram update failed:", error.message);
        }
      }
    } catch (error) {
      console.error("Telegram poll failed:", error.message);
      await sleep(3000);
    }
  }
}

let seenDeploy = undefined;
let seenBackup = undefined;

async function announce(text) {
  const chats = [...authorizedChats];
  if (!chats.length) {
    return;
  }
  await Promise.all(
    chats.map(async (chatId) => {
      try {
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text,
          parse_mode: "HTML",
        });
        forgetSoon(chatId, sent.message_id);
      } catch (error) {
        console.error("Telegram announce failed:", error.message);
      }
    })
  );
}

function statusStamp(status, extra) {
  if (!status?.finishedAt) {
    return "";
  }
  return `${status.finishedAt}|${extra || ""}|${status.ok}`;
}

async function watchStatusFiles() {
  try {
    const deploy = readJson(DEPLOY_STATUS_PATH);
    const backup = readJson(BACKUP_STATUS_PATH);
    const deployStamp = statusStamp(deploy, deploy?.target);
    const backupStamp = statusStamp(backup, "backup");
    if (seenDeploy === undefined) {
      seenDeploy = deployStamp;
    } else if (deployStamp && deployStamp !== seenDeploy) {
      seenDeploy = deployStamp;
      await announce(deployText());
    }
    if (seenBackup === undefined) {
      seenBackup = backupStamp;
    } else if (backupStamp && backupStamp !== seenBackup) {
      seenBackup = backupStamp;
      await announce(backupText());
    }
  } catch (error) {
    console.error("Telegram status watch failed:", error.message);
  } finally {
    setTimeout(watchStatusFiles, 5000);
  }
}

function sweepEphemeralPins() {
  let changed = false;
  chatPins.forEach((pins, chatId) => {
    if (pins.menuId) {
      telegram("deleteMessage", {
        chat_id: chatId,
        message_id: pins.menuId,
      }).catch(() => {});
      pins.menuId = null;
      changed = true;
    }
    if (pins.passwordId) {
      telegram("deleteMessage", {
        chat_id: chatId,
        message_id: pins.passwordId,
      }).catch(() => {});
      pins.passwordId = null;
      changed = true;
    }
  });
  if (!changed) {
    return;
  }
  try {
    saveAuthorizedChats();
  } catch (error) {
    console.error("Failed to save Telegram admins:", error.message);
  }
}

function startTelegramBot() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_ADMIN_PASSWORD) {
    console.log("Telegram bot skipped: token or admin password is unset");
    return;
  }

  loadAuthorizedChats();
  sweepEphemeralPins();
  watchStatusFiles();
  refreshCommands().then(() =>
    Promise.all([...authorizedChats].map((chatId) => refreshCommands(chatId))),
  );
  console.log("Telegram bot listening");
  poll().catch((error) => {
    console.error("Telegram bot stopped:", error.message);
  });
}

module.exports = { startTelegramBot };
