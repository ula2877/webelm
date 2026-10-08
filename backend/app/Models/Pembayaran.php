<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Pembayaran - baris tb_pembayaran (cicilan/termin project).
 *
 * Skema existing (tanpa migration):
 *   id_pembayaran int(11)            PK, auto_increment
 *   id_project    int(11)            NOT NULL, FK -> tb_project.id_project
 *                                          (ON DELETE/UPDATE CASCADE)
 *   nominal       int(11)            NOT NULL
 *   bukti_tf      varchar(100)       NOT NULL
 *   pelunasan     enum('dp','lunas') NOT NULL
 *
 * Satu project boleh punya 0, 1, atau banyak pembayaran.
 */
class Pembayaran extends Model
{
    protected $table = 'tb_pembayaran';

    protected $primaryKey = 'id_pembayaran';

    public $timestamps = false;

    protected $fillable = [
        'id_project',
        'nominal',
        'bukti_tf',
        'pelunasan',
    ];

    protected $casts = [
        'id_project' => 'integer',
        'nominal' => 'integer',
    ];

    public function project()
    {
        return $this->belongsTo(Project::class, 'id_project', 'id_project');
    }
}
