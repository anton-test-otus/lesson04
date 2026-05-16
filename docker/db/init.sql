-- -*- coding: utf-8 -*-
-- Initial schema (runs once on first `docker compose up` when the db volume is empty).
-- Priority: NULL = empty status; 1 = high, 2 = medium, 3 = low.

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

ALTER DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    priority TINYINT UNSIGNED NULL DEFAULT NULL,
    is_burning TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tasks (title, priority, is_burning) VALUES
    ('Настроить Docker', 1, 1),
    ('Подключить Slim API', NULL, 0),
    ('Собрать Vue фронтенд', 3, 0);
