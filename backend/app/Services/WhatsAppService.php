<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pengirim notifikasi WhatsApp ELMECH.
 *
 * Endpoint & API key diambil dari config('services.whatsapp') yang bersumber
 * dari environment (WHATSAPP_API_URL / WHATSAPP_API_KEY). API key TIDAK pernah
 * ditulis ke log atau dikirim ke frontend.
 *
 * Semua kegagalan (timeout, error HTTP, exception) ditelan dan dikembalikan
 * sebagai `false` supaya pemanggil tidak pernah membatalkan operasi utamanya
 * (mis. menyimpan progress projek) hanya karena WhatsApp gagal terkirim.
 */
class WhatsAppService
{
    /**
     * Kirim satu pesan WhatsApp.
     *
     * @param  string        $number   Nomor tujuan (sudah dinormalisasi, mis. "62812...").
     * @param  string        $message  Isi pesan.
     * @param  array<string> $fileUrls Daftar URL lampiran absolut (opsional).
     * @return bool true bila layanan membalas sukses (HTTP 2xx).
     */
    public static function sendWA(string $number, string $message, array $fileUrls = []): bool
    {
        $url = (string) config('services.whatsapp.url');
        $apiKey = (string) config('services.whatsapp.api_key');
        $timeout = (int) config('services.whatsapp.timeout', 10);

        if ($url === '' || $apiKey === '') {
            Log::warning('Notifikasi WhatsApp dilewati: konfigurasi layanan belum lengkap.');
            return false;
        }

        // Debug: log payload sebelum dikirim ke API WhatsApp (tanpa API key)
        Log::debug('Debug payload WhatsApp Progress', [
            'number' => $number,
            'message' => $message,
            'fileUrls' => array_values(array_filter(
                $fileUrls,
                fn ($u) => is_string($u) && trim($u) !== ''
            )),
        ]);

        try {
            $payload = [
                'number' => $number,
                'message' => $message,
            ];

            // Hanya kirim field fileUrls bila memang ada lampiran.
            $urls = array_values(array_filter(
                $fileUrls,
                fn ($u) => is_string($u) && trim($u) !== ''
            ));
            if (!empty($urls)) {
                $payload['fileUrls'] = $urls;
            }

            $response = Http::withHeaders([
                'x-api-key' => $apiKey,
                'Content-Type' => 'application/json',
            ])
                ->timeout($timeout)
                ->post($url, $payload);

            if ($response->successful()) {
                Log::info('Notifikasi WhatsApp berhasil dikirim.', [
                    'number' => $number,
                ]);
                return true;
            }

            // JANGAN catat header/API key; cukup status & body respons.
            Log::error('Notifikasi WhatsApp gagal dikirim.', [
                'status' => $response->status(),
                'response' => $response->body(),
            ]);
            return false;
        } catch (\Throwable $e) {
            Log::error('Error pengiriman WhatsApp: ' . $e->getMessage());
            return false;
        }
    }
}
