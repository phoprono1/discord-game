import Database from 'better-sqlite3';

const db = new Database('game.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    balance INTEGER DEFAULT 0,
    bank INTEGER DEFAULT 0
  );
  
  CREATE TABLE IF NOT EXISTS inventory (
    user_id TEXT,
    item_id TEXT,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS shop (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    type TEXT NOT NULL -- 'ore', 'fish', 'tool', etc.
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Migration to add bank column if it doesn't exist (for existing databases)
try {
  const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];

  const hasBank = tableInfo.some(col => col.name === 'bank');
  if (!hasBank) {
    db.prepare("ALTER TABLE users ADD COLUMN bank INTEGER DEFAULT 0").run();
    console.log("Added 'bank' column to users table.");
  }

  const hasExp = tableInfo.some(col => col.name === 'exp');
  if (!hasExp) {
    db.prepare("ALTER TABLE users ADD COLUMN exp INTEGER DEFAULT 0").run();
    console.log("Added 'exp' column to users table.");
  }

  const hasRealm = tableInfo.some(col => col.name === 'realm');
  if (!hasRealm) {
    db.prepare("ALTER TABLE users ADD COLUMN realm INTEGER DEFAULT 0").run();
    console.log("Added 'realm' column to users table.");
  }

  // Seed Shop Items
  const shopItems = [
    { id: 'exp_pill', name: 'Tụ Khí Đan', price: 1000, type: 'pill' },
    { id: 'breakthrough_pill', name: 'Trúc Cơ Đan', price: 5000, type: 'pill' }
  ];

  const insertShop = db.prepare('INSERT OR IGNORE INTO shop (id, name, price, type) VALUES (?, ?, ?, ?)');
  for (const item of shopItems) {
    insertShop.run(item.id, item.name, item.price, item.type);
  }
} catch (error) {
  console.error("Migration error:", error);
}

export default db;
