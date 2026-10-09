<?php

use App\Http\Controllers\ProjectController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "web" middleware group. Make something great!
|
*/

Route::get('/', function () {
    return view('welcome');
});

/*
 * Public file endpoint for the URL stored in tb_files.path
 * ("<base>/files/<nama>"). Only files inside the configured project-file
 * directory are served and the route pattern rejects path separators, so it
 * cannot be used to read arbitrary files. Uploaded names are cryptographically
 * random, matching the already-public storage/app/public/project-files folder
 * (served via the public/storage junction).
 */
Route::get('/files/{filename}', [ProjectController::class, 'serveFile'])
    ->where('filename', '[A-Za-z0-9._-]+');
