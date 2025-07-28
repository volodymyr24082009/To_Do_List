const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "58e4340959ca5cf1dd364be7d18757c21505040d3b540b33e9dddabebfd382d2";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_5AaDEnCX3cLf@ep-soft-credit-adaqhtk9-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";

// Підключення до PostgreSQL
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// ===== КЛАС МЕНЕДЖЕРА БАЗИ ДАНИХ =====
class DatabaseManager {
  constructor(pool) {
    this.pool = pool;
  }

  async checkConnection() {
    try {
      const client = await this.pool.connect();
      console.log("✅ Успішне підключення до PostgreSQL");
      client.release();
      return true;
    } catch (error) {
      console.error("❌ Помилка підключення до БД:", error.message);
      return false;
    }
  }

  async checkTableExists(tableName) {
    try {
      const result = await this.pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        [tableName]
      );
      return result.rows[0].exists;
    } catch (error) {
      console.error(`Помилка перевірки таблиці ${tableName}:`, error.message);
      return false;
    }
  }

  async checkColumnExists(tableName, columnName) {
    try {
      const result = await this.pool.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = $1 AND column_name = $2
        )`,
        [tableName, columnName]
      );
      return result.rows[0].exists;
    } catch (error) {
      console.error(
        `Помилка перевірки колонки ${tableName}.${columnName}:`,
        error.message
      );
      return false;
    }
  }

  async getTableInfo(tableName) {
    try {
      const result = await this.pool.query(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns 
         WHERE table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
      );
      return result.rows;
    } catch (error) {
      console.error(
        `Помилка отримання інформації про таблицю ${tableName}:`,
        error.message
      );
      return [];
    }
  }

  async getRecordCount(tableName) {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count FROM ${tableName}`
      );
      return Number.parseInt(result.rows[0].count);
    } catch (error) {
      console.error(
        `Помилка підрахунку записів в ${tableName}:`,
        error.message
      );
      return 0;
    }
  }

  async createUsersTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        avatar TEXT DEFAULT '/placeholder.svg?height=120&width=120',
        registration_date DATE DEFAULT CURRENT_DATE,
        role VARCHAR(50) DEFAULT 'user',
        tfa_enabled BOOLEAN DEFAULT FALSE,
        tfa_secret TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    try {
      await this.pool.query(sql);
      console.log("✅ Таблиця users створена/перевірена");
    } catch (error) {
      console.error("❌ Помилка створення таблиці users:", error.message);
      throw error;
    }
  }

  async createTasksTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(500) NOT NULL,
        description TEXT,
        priority VARCHAR(20) DEFAULT 'medium',
        deadline DATE,
        tags TEXT[],
        completed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    try {
      await this.pool.query(sql);
      console.log("✅ Таблиця tasks створена/перевірена");
    } catch (error) {
      console.error("❌ Помилка створення таблиці tasks:", error.message);
      throw error;
    }
  }

  async createUserHistoryTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS user_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        action VARCHAR(255) NOT NULL,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    try {
      await this.pool.query(sql);
      console.log("✅ Таблиця user_history створена/перевірена");
    } catch (error) {
      console.error(
        "❌ Помилка створення таблиці user_history:",
        error.message
      );
      throw error;
    }
  }

  async createIndexes() {
    const indexes = [
      {
        name: "idx_users_email",
        sql: "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
      },
      {
        name: "idx_tasks_user_id",
        sql: "CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)",
      },
      {
        name: "idx_tasks_completed",
        sql: "CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)",
      },
      {
        name: "idx_user_history_user_id",
        sql: "CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history(user_id)",
      },
    ];

    for (const index of indexes) {
      try {
        await this.pool.query(index.sql);
        console.log(`✅ Індекс ${index.name} створений/перевірений`);
      } catch (error) {
        console.error(
          `❌ Помилка створення індексу ${index.name}:`,
          error.message
        );
      }
    }
  }

  async addMissingColumns() {
    const requiredColumns = [
      {
        table: "users",
        column: "avatar",
        type: "TEXT",
        default: "'/placeholder.svg?height=120&width=120'",
      },
      {
        table: "users",
        column: "registration_date",
        type: "DATE",
        default: "CURRENT_DATE",
      },
      {
        table: "users",
        column: "role",
        type: "VARCHAR(50)",
        default: "'user'",
      },
      {
        table: "users",
        column: "tfa_enabled",
        type: "BOOLEAN",
        default: "FALSE",
      },
      { table: "users", column: "tfa_secret", type: "TEXT", default: "NULL" },
      {
        table: "users",
        column: "created_at",
        type: "TIMESTAMP",
        default: "CURRENT_TIMESTAMP",
      },
      {
        table: "users",
        column: "updated_at",
        type: "TIMESTAMP",
        default: "CURRENT_TIMESTAMP",
      },
    ];

    for (const col of requiredColumns) {
      const exists = await this.checkColumnExists(col.table, col.column);
      if (!exists) {
        try {
          const sql = `ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type} DEFAULT ${col.default}`;
          await this.pool.query(sql);
          console.log(`✅ Додано колонку ${col.table}.${col.column}`);
        } catch (error) {
          console.error(
            `❌ Помилка додавання колонки ${col.table}.${col.column}:`,
            error.message
          );
        }
      }
    }
  }

  async insertTestData() {
    try {
      // Перевірка чи існує тестовий користувач
      const existingUser = await this.pool.query(
        "SELECT id FROM users WHERE email = $1",
        ["ivan.petrenko@example.com"]
      );

      if (existingUser.rows.length === 0) {
        // Додавання тестового користувача
        const userResult = await this.pool.query(
          "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id",
          [
            "Іван Петренко",
            "ivan.petrenko@example.com",
            "$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQ",
          ]
        );

        const userId = userResult.rows[0].id;

        // Додавання тестового завдання
        await this.pool.query(
          "INSERT INTO tasks (user_id, name, description, priority, deadline, tags, completed) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [
            userId,
            "Перше завдання",
            "Це тестове завдання для демонстрації функціональності",
            "high",
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 днів
            ["тест", "демо"],
            false,
          ]
        );

        console.log("✅ Додано тестові дані");
        console.log(
          "   👤 Користувач: ivan.petrenko@example.com (пароль: password123)"
        );
        console.log("   📋 Тестове завдання створено");
      } else {
        console.log("ℹ️  Тестові дані вже існують");
      }
    } catch (error) {
      console.error("❌ Помилка додавання тестових даних:", error.message);
    }
  }

  async getDatabaseInfo() {
    const info = {
      tables: [],
      totalRecords: 0,
      status: "healthy",
    };

    try {
      // Список таблиць
      const tablesResult = await this.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

      for (const row of tablesResult.rows) {
        const count = await this.getRecordCount(row.table_name);
        const columns = await this.getTableInfo(row.table_name);

        info.tables.push({
          name: row.table_name,
          records: count,
          columns: columns.map((col) => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === "YES",
            default: col.column_default,
          })),
        });

        info.totalRecords += count;
      }

      return info;
    } catch (error) {
      console.error("❌ Помилка отримання інформації про БД:", error.message);
      info.status = "error";
      info.error = error.message;
      return info;
    }
  }

  async initializeDatabase(options = {}) {
    const {
      dropExisting = false,
      addTestData = true,
      fixOnly = false,
    } = options;

    console.log("🚀 Ініціалізація бази даних...");
    console.log(
      `Режим: ${
        dropExisting
          ? "ПОВНЕ ПЕРЕСОЗДАННЯ"
          : fixOnly
          ? "ТІЛЬКИ ВИПРАВЛЕННЯ"
          : "СТВОРЕННЯ/ВИПРАВЛЕННЯ"
      }`
    );

    try {
      // Перевірка підключення
      const connected = await this.checkConnection();
      if (!connected) {
        throw new Error("Неможливо підключитися до бази даних");
      }

      if (dropExisting && !fixOnly) {
        console.log("\n🗑️  Видалення існуючих таблиць...");
        await this.pool.query("DROP TABLE IF EXISTS user_history CASCADE");
        await this.pool.query("DROP TABLE IF EXISTS tasks CASCADE");
        await this.pool.query("DROP TABLE IF EXISTS users CASCADE");
        console.log("✅ Існуючі таблиці видалено");
      }

      if (!fixOnly) {
        console.log("\n🏗️  Створення таблиць...");
        await this.createUsersTable();
        await this.createTasksTable();
        await this.createUserHistoryTable();
      }

      console.log("\n🔧 Виправлення структури...");
      await this.addMissingColumns();

      console.log("\n📊 Створення індексів...");
      await this.createIndexes();

      if (addTestData && !fixOnly) {
        console.log("\n📝 Додавання тестових даних...");
        await this.insertTestData();
      }

      console.log("\n🎉 База даних успішно ініціалізована!");
      return { success: true, message: "База даних успішно ініціалізована!" };
    } catch (error) {
      console.error("\n❌ Помилка ініціалізації бази даних:", error.message);
      return { success: false, error: error.message };
    }
  }
}

// Створення екземпляра менеджера БД
const dbManager = new DatabaseManager(pool);

// ===== MIDDLEWARE =====
app.use(
  helmet({
    contentSecurityPolicy: false, // Вимкнути CSP для розробки
  })
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Обслуговування статичних файлів
app.use(express.static(path.join(__dirname)));
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Обмеження кількості запитів
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 хвилин
  max: 100,
  message: { error: "Забагато запитів з вашої IP адреси, спробуйте пізніше" },
});
app.use("/api/", limiter);

// Налаштування multer для завантаження файлів
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = "uploads/avatars";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "avatar-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Дозволені тільки файли зображень"));
    }
  },
});

// Middleware для автентифікації
async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Токен доступу відсутній" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query(
      "SELECT id, email FROM users WHERE id = $1",
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: "Користувача не знайдено" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Недійсний токен" });
  }
}

// Утилітарна функція для додавання до історії
async function addToUserHistory(userId, type, action, details = "") {
  try {
    await pool.query(
      "INSERT INTO user_history (user_id, type, action, details) VALUES ($1, $2, $3, $4)",
      [userId, type, action, details]
    );
  } catch (error) {
    console.error("Помилка додавання до історії:", error);
  }
}

// ===== API МАРШРУТИ ДЛЯ УПРАВЛІННЯ БД =====

// Ініціалізація БД
app.post("/api/admin/database/init", async (req, res) => {
  try {
    const {
      dropExisting = false,
      addTestData = true,
      fixOnly = false,
    } = req.body;
    const result = await dbManager.initializeDatabase({
      dropExisting,
      addTestData,
      fixOnly,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Перевірка стану БД
app.get("/api/admin/database/status", async (req, res) => {
  try {
    const info = await dbManager.getDatabaseInfo();
    res.json(info);
  } catch (error) {
    res.status(500).json({ status: "error", error: error.message });
  }
});

// Виправлення структури БД
app.post("/api/admin/database/fix", async (req, res) => {
  try {
    const result = await dbManager.initializeDatabase({
      fixOnly: true,
      addTestData: false,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== МАРШРУТИ ДЛЯ СТАТИЧНИХ СТОРІНОК =====

// Кореневий маршрут - перенаправлення на auth.html
app.get("/", (req, res) => {
  res.redirect("/auth.html");
});

// Маршрут для перевірки чи користувач авторизований
app.get("/check-auth", (req, res) => {
  res.sendFile(path.join(__dirname, "auth.html"));
});

// ===== API МАРШРУТИ ДЛЯ АВТОРИЗАЦІЇ =====

// Реєстрація користувача
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  // Валідація
  if (!name || !email || !password) {
    return res.status(400).json({
      error: "Всі поля обов'язкові",
      field: !name
        ? "registerName"
        : !email
        ? "registerEmail"
        : "registerPassword",
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: "Пароль повинен містити мінімум 6 символів",
      field: "registerPassword",
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      error: "Введіть коректний email",
      field: "registerEmail",
    });
  }

  try {
    // Перевірка чи існує користувач
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        error: "Користувач з таким email вже існує",
        field: "registerEmail",
      });
    }

    // Хешування пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    // Створення користувача
    const result = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *",
      [name, email, hashedPassword]
    );

    const user = result.rows[0];

    // Додавання до історії
    await addToUserHistory(user.id, "auth", "Реєстрація акаунта");

    res.status(201).json({
      message: "Користувач створений успішно",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || "/placeholder.svg?height=120&width=120",
        registrationDate: user.registration_date,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Помилка реєстрації:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Вхід користувача
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: "Email та пароль обов'язкові",
      field: !email ? "loginEmail" : "loginPassword",
    });
  }

  try {
    // Пошук користувача
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "Користувача з таким email не знайдено",
        field: "loginEmail",
      });
    }

    const user = result.rows[0];

    // Перевірка пароля
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        error: "Невірний пароль",
        field: "loginPassword",
      });
    }

    // Генерація токена
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "24h",
    });

    // Додавання до історії
    await addToUserHistory(user.id, "auth", "Вхід в систему");

    res.json({
      message: "Успішний вхід",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        registrationDate: user.registration_date,
        role: user.role,
        tfaEnabled: user.tfa_enabled,
      },
    });
  } catch (error) {
    console.error("Помилка входу:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Перевірка токена
app.get("/api/auth/verify", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, avatar, registration_date, role, tfa_enabled FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Користувача не знайдено" });
    }

    const user = result.rows[0];
    res.json({
      valid: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        registrationDate: user.registration_date,
        role: user.role,
        tfaEnabled: user.tfa_enabled,
      },
    });
  } catch (error) {
    console.error("Помилка перевірки токена:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Відновлення пароля
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      error: "Email обов'язковий",
      field: "forgotEmail",
    });
  }

  try {
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: "Користувача з таким email не знайдено",
        field: "forgotEmail",
      });
    }

    // В реальному додатку тут би був код для надсилання email
    res.json({
      message: "Інструкції для відновлення пароля надіслано на ваш email",
    });
  } catch (error) {
    console.error("Помилка відновлення пароля:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// ===== API МАРШРУТИ ДЛЯ КОРИСТУВАЧА =====

// Отримання профілю користувача
app.get("/api/user/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, avatar, registration_date, role, tfa_enabled FROM users WHERE id = $1",
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Користувача не знайдено" });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      registrationDate: user.registration_date,
      role: user.role,
      tfaEnabled: user.tfa_enabled,
    });
  } catch (error) {
    console.error("Помилка отримання профілю:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Оновлення профілю користувача
app.put("/api/user/profile", authenticateToken, async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: "Ім'я та email обов'язкові" });
  }

  try {
    // Перевірка унікальності email
    const emailCheck = await pool.query(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [email, req.user.id]
    );

    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: "Email вже використовується" });
    }

    // Оновлення користувача
    const result = await pool.query(
      "UPDATE users SET name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, name, email, avatar, registration_date, role, tfa_enabled",
      [name, email, req.user.id]
    );

    const user = result.rows[0];
    await addToUserHistory(req.user.id, "profile", "Оновлено профіль");

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      registrationDate: user.registration_date,
      role: user.role,
      tfaEnabled: user.tfa_enabled,
    });
  } catch (error) {
    console.error("Помилка оновлення профілю:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Завантаження аватара
app.post(
  "/api/user/avatar",
  authenticateToken,
  upload.single("avatar"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Файл не завантажено" });
    }

    try {
      // Отримання старого аватара
      const oldAvatarResult = await pool.query(
        "SELECT avatar FROM users WHERE id = $1",
        [req.user.id]
      );
      const oldAvatar = oldAvatarResult.rows[0]?.avatar;

      // Видалення старого аватара
      if (oldAvatar && oldAvatar.startsWith("/uploads/")) {
        const oldPath = path.join(__dirname, oldAvatar);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      const avatarPath = `/uploads/avatars/${req.file.filename}`;

      // Оновлення аватара в БД
      await pool.query(
        "UPDATE users SET avatar = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [avatarPath, req.user.id]
      );

      await addToUserHistory(req.user.id, "avatar", "Змінено аватар");

      res.json({ avatar: avatarPath });
    } catch (error) {
      console.error("Помилка завантаження аватара:", error);
      res.status(500).json({ error: "Внутрішня помилка сервера" });
    }
  }
);

// ===== API МАРШРУТИ ДЛЯ ЗАВДАНЬ =====

// Отримання завдань користувача
app.get("/api/user/tasks", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, description, priority, deadline, tags, completed, created_at FROM tasks WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );

    const tasks = result.rows.map((task) => ({
      id: task.id,
      name: task.name,
      description: task.description,
      priority: task.priority,
      deadline: task.deadline,
      tags: task.tags || [],
      completed: task.completed,
      createdAt: task.created_at,
    }));

    res.json(tasks);
  } catch (error) {
    console.error("Помилка отримання завдань:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Збереження завдань користувача
app.post("/api/user/tasks", authenticateToken, async (req, res) => {
  const { tasks } = req.body;

  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: "Завдання повинні бути масивом" });
  }

  try {
    // Видалення старих завдань
    await pool.query("DELETE FROM tasks WHERE user_id = $1", [req.user.id]);

    // Додавання нових завдань
    for (const task of tasks) {
      await pool.query(
        "INSERT INTO tasks (user_id, name, description, priority, deadline, tags, completed, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
          req.user.id,
          task.name,
          task.description || null,
          task.priority || "medium",
          task.deadline || null,
          task.tags || [],
          task.completed || false,
          task.createdAt || new Date().toISOString(),
        ]
      );
    }

    await addToUserHistory(req.user.id, "tasks", "Оновлено завдання");

    res.json({ message: "Завдання збережено" });
  } catch (error) {
    console.error("Помилка збереження завдань:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Отримання історії дій
app.get("/api/user/history", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, type, action, details, created_at FROM user_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );

    const history = result.rows.map((item) => ({
      id: item.id,
      type: item.type,
      action: item.action,
      details: item.details,
      timestamp: item.created_at,
    }));

    res.json(history);
  } catch (error) {
    console.error("Помилка отримання історії:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Очищення історії
app.delete("/api/user/history", authenticateToken, async (req, res) => {
  try {
    await pool.query("DELETE FROM user_history WHERE user_id = $1", [
      req.user.id,
    ]);
    res.json({ message: "Історію очищено" });
  } catch (error) {
    console.error("Помилка очищення історії:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// Статистика користувача
app.get("/api/user/statistics", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE completed = true) as completed, COUNT(*) FILTER (WHERE completed = false) as active, COUNT(*) FILTER (WHERE deadline < CURRENT_DATE AND completed = false) as overdue FROM tasks WHERE user_id = $1",
      [req.user.id]
    );

    const stats = result.rows[0];
    const total = Number.parseInt(stats.total);
    const completed = Number.parseInt(stats.completed);
    const active = Number.parseInt(stats.active);
    const overdue = Number.parseInt(stats.overdue);

    res.json({
      total,
      completed,
      active,
      overdue,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    });
  } catch (error) {
    console.error("Помилка отримання статистики:", error);
    res.status(500).json({ error: "Внутрішня помилка сервера" });
  }
});

// ===== ОБРОБКА ПОМИЛОК =====
app.use((error, req, res, next) => {
  console.error(error);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Файл занадто великий" });
    }
  }

  res.status(500).json({ error: "Внутрішня помилка сервера" });
});

// 404 обробник
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "Ендпоінт не знайдено" });
  } else {
    res.status(404).sendFile(path.join(__dirname, "auth.html"));
  }
});

// ===== PWA API МАРШРУТИ =====

// Підписка на push сповіщення
app.post("/api/push/subscribe", authenticateToken, async (req, res) => {
  try {
    const subscription = req.body;

    // Збереження підписки в БД (можна додати таблицю push_subscriptions)
    console.log("📬 Нова підписка на push:", subscription);

    res.json({ success: true, message: "Підписка збережена" });
  } catch (error) {
    console.error("Помилка збереження підписки:", error);
    res.status(500).json({ error: "Помилка збереження підписки" });
  }
});

// Аналітика PWA
app.post("/api/analytics/pwa", (req, res) => {
  try {
    const analytics = req.body;
    console.log("📊 PWA Analytics:", analytics);

    res.json({ success: true });
  } catch (error) {
    console.error("Помилка аналітики:", error);
    res.status(500).json({ error: "Помилка аналітики" });
  }
});

// ===== ЗАПУСК СЕРВЕРА =====
async function startServer() {
  try {
    // Автоматична ініціалізація БД при запуску
    console.log("🔄 Перевірка та ініціалізація бази даних...");
    await dbManager.initializeDatabase({
      dropExisting: false,
      addTestData: true,
      fixOnly: false,
    });

    // Створення необхідних директорій
    const dirs = ["uploads/avatars"];
    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Запуск сервера
    app.listen(PORT, () => {
      console.log("\n" + "=".repeat(60));
      console.log("🚀 TO DO LIST SERVER ЗАПУЩЕНО!");
      console.log("=".repeat(60));
      console.log(`📱 Головна сторінка: http://localhost:${PORT}`);
      console.log(`🔐 Авторизація: http://localhost:${PORT}/auth.html`);
      console.log(`📋 Завдання: http://localhost:${PORT}/index.html`);
      console.log(`👤 Профіль: http://localhost:${PORT}/profile.html`);
      console.log("\n🔧 API для управління БД:");
      console.log(`   POST /api/admin/database/init - Ініціалізація БД`);
      console.log(`   GET  /api/admin/database/status - Стан БД`);
      console.log(`   POST /api/admin/database/fix - Виправлення БД`);
      console.log("\n✅ Сервер готовий до роботи!");
      console.log("=".repeat(60));
    });
  } catch (error) {
    console.error("💥 Критична помилка запуску сервера:", error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("🛑 Сервер зупиняється...");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 Сервер зупиняється...");
  await pool.end();
  process.exit(0);
});

// Запуск сервера
startServer();

module.exports = app;
