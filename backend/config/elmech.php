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

    /*
    |--------------------------------------------------------------------------
    | Letter Asset (signature / stamp) Write Permission
    |--------------------------------------------------------------------------
    |
    | Signature and stamp images are stored as files and recorded in the
    | EXISTING tb_surat_asset table (jenis = 'signature' | 'stamp'). No schema
    | change is involved - only an INSERT.
    |
    | This flag gates that INSERT, following the same pattern as
    | PROFILE_WRITE_ENABLED. With the flag off the endpoints still run full
    | validation but refuse the actual write with HTTP 503.
    |
    */
    'letter_asset_write_enabled' => env('LETTER_ASSET_WRITE_ENABLED', true),

    'letter_asset' => [

        // Laravel filesystem disk used to store the uploaded images.
        'disk' => 'public',

        // Folder inside the disk, i.e. storage/app/public/letter-assets/.
        // Served publicly through public/storage as /storage/letter-assets/<file>.
        'directory' => 'letter-assets',

        // Extensions accepted by the signature/stamp upload endpoint.
        'mimes' => ['jpg', 'jpeg', 'png', 'webp'],

        // Maximum accepted upload size in kilobytes.
        'max_kb' => 4096,
    ],

    /*
    |--------------------------------------------------------------------------
    | Project File Storage
    |--------------------------------------------------------------------------
    |
    | Project files are stored as files and recorded in the EXISTING tb_files
    | table (id_parent -> tb_project.id_project). No schema change is involved.
    |
    | This feature uses the same public disk and storage pattern as other
    | file uploads in the application.
    |
    */

    'project_file' => [

        // Laravel filesystem disk used to store the uploaded files.
        'disk' => 'public',

        // Folder inside the disk, i.e. storage/app/public/project-files/.
        // Served publicly through public/storage as /storage/project-files/<file>.
        'directory' => 'project-files',

        // Extensions accepted by the project file upload endpoint.
        'mimes' => [
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'jpg', 'jpeg', 'png', 'webp', 'gif',
            'zip', 'rar', '7z',
            'txt', 'csv',
        ],

        // Maximum accepted upload size in kilobytes.
        'max_kb' => 20480, // 20 MB
    ],

    /*
    |--------------------------------------------------------------------------
    | Project File Public URL
    |--------------------------------------------------------------------------
    |
    | tb_files.path menyimpan FULL URL file (format "<base_url>/files/<nama>").
    | Domain diambil dari konfigurasi (default mengikuti APP_URL) supaya tidak
    | di-hardcode. File fisik tetap di disk `public` di folder project_file
    | dan dilayani melalui route GET /files/{filename} (ProjectController@serveFile).
    |
    */
    'project_file_url' => [
        'base_url' => rtrim(env('PROJECT_FILE_BASE_URL', env('APP_URL', 'http://127.0.0.1:8000')), '/'),
        'prefix' => 'files',
    ],

    /*
    |--------------------------------------------------------------------------
    | Project Progress Attachments
    |--------------------------------------------------------------------------
    |
    | Lampiran pada satu catatan progress disimpan memakai mekanisme yang SAMA
    | dengan Project File (tb_files + kolom `path`). File fisik disimpan pada
    | folder project_file.directory ("project-files") supaya endpoint download
    | File Manager tetap dapat melayaninya tanpa endpoint/aturan baru.
    |
    | Batasan yang berlaku:
    |   - mimes & max_kb per file mengikuti project_file (20 MB per file).
    |   - max_files membatasi jumlah lampiran per satu catatan progress.
    |   - Server PHP membatasi total request (post_max_size = 40 MB), jadi total
    |     seluruh lampiran dalam satu request tidak boleh melebihi itu.
    |   - tb_progress.id_file menyimpan JSON array ID tb_files; kolomnya
    |     varchar(100) sehingga controller memverifikasi panjang JSON sebelum
    |     menyimpan (max_files = 10 aman di bawah 100 karakter).
    |
    */
    'project_progress' => [
        'max_files' => 10,
    ],

    /*
    |--------------------------------------------------------------------------
    | Project Payment Proof (tb_pembayaran.bukti_tf)
    |--------------------------------------------------------------------------
    |
    | Bukti transfer disimpan sebagai file pada disk `public` di folder yang
    | SAMA dengan file projek ("project-files") dan dilayani melalui route
    | GET /files/{filename}. URL lengkap ditulis ke tb_pembayaran.bukti_tf
    | (varchar(100)); domain berasal dari elmech.project_file_url.base_url
    | (default APP_URL) sehingga tidak ada domain produksi yang di-hardcode.
    |
    */
    'project_payment' => [

        'disk' => 'public',

        'directory' => 'project-files',

        // Format bukti transfer yang diterima.
        'mimes' => ['jpg', 'jpeg', 'png', 'pdf'],

        // Ukuran maksimum bukti transfer dalam kilobytes.
        'max_kb' => 4096, // 4 MB
    ],

];