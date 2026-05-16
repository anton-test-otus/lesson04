<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\TaskRepository;
use App\Support\TaskFilterParser;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Psr7\Response;

final class TaskController
{
    public function __construct(private readonly TaskRepository $tasks)
    {
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, $this->tasks->findAll());
    }

    public function filter(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $parsed = TaskFilterParser::fromQueryParams($request->getQueryParams());

        if (isset($parsed['error'])) {
            return $this->json($response, ['error' => $parsed['error']], 422);
        }

        $tasks = $this->tasks->findFiltered($parsed['filter']);

        return $this->json($response, $tasks);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = (array) $request->getParsedBody();
        $title = trim((string) ($body['title'] ?? ''));

        if ($title === '') {
            return $this->json($response, ['error' => 'Title is required'], 422);
        }

        $priority = self::parsePriority($body['priority'] ?? 2);
        if ($priority === null) {
            return $this->json($response, ['error' => 'Priority must be 1, 2 or 3'], 422);
        }

        $task = $this->tasks->create(
            $title,
            $priority,
            self::parseBurning($body['is_burning'] ?? false)
        );

        return $this->json($response, $task, 201);
    }

    public function createBatch(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = (array) $request->getParsedBody();
        $titles = self::parseCommaSeparated((string) ($body['titles'] ?? ''));

        if ($titles === []) {
            return $this->json($response, ['error' => 'At least one title is required'], 422);
        }

        $created = $this->tasks->createMany($titles);

        return $this->json($response, ['created' => $created, 'count' => count($created)], 201);
    }

    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (int) $args['id'];
        $body = (array) $request->getParsedBody();

        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '') {
            return $this->json($response, ['error' => 'Title is required'], 422);
        }

        $priority = self::parsePriority($body['priority'] ?? null);
        if ($priority === null) {
            return $this->json($response, ['error' => 'Priority must be 1, 2 or 3'], 422);
        }

        $task = $this->tasks->update(
            $id,
            $title,
            $priority,
            self::parseBurning($body['is_burning'] ?? false)
        );

        if ($task === null) {
            return $this->json($response, ['error' => 'Task not found'], 404);
        }

        return $this->json($response, $task);
    }

    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (int) $args['id'];

        if (!$this->tasks->delete($id)) {
            return $this->json($response, ['error' => 'Task not found'], 404);
        }

        return $response->withStatus(204);
    }

    /** @return list<string> */
    private static function parseCommaSeparated(string $raw): array
    {
        return array_values(array_filter(
            array_map('trim', explode(',', $raw)),
            static fn (string $title): bool => $title !== ''
        ));
    }

    private static function parsePriority(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        $priority = (int) $value;

        return in_array($priority, [1, 2, 3], true) ? $priority : null;
    }

    private static function parseBurning(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    private function json(ResponseInterface $response, mixed $data, int $status = 200): ResponseInterface
    {
        $response = new Response($status);
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
