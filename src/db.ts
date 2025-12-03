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
    // --- Breakthrough Pills ---
    { id: 'breakthrough_pill', name: 'Trúc Cơ Đan (+20%)', price: 5000, type: 'pill' },
    { id: 'breakthrough_pill_mid', name: 'Hộ Tâm Đan (+30%)', price: 20000, type: 'pill' },
    { id: 'breakthrough_pill_high', name: 'Phá Cảnh Đan (+50%)', price: 100000, type: 'pill' },

    // --- Normal Pills (Phàm Nhân) ---
    { id: 'pill_normal_1', name: 'Tụ Khí Đan (Nhất Phẩm)', price: 1000, type: 'pill' }, // 1k EXP
    { id: 'pill_normal_2', name: 'Tụ Khí Đan (Nhị Phẩm)', price: 5000, type: 'pill' }, // 5k EXP
    { id: 'pill_normal_3', name: 'Tụ Khí Đan (Tam Phẩm)', price: 20000, type: 'pill' }, // 20k EXP
    { id: 'pill_normal_4', name: 'Tụ Khí Đan (Tứ Phẩm)', price: 50000, type: 'pill' }, // 50k EXP
    { id: 'pill_normal_5', name: 'Tụ Khí Đan (Ngũ Phẩm)', price: 100000, type: 'pill' }, // 100k EXP
    { id: 'pill_normal_6', name: 'Tụ Khí Đan (Lục Phẩm)', price: 500000, type: 'pill' }, // 500k EXP
    { id: 'pill_normal_7', name: 'Tụ Khí Đan (Thất Phẩm)', price: 2000000, type: 'pill' }, // 2m EXP
    { id: 'pill_normal_8', name: 'Tụ Khí Đan (Bát Phẩm)', price: 10000000, type: 'pill' }, // 10m EXP
    { id: 'pill_normal_9', name: 'Tụ Khí Đan (Cửu Phẩm)', price: 50000000, type: 'pill' }, // 50m EXP

    // --- Immortal Pills (Tiên Đan) ---
    { id: 'pill_immortal_1', name: 'Tiên Đan (Nhất Phẩm)', price: 100000000, type: 'pill' }, // 100m EXP
    { id: 'pill_immortal_2', name: 'Tiên Đan (Nhị Phẩm)', price: 500000000, type: 'pill' }, // 500m EXP
    { id: 'pill_immortal_3', name: 'Tiên Đan (Tam Phẩm)', price: 2000000000, type: 'pill' }, // 2b EXP
    { id: 'pill_immortal_4', name: 'Tiên Đan (Tứ Phẩm)', price: 10000000000, type: 'pill' }, // 10b EXP
    { id: 'pill_immortal_5', name: 'Tiên Đan (Ngũ Phẩm)', price: 50000000000, type: 'pill' }, // 50b EXP
    { id: 'pill_immortal_6', name: 'Tiên Đan (Lục Phẩm)', price: 200000000000, type: 'pill' }, // 200b EXP
    { id: 'pill_immortal_7', name: 'Tiên Đan (Thất Phẩm)', price: 1000000000000, type: 'pill' }, // 1t EXP
    { id: 'pill_immortal_8', name: 'Tiên Đan (Bát Phẩm)', price: 5000000000000, type: 'pill' }, // 5t EXP
    { id: 'pill_immortal_9', name: 'Tiên Đan (Cửu Phẩm)', price: 20000000000000, type: 'pill' }, // 20t EXP

    // --- Eternal Pills (Vĩnh Hằng Đan) ---
    { id: 'pill_eternal_1', name: 'Vĩnh Hằng Đan (Nhất Phẩm)', price: 100000000000000, type: 'pill' }, // 100t EXP
    { id: 'pill_eternal_2', name: 'Vĩnh Hằng Đan (Nhị Phẩm)', price: 500000000000000, type: 'pill' },
    { id: 'pill_eternal_3', name: 'Vĩnh Hằng Đan (Tam Phẩm)', price: 2000000000000000, type: 'pill' },
    { id: 'pill_eternal_4', name: 'Vĩnh Hằng Đan (Tứ Phẩm)', price: 10000000000000000, type: 'pill' },
    { id: 'pill_eternal_5', name: 'Vĩnh Hằng Đan (Ngũ Phẩm)', price: 50000000000000000, type: 'pill' },
    { id: 'pill_eternal_6', name: 'Vĩnh Hằng Đan (Lục Phẩm)', price: 200000000000000000, type: 'pill' },
    { id: 'pill_eternal_7', name: 'Vĩnh Hằng Đan (Thất Phẩm)', price: 1000000000000000000, type: 'pill' },
    { id: 'pill_eternal_8', name: 'Vĩnh Hằng Đan (Bát Phẩm)', price: 5000000000000000000, type: 'pill' },
    { id: 'pill_eternal_9', name: 'Vĩnh Hằng Đan (Cửu Phẩm)', price: 20000000000000000000, type: 'pill' },

    // --- Chaos Pills (Hỗn Nguyên Đan) ---
    { id: 'pill_chaos_1', name: 'Hỗn Nguyên Đan (Nhất Phẩm)', price: 100000000000000000000, type: 'pill' },
    { id: 'pill_chaos_2', name: 'Hỗn Nguyên Đan (Nhị Phẩm)', price: 500000000000000000000, type: 'pill' },
    { id: 'pill_chaos_3', name: 'Hỗn Nguyên Đan (Tam Phẩm)', price: 2000000000000000000000, type: 'pill' },
    { id: 'pill_chaos_4', name: 'Hỗn Nguyên Đan (Tứ Phẩm)', price: 10000000000000000000000, type: 'pill' },
    { id: 'pill_chaos_5', name: 'Hỗn Nguyên Đan (Ngũ Phẩm)', price: 50000000000000000000000, type: 'pill' },
    { id: 'pill_chaos_6', name: 'Hỗn Nguyên Đan (Lục Phẩm)', price: 200000000000000000000000, type: 'pill' },
    { id: 'pill_chaos_7', name: 'Hỗn Nguyên Đan (Thất Phẩm)', price: 1000000000000000000000000, type: 'pill' },
    { id: 'pill_chaos_8', name: 'Hỗn Nguyên Đan (Bát Phẩm)', price: 5000000000000000000000000, type: 'pill' },
    { id: 'pill_chaos_9', name: 'Hỗn Nguyên Đan (Cửu Phẩm)', price: 20000000000000000000000000, type: 'pill' }
  ];

  const insertShop = db.prepare('INSERT OR IGNORE INTO shop (id, name, price, type) VALUES (?, ?, ?, ?)');
  for (const item of shopItems) {
    insertShop.run(item.id, item.name, item.price, item.type);
  }
} catch (error) {
  console.error("Migration error:", error);
}

export default db;
