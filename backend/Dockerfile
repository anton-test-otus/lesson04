FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json ./
RUN composer install --no-dev --optimize-autoloader --no-interaction

FROM php:8.2-apache
RUN docker-php-ext-install pdo pdo_mysql \
    && a2enmod rewrite \
    && sed -i 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html
COPY --from=vendor /app/vendor ./vendor
COPY . .

EXPOSE 80
