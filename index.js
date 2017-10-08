const TelegramBot = require('node-telegram-bot-api');
const sqlite = require('sqlite-sync');
const config = require('./config.json');

sqlite.connect('library.db'); 

sqlite.run(`CREATE TABLE IF NOT EXISTS messages(
  id  INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  from_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL
);`, function(res) {
  if (res.error)
    throw res.error;
});

const token = config.token;

const bot = new TelegramBot(token, {
  polling: true,
  filepath: false
});

// Start description
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'This bot allows you to bookmark messages.\n'
    + 'To add message use command:\n'
    + '`/add key`\n'
    + 'To list messages use command:\n'
    + '`/list`\n'
    + 'To remove message use command:\n'
    + '`/remove key`\n'
    , {parse_mode: 'markdown'});
});

// Retrieve message from database
bot.onText(/\/get ([^;'\"]+)/, (msg, match) => {
  const key = match[1];
  const message = getMessage(key);
  if (message.exists) {
    bot.forwardMessage(msg.chat.id, message.from_id, message.message_id);
  }
});

// Add message to database
const addMode = {};
bot.onText(/\/add ([^;'\"]+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const key = match[1];
  var text = '';
  if (isMessageExists(key)) {
    text = 'Sorry, message with this key already exists.';
  } else {
    addMode[chatId] = {key: key, from: msg.from.id};
    text = 'Now send me a message that needs to be saved. '
      + 'Or /cancel to abort operation.';
  }
  bot.sendMessage(chatId, text);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!(chatId in addMode)) {
    return;
  }

  if (typeof(msg.text) !== 'undefined' && msg.text.toLowerCase() == "/cancel") {
    delete addMode[msg.chat.id];
    return;
  }

  const row = addMode[chatId];
  
  sqlite.insert("messages", {
    key : row.key,
    from_id: row.from,
    message_id: msg.message_id
  }, function(res) {
    if (res.error) {
      bot.sendMessage(chatId, 'Unable to bookmark message. Please, try again later.');
      throw res.error;
    }
    bot.sendMessage(chatId, 'Message successfully saved!');
  });

  delete addMode[chatId];
});

// Get list of messages for current user
bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const data = sqlite.run(
    "SELECT `key` FROM messages WHERE `from_id` = ?",
     [fromId]);
  if (data.length == 0) {
    bot.sendMessage(chatId, 'You have not added anything.');
    return;
  }
  var lines = [];
  data.forEach(function(element) {
    lines.push('`' + element.key + '`');
  });
  bot.sendMessage(chatId, lines.join(', '), {parse_mode: 'markdown'});
});

// Remove message from database
bot.onText(/\/remove ([^;'\"]+)/, (msg, match) => {
  const key = match[1];
  const message = getMessage(key);
  if (!message.exists) return;
  if (message.from_id != msg.from.id) return;

  sqlite.delete('messages', {'key': key}, function(res) {
    if (!res.error) {
      bot.sendMessage(msg.chat.id, 'Message successfully deleted!');
    }
  });
});

function isMessageExists(key) {
  return sqlite.run(
    "SELECT COUNT(*) as cnt FROM messages WHERE `key` = ?",
     [key])[0].cnt != 0;
}

function getMessage(key) {
  const data = sqlite.run(
    "SELECT * FROM messages WHERE `key` = ? LIMIT 1",
     [key]);
  if (data.length == 0) {
    return {exists: false};
  }
  data[0].exists = true;
  return data[0];
}