<?php

declare(strict_types=1);

return [
    'displayErrorDetails' => filter_var(getenv('APP_DEBUG') ?: 'true', FILTER_VALIDATE_BOOLEAN),
    'db' => [
        'host' => getenv('DB_HOST') ?: 'db',
        'port' => getenv('DB_PORT') ?: '3306',
        'name' => getenv('DB_NAME') ?: 'app',
        'user' => getenv('DB_USER') ?: 'app',
        'pass' => getenv('DB_PASS') ?: 'secret',
    ],
];
