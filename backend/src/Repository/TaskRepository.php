<?php

declare(strict_types=1);

namespace App\Repository;

use App\Dto\TaskFilter;
use App\Support\WildcardSearch;
use PDO;

final class TaskRepository
{
    private const SELECT_FIELDS = 'id, title, priority, is_burning, created_at';

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function findAll(): array
    {
        $stmt = $this->pdo->query(
            'SELECT ' . self::SELECT_FIELDS . '
             FROM tasks
             ORDER BY is_burning DESC, priority ASC, id DESC'
        );

        return array_map($this->hydrate(...), $stmt->fetchAll());
    }

    public function findFiltered(TaskFilter $filter): array
    {
        $conditions = [];
        $params = [];

        if ($filter->hasTitlePattern()) {
            $like = WildcardSearch::toSqlLike($filter->titlePattern);
            if ($like !== null) {
                $conditions[] = 'title LIKE :title_pattern';
                $params['title_pattern'] = $like;
            }
        }

        if ($filter->hasPriorities()) {
            $placeholders = [];
            foreach ($filter->priorities as $index => $priority) {
                $key = 'priority_' . $index;
                $placeholders[] = ':' . $key;
                $params[$key] = $priority;
            }
            $conditions[] = 'priority IN (' . implode(', ', $placeholders) . ')';
        }

        if ($filter->burningOnly) {
            $conditions[] = 'is_burning = 1';
        }

        $sql = 'SELECT ' . self::SELECT_FIELDS . ' FROM tasks';

        if ($conditions !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }

        $sql .= ' ORDER BY is_burning DESC, priority ASC, id DESC';

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        return array_map($this->hydrate(...), $stmt->fetchAll());
    }

    public function create(string $title, int $priority = 2, bool $isBurning = false): array
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO tasks (title, priority, is_burning) VALUES (:title, :priority, :is_burning)'
        );
        $stmt->execute([
            'title' => $title,
            'priority' => $priority,
            'is_burning' => $isBurning ? 1 : 0,
        ]);

        return $this->findById((int) $this->pdo->lastInsertId());
    }

    /** @param list<string> $titles */
    public function createMany(array $titles): array
    {
        if ($titles === []) {
            return [];
        }

        $this->pdo->beginTransaction();

        try {
            $created = [];
            $stmt = $this->pdo->prepare(
                'INSERT INTO tasks (title, priority, is_burning) VALUES (:title, 2, 0)'
            );

            foreach ($titles as $title) {
                $stmt->execute(['title' => $title]);
                $created[] = $this->findById((int) $this->pdo->lastInsertId());
            }

            $this->pdo->commit();

            return $created;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function update(int $id, string $title, int $priority, bool $isBurning): ?array
    {
        $stmt = $this->pdo->prepare(
            'UPDATE tasks
             SET title = :title, priority = :priority, is_burning = :is_burning
             WHERE id = :id'
        );
        $stmt->execute([
            'id' => $id,
            'title' => $title,
            'priority' => $priority,
            'is_burning' => $isBurning ? 1 : 0,
        ]);

        if ($stmt->rowCount() === 0 && $this->findById($id) === null) {
            return null;
        }

        return $this->findById($id);
    }

    public function delete(int $id): bool
    {
        $stmt = $this->pdo->prepare('DELETE FROM tasks WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return $stmt->rowCount() > 0;
    }

    public function findById(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ' . self::SELECT_FIELDS . ' FROM tasks WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row ? $this->hydrate($row) : null;
    }

    private function hydrate(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'title' => $row['title'],
            'priority' => (int) $row['priority'],
            'is_burning' => (bool) $row['is_burning'],
            'created_at' => $row['created_at'],
        ];
    }
}
