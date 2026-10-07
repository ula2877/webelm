import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Loader2, Edit2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import BastPreview from '../components/BastPreview';
import { buildPreviewHtml } from '../utils/quotationPrintHtml';
import * as suratService from '../services/surat';

const CFG = {
  routeBase: 'letters/handover',
  label: 'Berita Acara Serah Terima',
  pdfPrefix: 'BAST',
};

const emptyForm = {
  nomor: '',
  tanggal: '',
  nomorSPK: '',
  tanggalSPK: '',
  tanggalPelaksanaan: '',
  pihakPertamaNama: '',
  pihakPertamaAlamat: '',
  pihakKeduaNama: '',
  pihakKeduaAlamat: '',
  items: [],
  useSignature: false,
  signatureImage: null,
  signatureX: 0,
  signatureY: 0,
  signatureZoom: 100,
  signatureSide: 'second',
  useStamp: false,
  stampImage: null,
  stampX: 0,
  stampY: 25,
  stampZoom: 100,
  pihakPertamaPenandatangan: '',
  signerName: '',
  signerTitle: '',
};

// Mapping detail API -> state preview. Field BAST diambil dari JSON `data`,
// dengan fallback ke kolom generic untuk data lama.
function formFromBastDetail(detail) {
  const d = detail.data || {};
  const pos = (raw) => {
    const p = raw && typeof raw === 'object' ? raw : {};
    return {
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      zoom: Math.round((Number(p.zoom) || 1) * 100),
    };
  };
  const sigPos = pos(detail.posisi_ttd ?? d.signaturePosition);
  const stampPos = pos(detail.posisi_stempel ?? d.stampPosition);

  return {
    ...emptyForm,
    nomor: detail.nomor || '',
    tanggal: detail.tanggal || '',
    nomorSPK: d.nomorSPK || '',
    tanggalSPK: d.tanggalSPK || '',
    tanggalPelaksanaan: d.tanggalPelaksanaan || '',
    pihakPertamaNama: d.pihakPertamaNama || d.customerName || '',
    pihakPertamaAlamat: d.pihakPertamaAlamat || d.customerAddress || '',
    pihakKeduaNama: d.pihakKeduaNama || '',
    pihakKeduaAlamat: d.pihakKeduaAlamat || '',
    items: Array.isArray(detail.items)
      ? detail.items.map((it) => ({
          nama_komponen: it.nama_komponen ?? '',
          spesifikasi: Array.isArray(it.spesifikasi) ? it.spesifikasi.join('\n') : '',
          volume: it.volume ?? '',
          satuan: it.satuan ?? '',
        }))
      : [],
    useSignature: !!d.useSignature,
    signatureImage: d.signatureImage ?? null,
    signatureX: sigPos.x,
    signatureY: sigPos.y,
    signatureZoom: sigPos.zoom,
    signatureSide: d.signatureSide ?? 'second',
    useStamp: !!d.useStamp,
    stampImage: d.stampImage ?? null,
    stampX: stampPos.x,
    stampY: stampPos.y,
    stampZoom: stampPos.zoom,
    pihakPertamaPenandatangan: d.pihakPertamaPenandatangan || '',
    signerName: d.signature?.signerName || '',
    signerTitle: d.signature?.signerTitle || '',
  };
}

// Halaman View BAST (read-only): preview dokumen + tombol Edit & Download PDF.
// Pola sama dengan ViewSuratPenawaran / ViewSuratInvoice.
export default function ViewSuratHandover() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [form, setForm] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    suratService
      .fetchQuotationDetail(id)
      .then((res) => {
        if (cancelled) return;
        if (res?.status !== 'ok' || !res.data || res.data.jenis !== 'bast') {
          setError('Berita acara tidak ditemukan.');
          return;
        }
        setForm(formFromBastDetail(res.data));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Gagal memuat berita acara.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDownload = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    setNotice(null);
    try {
      const html = await buildPreviewHtml();
      const blob = await suratService.downloadQuotationPdfFromHtml(html);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const nomor = (form?.nomor || 'bast').replace(/[\\/:*?"<>|]+/g, '_');
      a.download = `${CFG.pdfPrefix}-${nomor}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Gagal membuat PDF berita acara.' });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(`/${CFG.routeBase}`)}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">Lihat {CFG.label}</h2>
            <p className="page-subtitle">{form?.nomor || 'Memuat...'}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            icon={Edit2}
            onClick={() => navigate(`/${CFG.routeBase}/${id}/edit`)}
            className="whitespace-nowrap"
          >
            Edit
          </Button>
          <Button
            type="button"
            icon={FileDown}
            onClick={handleDownload}
            loading={isDownloading}
            className="whitespace-nowrap"
          >
            Download PDF
          </Button>
        </div>
      </div>

      {notice && (
        <div className="p-4 rounded-lg border bg-red-50 border-red-200 text-red-800 text-sm" role="alert">
          {notice.message}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : error ? (
        <Card>
          <p className="text-sm text-text-secondary">{error}</p>
        </Card>
      ) : (
        <Card className="!p-0 overflow-hidden">
          <div className="p-3 sm:p-4 bg-gray-100 max-h-[78vh] overflow-auto">
            <div className="w-fit mx-auto">
              <BastPreview form={form} />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
