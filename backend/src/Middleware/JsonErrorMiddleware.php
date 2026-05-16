<?php

declare(strict_types=1);

namespace App\Middleware;

use JsonException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

final class JsonErrorMiddleware implements MiddlewareInterface
{
    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        if (!$this->shouldValidateJson($request)) {
            return $handler->handle($request);
        }

        $raw = (string) $request->getBody();
        if ($raw === '') {
            return $handler->handle($request);
        }

        try {
            json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return self::errorResponse('Некорректный JSON в теле запроса', 400);
        }

        $request->getBody()->rewind();

        return $handler->handle($request);
    }

    public static function errorResponse(string $message, int $status = 400): ResponseInterface
    {
        $response = new Response($status);
        $response->getBody()->write(json_encode(['error' => $message], JSON_THROW_ON_ERROR));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Access-Control-Allow-Origin', '*');
    }

    private function shouldValidateJson(ServerRequestInterface $request): bool
    {
        if (!in_array($request->getMethod(), ['POST', 'PUT', 'PATCH'], true)) {
            return false;
        }

        $contentType = strtolower($request->getHeaderLine('Content-Type'));

        return $contentType === '' || str_contains($contentType, 'application/json');
    }
}
