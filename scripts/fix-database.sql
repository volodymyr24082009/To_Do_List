-- Скрипт для виправлення існуючої бази даних

-- Перевірка та додавання колонки avatar, якщо вона не існує
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'avatar') THEN
        ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '/placeholder.svg?height=120&width=120';
        RAISE NOTICE 'Додано колонку avatar до таблиці users';
    END IF;
END $$;

-- Перевірка та додавання колонки registration_date, якщо вона не існує
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'registration_date') THEN
        ALTER TABLE users ADD COLUMN registration_date DATE DEFAULT CURRENT_DATE;
        RAISE NOTICE 'Додано колонку registration_date до таблиці users';
    END IF;
END $$;

-- Перевірка та додавання колонки role, якщо вона не існує
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'user';
        RAISE NOTICE 'Додано колонку role до таблиці users';
    END IF;
END $$;

-- Перевірка та додавання колонки tfa_enabled, якщо вона не існує
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'tfa_enabled') THEN
        ALTER TABLE users ADD COLUMN tfa_enabled BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Додано колонку tfa_enabled до таблиці users';
    END IF;
END $$;

-- Перевірка та додавання колонки tfa_secret, якщо вона не існує
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'tfa_secret') THEN
        ALTER TABLE users ADD COLUMN tfa_secret TEXT;
        RAISE NOTICE 'Додано колонку tfa_secret до таблиці users';
    END IF;
END $$;

-- Перевірка та додавання колонки created_at, якщо вона не існує
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'created_at') THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Додано колонку created_at до таблиці users';
    END IF;
END $$;

-- Перевірка та додавання колонки updated_at, якщо вона не існує
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Додано колонку updated_at до таблиці users';
    END IF;
END $$;

-- Оновлення існуючих користувачів з дефолтними значеннями
UPDATE users 
SET 
    avatar = COALESCE(avatar, '/placeholder.svg?height=120&width=120'),
    registration_date = COALESCE(registration_date, CURRENT_DATE),
    role = COALESCE(role, 'user'),
    tfa_enabled = COALESCE(tfa_enabled, FALSE),
    created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
    updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
WHERE avatar IS NULL OR registration_date IS NULL OR role IS NULL OR tfa_enabled IS NULL OR created_at IS NULL OR updated_at IS NULL;

-- Створення таблиці tasks, якщо вона не існує
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

-- Створення таблиці user_history, якщо вона не існує
CREATE TABLE IF NOT EXISTS user_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Створення індексів, якщо вони не існують
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
CREATE INDEX IF NOT EXISTS idx_user_history_user_id ON user_history(user_id);

-- Повідомлення про завершення
DO $$
BEGIN
    RAISE NOTICE 'Структура бази даних перевірена та оновлена!';
END $$;
