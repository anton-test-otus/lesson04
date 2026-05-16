<?php

declare(strict_types=1);

use App\Repository\TaskRepository;
use PDO;
use Psr\Container\ContainerInterface;

$settings = require __DIR__ . '/settings.php';

return [
    'settings' => $settings,

    PDO::class => function () use ($settings): PDO {
        $db = $settings['db'];
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            $db['host'],
            $db['port'],
            $db['name']
        );

        $pdo = new PDO($dsn, $db['user'], $db['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec('SET NAMES utf8mb4');

        return $pdo;
    },

    TaskRepository::class => function (ContainerInterface $c): TaskRepository {
        return new TaskRepository($c->get(PDO::class));
    },
];
