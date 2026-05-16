-- Для уже существующего volume:
-- docker compose exec -T db mysql -uapp -psecret app < docker/db/migrate-priority-burning.sql

ALTER TABLE tasks
    ADD COLUMN priority TINYINT UNSIGNED NOT NULL DEFAULT 2 AFTER title;

ALTER TABLE tasks
    ADD COLUMN is_burning TINYINT(1) NOT NULL DEFAULT 0 AFTER priority;
