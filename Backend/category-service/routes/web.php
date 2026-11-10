<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return redirect('/api/documentation');
});

Route::get('/swagger-ui', function () {
    return redirect('/api/documentation');
});
