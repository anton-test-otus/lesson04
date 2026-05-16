<?php

declare(strict_types=1);

namespace App\Dto;

final class TaskFilter
{
    /** @param list<int> $priorities */
    public function __construct(
        public readonly ?string $titlePattern,
        public readonly array $priorities,
        public readonly bool $burningOnly,
    ) {
    }

    public function hasTitlePattern(): bool
    {
        return $this->titlePattern !== null && $this->titlePattern !== '';
    }

    public function hasPriorities(): bool
    {
        return $this->priorities !== [];
    }
}
