const { Pool } = require("pg");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_5AaDEnCX3cLf@ep-soft-credit-adaqhtk9-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function checkDatabase() {
  try {
    console.log("🔍 Перевірка структури бази даних...\n");

    // Перевірка таблиць
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log("📋 Існуючі таблиці:");
    tablesResult.rows.forEach((row) => {
      console.log(`  - ${row.table_name}`);
    });

    // Перевірка колонок таблиці users
    const usersColumnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position;
    `);

    console.log("\n👤 Колонки таблиці users:");
    if (usersColumnsResult.rows.length === 0) {
      console.log("  ❌ Таблиця users не існує!");
    } else {
      usersColumnsResult.rows.forEach((row) => {
        console.log(
          `  - ${row.column_name} (${row.data_type}) ${
            row.is_nullable === "NO" ? "NOT NULL" : "NULL"
          }`
        );
      });
    }

    // Перевірка колонок таблиці tasks
    const tasksColumnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'tasks'
      ORDER BY ordinal_position;
    `);

    console.log("\n📝 Колонки таблиці tasks:");
    if (tasksColumnsResult.rows.length === 0) {
      console.log("  ❌ Таблиця tasks не існує!");
    } else {
      tasksColumnsResult.rows.forEach((row) => {
        console.log(
          `  - ${row.column_name} (${row.data_type}) ${
            row.is_nullable === "NO" ? "NOT NULL" : "NULL"
          }`
        );
      });
    }

    // Перевірка кількості користувачів
    const usersCountResult = await pool.query(
      "SELECT COUNT(*) as count FROM users"
    );
    console.log(
      `\n👥 Кількість користувачів: ${usersCountResult.rows[0].count}`
    );

    // Перевірка кількості завдань
    const tasksCountResult = await pool.query(
      "SELECT COUNT(*) as count FROM tasks"
    );
    console.log(`📋 Кількість завдань: ${tasksCountResult.rows[0].count}`);

    console.log("\n✅ Перевірка завершена!");
  } catch (error) {
    console.error("❌ Помилка перевірки бази даних:", error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();
