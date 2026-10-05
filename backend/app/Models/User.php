<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Storage;

class User extends Authenticatable
{
    use Notifiable;

    protected $table = 'tb_user';

    protected $primaryKey = 'id_user';

    public $timestamps = true;

    protected $fillable = [
        'username',
        'password',
        'id_level',
        'nama',
        'foto',
        'alamat',
        'no_hp',
        'id_telegram',
        'id_karyawan',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    public function level()
    {
        return $this->belongsTo(Level::class, 'id_level', 'id_level');
    }

    /**
     * Resolve the raw `foto` value into a URL the browser can actually load.
     *
     * The column already exists (varchar(250) NOT NULL) and the existing rows
     * contain three shapes of value:
     *   - absolute URL  : https://backend.elmechtechnology.com/assesst/Profiles/x.jpg
     *   - storage path  : /storage/profile/x.jpg   (written by this app)
     *   - bare filename : 1781769646ee.jpeg        (legacy rows)
     *
     * Returns null when the value cannot be resolved, so the frontend can fall
     * back to the initials avatar instead of rendering a broken image.
     */
    public function fotoUrl(): ?string
    {
        $foto = trim((string) $this->foto);

        if ($foto === '') {
            return null;
        }

        // 1. Absolute URL pointing at an external asset host.
        if (preg_match('#^https?://#i', $foto)) {
            return $foto;
        }

        // 2. Path written by this app, served through public/storage.
        //    Built from the `public` disk URL so it stays correct regardless
        //    of the incoming Host header (dev uses two different ports).
        if (str_starts_with($foto, '/')) {
            $disk = Storage::disk($this->photoDisk());

            // The disk URL is "<APP_URL>/storage", while the stored value is
            // "/storage/profile/x.jpg". Strip the overlapping prefix so the
            // disk URL is not applied twice.
            $relative = ltrim($foto, '/');
            $prefix = trim((string) parse_url($disk->url(''), PHP_URL_PATH), '/');

            if ($prefix !== '' && str_starts_with($relative, $prefix . '/')) {
                $relative = substr($relative, strlen($prefix) + 1);
            }

            return $disk->url($relative);
        }

        $directory = trim((string) config('elmech.profile_photo.directory'), '/');

        // 3. A bare filename that is present in local storage.
        if (Storage::disk($this->photoDisk())->exists($directory . '/' . basename($foto))) {
            return Storage::disk($this->photoDisk())->url($directory . '/' . basename($foto));
        }

        // 4. Legacy bare filename kept by the previous system.
        $base = rtrim((string) config('elmech.profile_photo.base_url'), '/');

        if ($base !== '') {
            return $base . '/' . basename($foto);
        }

        return null;
    }

    public function photoDisk(): string
    {
        return (string) config('elmech.profile_photo.disk', 'public');
    }

    /**
     * Single source of truth for the user payload exposed by the API, used by
     * /api/me and by the profile endpoints so the shape can never drift.
     *
     * Never exposes `password` or `remember_token`.
     */
    public function toProfileArray(): array
    {
        return [
            'id' => $this->id_user,
            'username' => $this->username,
            'nama' => $this->nama,
            'id_level' => $this->id_level,
            'role' => $this->level ? $this->level->nama_level : null,
            'foto' => $this->foto,
            'foto_url' => $this->fotoUrl(),
            'no_hp' => $this->no_hp,
            'alamat' => $this->alamat,
            'tanggal_gabung' => $this->tanggal_gabung,
        ];
    }
}
