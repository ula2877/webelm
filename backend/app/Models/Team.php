<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Team - baris tb_tim (relasi project <-> worker).
 *
 * Skema existing (tanpa migration):
 *   id          int(11) PK, auto_increment
 *   id_project  int(11) NOT NULL, FK -> tb_project.id_project
 *                          (ON DELETE/UPDATE CASCADE)
 *   id_worker   int(11) NOT NULL, FK -> tb_user.id_user
 *                          (ON DELETE/UPDATE CASCADE)
 *
 * Satu project boleh punya 0, 1, atau banyak worker. Tidak ada kolom
 * worker di tb_project - relasi selalu lewat tabel ini.
 */
class Team extends Model
{
    protected $table = 'tb_tim';

    protected $primaryKey = 'id';

    public $timestamps = false;

    protected $fillable = [
        'id_project',
        'id_worker',
    ];

    protected $casts = [
        'id_project' => 'integer',
        'id_worker' => 'integer',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class, 'id_project', 'id_project');
    }

    public function worker()
    {
        return $this->belongsTo(User::class, 'id_worker', 'id_user');
    }
}
