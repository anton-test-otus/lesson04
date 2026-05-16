<?php

declare(strict_types=1);

namespace App\Support;

use App\Dto\TaskFilter;

final class TaskFilterParser
{
    /**
     * @param array<string, mixed> $query
     * @return array{filter: TaskFilter}|array{error: string}
     */
    public static function fromQueryParams(array $query): array
    {
        $titlePattern = null;
        if (array_key_exists('q', $query)) {
            $titlePattern = trim((string) $query['q']);
            if ($titlePattern === '') {
                $titlePattern = null;
            }
        }

        $priorities = self::parsePriorities($query);
        if ($priorities === null) {
            return ['error' => 'Priority must be 1, 2 or 3'];
        }

        $burningOnly = filter_var(
            $query['burning_only'] ?? $query['only_burning'] ?? false,
            FILTER_VALIDATE_BOOLEAN
        );

        return [
            'filter' => new TaskFilter($titlePattern, $priorities, $burningOnly),
        ];
    }

    /** @return list<int>|null */
    private static function parsePriorities(array $query): ?array
    {
        $raw = [];

        if (isset($query['priority'])) {
            $raw = is_array($query['priority'])
                ? $query['priority']
                : explode(',', (string) $query['priority']);
        } elseif (isset($query['priorities'])) {
            $raw = explode(',', (string) $query['priorities']);
        }

        if ($raw === []) {
            return [];
        }

        $priorities = [];

        foreach ($raw as $value) {
            $value = trim((string) $value);
            if ($value === '') {
                continue;
            }

            if (!ctype_digit($value)) {
                return null;
            }

            $priority = (int) $value;

            if (!in_array($priority, [1, 2, 3], true)) {
                return null;
            }

            if (!in_array($priority, $priorities, true)) {
                $priorities[] = $priority;
            }
        }

        return $priorities;
    }
}
