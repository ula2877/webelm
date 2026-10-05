<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Profile Write Permission
    |--------------------------------------------------------------------------
    |
    | The `webelmech` database is currently declared READ-ONLY by project
    | policy: no INSERT / UPDATE / DELETE / ALTER / migrations are allowed.
    |
    | Profile writes (UPDATE tb_user for username, nama, foto and password)
    | are therefore implemented but GATED behind this flag, which defaults to
    | false. With the flag off the endpoints still run full Laravel validation
    | so the UI gives real feedback, but the actual database write is refused
    | with HTTP 503 and a clear message. No row can be modified until the
    | write mechanism is explicitly approved and PROFILE_WRITE_ENABLED=true
    | is set in .env.
    |
    | Reading (GET /api/me, GET /api/profile) is never gated.
    |
    */

    'profile_write_enabled' => env('PROFILE_WRITE_ENABLED', false),

    /*
    |--------------------------------------------------------------------------
    | Profile Photo Storage
    |--------------------------------------------------------------------------
    |
    | `tb_user.foto` already exists (varchar(250) NOT NULL) and already holds
    | image references, so no schema change is required. Observed values are
    | either an absolute URL ("https://.../Profiles/1789098592_x.jpg") or a
    | bare filename ("1781769646ee.jpeg").
    |
    | Newly uploaded photos are stored as files inside the web root under
    | `directory`, and the ABSOLUTE URL of the file is written to tb_user.foto
    | (built from the public disk URL, i.e. APP_URL + "/storage/<directory>/").
    | APP_URL comes from .env, so no production URL is hardcoded here:
    |   local  APP_URL=http://127.0.0.1:8000
    |            -> http://127.0.0.1:8000/storage/profile/x.jpg
    |   prod   APP_URL=https://backend.elmechtechnology.com
    |            -> https://backend.elmechtechnology.com/storage/profile/x.jpg
    | Rows written by older code (relative "/storage/profile/x.jpg") are NOT
    | rewritten - fotoUrl() resolves both shapes when the value is read.
    |
    */

    'profile_photo' => [

        // Laravel filesystem disk used to store the uploaded photos.
        // The `public` disk root is storage/app/public.
        'disk' => 'public',

        // Folder inside the disk, i.e. storage/app/public/profile/.
        // This is served publicly through the public/storage symlink
        // (php artisan storage:link) as /storage/profile/<file>.
        'directory' => 'profile',

        // Extensions accepted by the photo upload endpoint.
        'mimes' => ['jpg', 'jpeg', 'png', 'webp'],

        // Maximum accepted upload size in kilobytes.
        'max_kb' => 2048,

        // Base URL used to resolve legacy bare-filename values that are not
        // present in storage/app/public/profile (e.g. "1781769646ee.jpeg").
        // Empty string disables it and the UI falls back to the initials avatar.
        'base_url' => env('ELMECH_FOTO_BASE_URL', ''),
    ],

];