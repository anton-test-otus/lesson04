<?php

declare(strict_types=1);

namespace App\Support;

final class WildcardSearch
{
    /**
     * Шаблон для SQL LIKE:
     * - звёздочка только внутри слова (пропуск символов);
     * - слева и справа всегда допускаются любые символы (неявные %).
     */
    public static function toSqlLike(string $pattern): ?string
    {
        $pattern = trim($pattern);

        // Краевые * не нужны — совпадение ищется внутри всего названия задачи.
        $pattern = trim($pattern, '*');

        if ($pattern === '') {
            return null;
        }

        $escaped = str_replace(
            ['\\', '%', '_'],
            ['\\\\', '\\%', '\\_'],
            $pattern
        );

        $like = str_replace('*', '%', $escaped);
        $like = preg_replace('/%+/', '%', $like) ?? $like;

        return '%' . $like . '%';
    }
}
