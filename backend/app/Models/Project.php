<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Project - operates strictly on the EXISTING `tb_project` table.
 * There is deliberately no migration, no new table and no new column -
 * the real schema (inspected live) is the only schema used:
 *
 *   id_project       int(11)                 PK, auto_increment
 *   uuid_project     varchar(30)           NOT NULL (kode projek, max 30)
 *   id_client        int(11)               NOT NULL, FK -> tb_user.id_user
 *                                            (ON DELETE CASCADE, ON UPDATE CASCADE)
 *   judul            varchar(500)          NOT NULL
 *   jenis            enum('pcb','project') NOT NULL
 *   deskripsi        text                  NOT NULL ('' bila kosong)
 *   tanggal_mulai    date                  NOT NULL
 *   tanggal_estimasi date                  NOT NULL (legacy: '0000-00-00' = belum diisi)
 *   tanggal_selesai  date                  NOT NULL (legacy: '0000-00-00' = belum diisi)
 *   status           enum('running','done','cancel') NOT NULL
 *   urgency          enum('urgent','normal','non-urgent') NOT NULL DEFAULT 'normal'
 *   harga            int(11)               NOT NULL (0 bila kosong)
 *   is_proposed      tinyint(1)            NOT NULL DEFAULT 0
 *
 * Notes:
 *  - The table has NO created_at / updated_at columns, so $timestamps = false.
 *  - id_client points at tb_user (the "client" is a user row; its `nama`
 *    column is exposed as `client`). No new FK, no client table is created.
 *  - Inbound FKs (tb_chat, tb_files, tb_pembayaran, tb_progress, tb_tim)
 *    are all ON DELETE CASCADE, so deleting a project removes its child
 *    rows at the database level - nothing is fabricated here.
 */
class Project extends Model
{
    protected $table = 'tb_project';

    protected $primaryKey = 'id_project';

    public $timestamps = false;

    protected $fillable = [
        'uuid_project',
        'id_client',
        'judul',
        'jenis',
        'deskripsi',
        'tanggal_mulai',
        'tanggal_estimasi',
        'tanggal_selesai',
        'status',
        'urgency',
        'harga',
        'is_proposed',
    ];

    protected $casts = [
        'id_client' => 'integer',
        'harga' => 'integer',
        'is_proposed' => 'boolean',
    ];

    /**
     * The client is an existing tb_user row (see FK tb_project_ibfk_1).
     * Its `nama` is what the frontend shows as customer.
     */
    public function client()
    {
        return $this->belongsTo(User::class, 'id_client', 'id_user');
    }
}
