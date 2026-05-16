<?php

declare(strict_types=1);

namespace App;

use App\Controller\TaskController;
use App\Middleware\CorsMiddleware;
use Slim\App;

final class Application
{
    public function __construct(private readonly App $app)
    {
    }

    public function register(): void
    {
        $this->app->addBodyParsingMiddleware();
        $this->app->addRoutingMiddleware();
        $this->app->add(new CorsMiddleware());
        $this->app->addErrorMiddleware(
            $this->app->getContainer()->get('settings')['displayErrorDetails'],
            true,
            true
        );

        $this->registerRoutes();
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
