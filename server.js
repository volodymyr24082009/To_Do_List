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

// Тестування підключення до БД
pool.connect((err, client, release) => {
  if (err) {
    console.error("❌ Помилка підключення до БД:", err);
  } else {
    console.log("✅ Успішне підключення до PostgreSQL");
    release();
  }
});

// Middleware
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

// МАРШРУТИ ДЛЯ СТАТИЧНИХ СТОРІНОК

// Кореневий маршрут - перенаправлення на auth.html
app.get("/", (req, res) => {
  res.redirect("/auth.html");
});

// Маршрут для перевірки чи користувач авторизований
app.get("/check-auth", (req, res) => {
  res.sendFile(path.join(__dirname, "auth.html"));
});

// API МАРШРУТИ ДЛЯ АВТОРИЗАЦІЇ

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

// API МАРШРУТИ ДЛЯ КОРИСТУВАЧА

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

// API МАРШРУТИ ДЛЯ ЗАВДАНЬ

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

// Обробка помилок
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

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущено на порту ${PORT}`);
  console.log(`📱 Головна сторінка: http://localhost:${PORT}`);
  console.log(`🔐 Авторизація: http://localhost:${PORT}/auth.html`);
  console.log(`📋 Завдання: http://localhost:${PORT}/index.html`);
  console.log(`👤 Профіль: http://localhost:${PORT}/profile.html`);

  // Створення необхідних директорій
  const dirs = ["uploads/avatars"];
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Сервер зупиняється...");
  pool.end();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Сервер зупиняється...");
  pool.end();
  process.exit(0);
});

module.exports = app;
