<?php

namespace App\Services;

use Dompdf\Dompdf;
use Dompdf\Options;
use setasign\Fpdi\Fpdi;

/**
 * Quotation PDF renderer.
 *
 * Mirrors the LIVE PREVIEW design (QuotationPreview.jsx) as closely
 * as possible: same fonts, sizes, table, signature/stamp placement and
 * the same A4 safe-area logic:
 *
 *   @page margin-top    = header height + CONTENT_TOP_OFFSET
 *   @page margin-bottom = footer height + CONTENT_BOTTOM_OFFSET
 *
 * So content can never touch the header or the footer on any page, and
 * <thead> repeats automatically when the item table spans pages.
 *
 * Two-step rendering (dompdf alone cannot repeat a fixed-position image
 * on every page):
 *   1. dompdf renders the document BODY with the safe-area @page margins.
 *   2. FPDI stamps the header image (top) and footer image (bottom)
 *      onto EVERY page of the dompdf output.
 *
 * The header/footer artwork lives in backend/public (a copy of
 * frontend/public/letterhead.png and footer-strip.png - same files,
 * same design, no changes).
 */
class QuotationPdfRenderer
{
    // Same PAGE_LAYOUT values as the live preview (mm).
    private const CONTENT_TOP_OFFSET_MM = 5;
    private const CONTENT_BOTTOM_OFFSET_MM = 5;
    private const PAGE_WIDTH_MM = 210;
    private const PAGE_HEIGHT_MM = 297;
    private const CONTENT_SIDE_MARGIN_MM = 15;

    // Natural aspect ratios of the artwork (width / height).
    private const HEADER_ASPECT = 729 / 149;
    private const FOOTER_ASPECT = 2275 / 165;

    // Signature block geometry, identical to .letter-signature CSS.
    private const SIG_BOX_WIDTH_MM = 75;
    private const SIG_BOX_HEIGHT_MM = 18;
    private const SIG_IMAGE_MAX_HEIGHT_MM = 22;

    private const PX_PER_MM = 96 / 25.4;

    private string $headerPath;
    private string $footerPath;
    private float $headerHeightMm;
    private float $footerHeightMm;

    public function __construct()
    {
        $this->headerPath = public_path('letterhead.png');
        $this->footerPath = public_path('footer-strip.png');
        // Height when the image spans the full 210mm page width.
        $this->headerHeightMm = self::PAGE_WIDTH_MM / self::HEADER_ASPECT;
        $this->footerHeightMm = self::PAGE_WIDTH_MM / self::FOOTER_ASPECT;
    }

    /**
     * Render a saved quotation surat (tb_surat row + tb_surat_item rows)
     * and return the PDF bytes.
     */
    public function render(object $surat, $items): string
    {
        $data = json_decode((string) $surat->data, true) ?: [];

        // Signature/stamp references live as COLUMNS on tb_surat
        // (id_asset_ttd / id_asset_stempel / posisi_ttd / posisi_stempel),
        // not inside the data JSON. Merge them in so the HTML builder
        // has one place to read from.
        $data['id_asset_ttd'] = $surat->id_asset_ttd;
        $data['id_asset_stempel'] = $surat->id_asset_stempel;
        $data['posisi_ttd'] = json_decode((string) $surat->posisi_ttd, true);
        $data['posisi_stempel'] = json_decode((string) $surat->posisi_stempel, true);
        // nomor/tanggal are columns too; the JSON may not repeat them.
        $data['nomor'] = $data['nomor'] ?? $surat->nomor;
        $data['tanggal'] = $data['tanggal'] ?? $surat->tanggal;

        $html = $this->buildHtml($data, $items);

        // ---- Step 1: dompdf renders the body with safe-area margins ----
        $options = new Options();
        $options->set('isRemoteEnabled', true);
        $options->set('chroot', [base_path(), public_path(), sys_get_temp_dir()]);
        $options->set('isFontSubsettingEnabled', true);

        $dompdf = new Dompdf($options);
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->loadHtml($html);
        $dompdf->render();

        $tmpBody = tempnam(sys_get_temp_dir(), 'quotation_body') . '.pdf';
        file_put_contents($tmpBody, $dompdf->output());

        // ---- Step 2: FPDI stamps header/footer on every page ----
        $pdf = new Fpdi('P', 'mm', 'A4');
        $pageCount = $pdf->setSourceFile($tmpBody);

        for ($i = 1; $i <= $pageCount; $i++) {
            $pdf->AddPage();
            $pdf->useTemplate($pdf->importPage($i));
            $pdf->Image($this->headerPath, 0, 0, self::PAGE_WIDTH_MM, $this->headerHeightMm);
            $pdf->Image($this->footerPath, 0, self::PAGE_HEIGHT_MM - $this->footerHeightMm, self::PAGE_WIDTH_MM, $this->footerHeightMm);
        }

        $out = $pdf->Output('S');
        if (file_exists($tmpBody)) {
            unlink($tmpBody);
        }

        return $out;
    }

    // ------------------------------------------------------------------ HTML

    private function buildHtml(array $data, $items): string
    {
        $e = fn (?string $v) => htmlspecialchars((string) ($v ?? ''), ENT_QUOTES, 'UTF-8');

        $city = $e($data['city'] ?? '');
        $date = $this->formatLongDateID($data['tanggal'] ?? '');
        $nomor = $e($data['nomor'] ?? '');
        $attachment = $e($data['attachment'] ?? '');
        $subject = $e($data['subject'] ?? '');
        $customerName = $e($data['customerName'] ?? '');
        $customerAddress = nl2br($e($data['customerAddress'] ?? ''));
        $systemName = $e($data['systemName'] ?? '');

        // ----- items table -----
        $rowsHtml = '';
        foreach ($items as $i => $item) {
            $specs = json_decode((string) ($item->spesifikasi ?? ''), true);
            $specs = is_array($specs) ? array_values(array_filter($specs, fn ($s) => trim((string) $s) !== '')) : [];
            $specHtml = '';
            if ($specs !== []) {
                $lis = implode('', array_map(fn ($s) => '<li>' . $e((string) $s) . '</li>', $specs));
                $specHtml = "<ol class=\"spec-list\">{$lis}</ol>";
            }
            $rowsHtml .= '<tr>'
                . '<td class="c no">' . ($i + 1) . '</td>'
                . '<td><p class="comp">' . $e((string) ($item->nama_komponen ?? '')) . '</p>' . $specHtml . '</td>'
                . '<td class="r nowrap">' . $this->formatNumber((float) $item->harga_satuan) . '</td>'
                . '<td class="c">' . $this->formatNumber((float) $item->volume, 3) . '</td>'
                . '<td>' . $e((string) ($item->satuan ?? '')) . '</td>'
                . '<td class="r nowrap">' . $this->formatNumber((float) $item->harga_satuan * (float) $item->volume) . '</td>'
                . '</tr>';
        }
        if ($rowsHtml === '') {
            $rowsHtml = '<tr><td colspan="6" class="c italic">Belum ada komponen</td></tr>';
        }

        // ----- totals (recomputed from the items, never trusted from the client) -----
        $total = 0;
        foreach ($items as $item) {
            $total += (int) round((float) $item->harga_satuan * (float) $item->volume);
        }
        $usePPN = !empty($data['usePPN']);
        $ppnRate = $usePPN ? (float) ($data['ppnRate'] ?? 0) : 0;
        $ppn = (int) round($total * $ppnRate / 100);
        $grandTotal = $total + $ppn;
        $useDP = !empty($data['useDP']);
        $dpRate = $useDP ? (float) ($data['dpRate'] ?? 0) : 0;
        $dp = (int) round($grandTotal * $dpRate / 100);

        $totalsHtml = '<tr><td>Total</td><td class="r">' . $this->formatNumber($total) . '</td></tr>';
        if ($usePPN) {
            $totalsHtml .= '<tr><td>PPN (' . $this->formatNumber($ppnRate) . '%)</td><td class="r">' . $this->formatNumber($ppn) . '</td></tr>';
        }
        $totalsHtml .= '<tr class="grand"><td>Grand Total</td><td class="r">' . $this->formatNumber($grandTotal) . '</td></tr>';
        if ($useDP) {
            $totalsHtml .= '<tr><td>DP (' . $this->formatNumber($dpRate) . '%)</td><td class="r">' . $this->formatNumber($dp) . '</td></tr>'
                . '<tr><td>Sisa Pembayaran</td><td class="r">' . $this->formatNumber($grandTotal - $dp) . '</td></tr>';
        }

        // ----- notes -----
        $notes = is_array($data['notes'] ?? null) ? array_values(array_filter($data['notes'], fn ($n) => trim((string) $n) !== '')) : [];
        $notesHtml = '';
        if ($notes !== []) {
            $lis = implode('', array_map(fn ($n) => '<li>' . $e((string) $n) . '</li>', $notes));
            $notesHtml = '<p class="bold">Keterangan:</p><ol class="spec-list">' . $lis . '</ol>';
        }

        // ----- signature / stamp -----
        $signatureHtml = $this->buildSignatureHtml($data);

        return <<<HTML
<html><head><meta charset="utf-8"><style>
@page {
    size: A4 portrait;
    margin: {$this->mm($this->headerHeightMm + self::CONTENT_TOP_OFFSET_MM)} {$this->mm(self::CONTENT_SIDE_MARGIN_MM)} {$this->mm($this->footerHeightMm + self::CONTENT_BOTTOM_OFFSET_MM)} {$this->mm(self::CONTENT_SIDE_MARGIN_MM)};
}
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.45; color: #111; margin: 0; }
p { margin: 0 0 1.6mm 0; }
.right { text-align: right; }
.center { text-align: center; }
.bold { font-weight: 700; }
.italic { font-style: italic; }
.nowrap { white-space: nowrap; }
.meta { margin-bottom: 4mm; }
.meta-table { border-collapse: collapse; }
.meta-table td { vertical-align: top; padding: 0.3mm 0; }
.meta-table td.sep { padding-right: 1.5mm; }
.recipient { margin-bottom: 4mm; }
.paragraph { margin-bottom: 4mm; text-align: justify; }
table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
table.items th, table.items td { border: 1px solid #000; padding: 1.4mm 1.8mm; font-size: 9.5pt; vertical-align: top; }
table.items th { background: #f1f5f9; text-align: center; font-weight: 700; }
table.items tr { break-inside: avoid; }
td.no { width: 8mm; }
td.harga { width: 26mm; }
td.vol { width: 12mm; }
td.satuan { width: 20mm; }
td.subtotal { width: 30mm; }
td.c { text-align: center; }
td.r { text-align: right; }
.comp { font-weight: 600; margin: 0; }
.spec-list { list-style: decimal; margin: 1mm 0 0 4mm; padding: 0; }
.spec-list li { margin: 0.2mm 0; }
.totals { display: flex; justify-content: flex-end; margin-top: 3mm; }
.totals-table { border-collapse: collapse; min-width: 70mm; }
.totals-table td { border: 1px solid #000; padding: 1.4mm 3mm; font-size: 9.5pt; }
.totals-table .grand td { font-weight: 700; }
.notes { margin-top: 4mm; }
.closing { margin-top: 6mm; text-align: justify; }
.signature { margin-top: 8mm; margin-left: auto; margin-right: 8mm; width: 75mm; }
.sig-box { height: 18mm; position: relative; }
.sig-box img { position: absolute; }
.signer-name { font-weight: 700; text-decoration: underline; margin: 0 0 0 0; }
</style></head>
<body>
<p class="right">{$city}, {$date}</p>
<table class="meta meta-table"><tbody>
<tr><td class="sep">No Surat</td><td class="sep">:</td><td>{$nomor}</td></tr>
<tr><td class="sep">Lampiran</td><td class="sep">:</td><td>{$attachment}</td></tr>
<tr><td class="sep">Hal</td><td class="sep">:</td><td>{$subject}</td></tr>
</tbody></table>
<div class="recipient">
<p>Kepada Yth:</p>
<p class="bold">{$customerName}</p>
<p>{$customerAddress}</p>
</div>
<p class="paragraph">Berikut kami berikan penawaran harga untuk {$systemName} sesuai dengan permintaan anda kepada kami:</p>
<table class="items">
<thead><tr>
<th class="no">No</th><th>Komponen</th><th class="harga">Harga</th><th class="vol">Vol</th><th class="satuan">Satuan</th><th class="subtotal">Subtotal</th>
</tr></thead>
<tbody>{$rowsHtml}</tbody>
</table>
<div class="totals"><table class="totals-table"><tbody>{$totalsHtml}</tbody></table></div>
<div class="notes">{$notesHtml}</div>
<p class="closing">Demikian surat penawaran ini kami buat, atas perhatiannya dan kerjasamanya kami ucapkan banyak terima kasih.</p>
{$signatureHtml}
</body></html>
HTML;
    }

    /**
     * Signature block, replicating .letter-signature: right-aligned 75mm
     * block with an 18mm box. The signature/stamp images are placed with
     * explicit left/top/width/height (mm) computed from the stored
     * position {x, y, zoom} - the same translate(x,y) scale(zoom)
     * semantics the live preview applies via CSS transform.
     */
    private function buildSignatureHtml(array $data): string
    {
        $signature = is_array($data['signature'] ?? null) ? $data['signature'] : [];
        $company = htmlspecialchars((string) ($signature['companyName'] ?? ''), ENT_QUOTES, 'UTF-8');
        $signer = htmlspecialchars((string) ($signature['signerName'] ?? ''), ENT_QUOTES, 'UTF-8');
        $title = htmlspecialchars((string) ($signature['signerTitle'] ?? ''), ENT_QUOTES, 'UTF-8');

        $images = '';
        $useSignature = !empty($data['useSignature'])
            || (!empty($data['useSignatureStamp']) && !empty($data['id_asset_ttd']));
        $useStamp = !empty($data['useStamp'])
            || (!empty($data['useSignatureStamp']) && !empty($data['id_asset_stempel']));

        // Stamp first so the signature draws on top (same z-order as the preview).
        if ($useStamp) {
            $images .= $this->assetImageHtml($data, 'stamp', 'stempel');
        }
        if ($useSignature) {
            $images .= $this->assetImageHtml($data, 'signature', 'ttd');
        }

        return <<<HTML
<div class="signature">
<p>Hormat Kami,</p>
<p class="bold">{$company}</p>
<div class="sig-box">{$images}</div>
<p class="signer-name">{$signer}</p>
<p>{$title}</p>
</div>
HTML;
    }

    private function assetImageHtml(array $data, string $key, string $columnSuffix): string
    {
        $assetId = $data['id_asset_' . $columnSuffix] ?? null;
        if (!$assetId) {
            return '';
        }

        $path = \Illuminate\Support\Facades\DB::table('tb_surat_asset')
            ->where('id_asset', (int) $assetId)
            ->whereNull('deleted_at')
            ->value('path');
        if (!$path) {
            return '';
        }

        $local = $this->resolveLocalPath((string) $path);
        if (!$local || !file_exists($local)) {
            // Remote URL: let dompdf fetch it (isRemoteEnabled is on).
            $local = (string) $path;
        }

        $pos = is_array($data['posisi_' . $columnSuffix] ?? null) ? $data['posisi_' . $columnSuffix] : [];
        $xMm = ((float) ($pos['x'] ?? 0)) / self::PX_PER_MM;
        $yMm = ((float) ($pos['y'] ?? 0)) / self::PX_PER_MM;
        $zoom = max(0.1, (float) ($pos['zoom'] ?? 1));

        // Base render inside the 75mm box: max-height 22mm, aspect kept.
        $size = @getimagesize($local);
        $aspect = is_array($size) && $size[1] > 0 ? ($size[0] / $size[1]) : 1;
        $h0 = self::SIG_IMAGE_MAX_HEIGHT_MM;
        $w0 = $h0 * $aspect;
        if ($w0 > self::SIG_BOX_WIDTH_MM) {
            $w0 = self::SIG_BOX_WIDTH_MM;
            $h0 = $w0 / $aspect;
        }
        // scale(zoom) about the image center, then translate(x, y).
        $w = $w0 * $zoom;
        $h = $h0 * $zoom;
        $left = ($w0 - $w) / 2 + $xMm;
        $top = ($h0 - $h) / 2 + $yMm;

        $src = htmlspecialchars($local, ENT_QUOTES, 'UTF-8');
        return '<img src="' . $src . '" style="left:' . $this->mm($left) . '; top:' . $this->mm($top)
            . '; width:' . $this->mm($w) . '; height:' . $this->mm($h) . ';">';
    }

    /**
     * Map a stored asset URL (APP_URL/storage/...) to a local filesystem
     * path so dompdf embeds it reliably. Returns the original URL when it
     * is external or cannot be resolved locally.
     */
    private function resolveLocalPath(string $url): ?string
    {
        $url = trim($url);
        if ($url === '' || preg_match('#^https?://#i', $url)) {
            $base = rtrim((string) config('app.url'), '/');
            if ($base !== '' && str_starts_with($url, $base . '/')) {
                $rel = substr($url, strlen($base) + 1);
                $rel = preg_replace('#^storage/#', '', $rel);
                $path = storage_path('app/public/' . $rel);
                if (file_exists($path)) {
                    return $path;
                }
            }
            return $url; // external / other host: fetched remotely
        }
        return null;
    }

    // ------------------------------------------------------------------ helpers

    /** "42.89mm" */
    private function mm(float $v): string
    {
        return number_format($v, 2, '.', '') . 'mm';
    }

    /** Plain grouped number like the reference letter: 6,500,000 */
    private function formatNumber(float $v, int $decimals = 0): string
    {
        return number_format($v, $decimals, ',', '.');
    }

    /** "14 September 2026" */
    private function formatLongDateID(?string $dateStr): string
    {
        $months = [
            1 => 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
        ];
        $ts = strtotime((string) $dateStr);
        if ($ts === false) {
            return '-';
        }
        $m = (int) date('n', $ts);

        return date('j', $ts) . ' ' . ($months[$m] ?? '') . ' ' . date('Y', $ts);
    }
}
