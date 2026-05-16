-- Initial schema (runs once on first `docker compose up` when db volume is empty).
CREATE TABLE IF NOT EXISTS tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    priority TINYINT UNSIGNED NOT NULL DEFAULT 2,
    is_burning TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_priority CHECK (priority IN (1, 2, 3))
);

INSERT INTO tasks (title, priority, is_burning) VALUES
    ('Настроить Docker', 1, 1),
    ('Подключить Slim API', 2, 0),
    ('Собрать Vue фронтенд', 3, 0);
