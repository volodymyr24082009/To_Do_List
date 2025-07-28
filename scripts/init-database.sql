-- Видалення існуючих таблиць (якщо потрібно)
DROP TABLE IF EXISTS user_history CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Створення таблиці користувачів
CREATE TABLE users (
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

-- Створення таблиці завдань
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    priority VARCHAR(20) DEFAULT 'medium',
    deadline DATE,
    tags TEXT[], -- PostgreSQL array для тегів
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Створення таблиці історії дій
CREATE TABLE user_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Створення індексів для оптимізації
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_completed ON tasks(completed);
CREATE INDEX idx_user_history_user_id ON user_history(user_id);

-- Вставка тестового користувача (пароль: password123)
INSERT INTO users (name, email, password) 
VALUES ('Іван Петренко', 'ivan.petrenko@example.com', '$2b$10$rOzJqQjQjQjQjQjQjQjQjOzJqQjQjQjQjQjQjQjQjQjQjQjQjQjQjQ')
ON CONFLICT (email) DO NOTHING;

-- Додавання тестових завдань для демонстрації
INSERT INTO tasks (user_id, name, description, priority, deadline, tags, completed) 
SELECT 
    u.id,
    'Перше завдання',
    'Це тестове завдання для демонстрації функціональності',
    'high',
    CURRENT_DATE + INTERVAL '7 days',
    ARRAY['тест', 'демо'],
    false
FROM users u 
WHERE u.email = 'ivan.petrenko@example.com'
ON CONFLICT DO NOTHING;

-- Повідомлення про успішне створення
DO $$
BEGIN
    RAISE NOTICE 'База даних успішно ініціалізована!';
    RAISE NOTICE 'Створено таблиці: users, tasks, user_history';
    RAISE NOTICE 'Додано тестового користувача: ivan.petrenko@example.com (пароль: password123)';
END $$;
