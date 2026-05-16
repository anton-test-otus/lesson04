<?php

declare(strict_types=1);

namespace App;

use App\Controller\TaskController;
use App\Middleware\CorsMiddleware;
use App\Middleware\JsonErrorMiddleware;
use JsonException;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Exception\HttpException;
use Throwable;

final class Application
{
    public function __construct(private readonly App $app)
    {
    }

    public function register(): void
    {
        $displayDetails = $this->app->getContainer()->get('settings')['displayErrorDetails'];

        // https://www.slimframework.com/docs/v4/middleware/error-handling.html
        // RoutingMiddleware — до ErrorMiddleware; ErrorMiddleware — последним.
        $this->app->addRoutingMiddleware();
        $this->app->addBodyParsingMiddleware();
        $this->app->add(new CorsMiddleware());
        $this->app->add(new JsonErrorMiddleware());

        $errorMiddleware = $this->app->addErrorMiddleware($displayDetails, true, true);
        $errorMiddleware->setDefaultErrorHandler(
            function (
                ServerRequestInterface $request,
                Throwable $exception,
                bool $displayErrorDetails,
                bool $logErrors,
                bool $logErrorDetails
            ): ResponseInterface {
                return self::renderJsonError($exception, $displayErrorDetails);
            }
        );

        $this->registerRoutes();
    }

    private static function renderJsonError(Throwable $exception, bool $displayDetails): ResponseInterface
    {
        if ($exception instanceof JsonException) {
            return JsonErrorMiddleware::errorResponse('Некорректный JSON в теле запроса', 400);
        }

        $status = 500;
        $message = 'Внутренняя ошибка сервера';

        // HttpNotFoundException и др. — HttpSpecializedException, код в getCode()
        // https://github.com/slimphp/Slim/blob/4.x/Slim/Exception/HttpSpecializedException.php
        if ($exception instanceof HttpException) {
            $code = $exception->getCode();
            if ($code >= 400 && $code < 600) {
                $status = $code;
            }
            $message = $exception->getMessage();
        } elseif ($displayDetails) {
            $message = $exception->getMessage();
        }

        return JsonErrorMiddleware::errorResponse($message, $status);
    }

    private function registerRoutes(): void
    {
        $app = $this->app;

        $app->get('/api/health', function ($request, $response) {
            $payload = json_encode(['status' => 'ok'], JSON_THROW_ON_ERROR);
            $response->getBody()->write($payload);

            return $response->withHeader('Content-Type', 'application/json');
        });

        $app->group('/api/tasks', function ($group) {
            $group->get('/filter', [TaskController::class, 'filter']);
            $group->get('', [TaskController::class, 'index']);
            $group->post('/batch', [TaskController::class, 'createBatch']);
            $group->post('/{id}/update', [TaskController::class, 'update']);
            $group->post('', [TaskController::class, 'create']);
            $group->map(['PUT', 'PATCH'], '/{id}', [TaskController::class, 'update']);
            $group->delete('/{id}', [TaskController::class, 'delete']);
        });
    }
}
