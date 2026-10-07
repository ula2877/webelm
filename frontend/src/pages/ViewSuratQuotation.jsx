import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, Loader2, Edit2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import QuotationPreview from '../components/QuotationPreview';
import { buildPreviewHtml } from '../utils/quotationPrintHtml';
import * as suratService from '../services/surat';
import { formFromQuotationDetail } from '../utils/quotation';

export default function ViewSuratQuotation() {
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
        if (res?.status !== 'ok' || !res.data) {
          setError('Surat tidak ditemukan.');
          return;
        }
        setForm(formFromQuotationDetail(res.data));
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Gagal memuat surat.');
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
      const nomor = (form?.nomor || 'surat').replace(/[\\/:*?"<>|]+/g, '_');
      a.download = `Surat-Penawaran-${nomor}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setNotice({ type: 'error', message: err.message || 'Gagal membuat PDF surat.' });
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
            onClick={() => navigate('/letters/quotation')}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">Lihat Surat Penawaran</h2>
            <p className="page-subtitle">
              {form?.nomor || 'Memuat...'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            icon={Edit2}
            onClick={() => navigate(`/letters/quotation/${id}/edit`)}
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
              <QuotationPreview form={form} />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
