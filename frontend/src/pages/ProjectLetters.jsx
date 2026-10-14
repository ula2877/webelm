import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Eye, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import * as projectService from '../services/projects';
import { rupiah } from '../utils/quotation';

// Halaman Surat-Surat Projek: seluruh dokumen terkait sebuah projek,
// diakses dari tombol "Surat-Surat" pada View Projek. Projek di-resolve
// dari UUID; backend yang memastikan dokumen benar-benar berkaitan dengan
// projek melalui relasi sumber invoice (JSON `data` tb_surat).
//
// Dua kelompok dokumen:
//  - invoices : invoice yang sumberProjectId = projek ini.
//  - related  : surat lain yang sumberInvoiceId merujuk ke invoice di atas.
//
// Mapping jenis surat -> label & route view (semua route sudah ada).
const JENIS_META = {
  invoice: { label: 'Invoice', routeBase: 'invoice' },
  'delivery-note': { label: 'Surat Jalan', routeBase: 'delivery-note' },
  bast: { label: 'BAST', routeBase: 'handover' },
  'inspection-request': { label: 'Permohonan Pemeriksaan', routeBase: 'inspection-request' },
  'payment-request': { label: 'Permohonan Pembayaran', routeBase: 'payment-request' },
  kuitansi: { label: 'Kuitansi', routeBase: 'receipt' },
};

// Arahkan ke halaman view dokumen yang sudah ada per jenis surat.
function viewUrl(jenis, id) {
  const meta = JENIS_META[jenis] || { routeBase: jenis };
  return `/letters/${meta.routeBase}/${id}/view`;
}

function formatTanggal(dateStr) {
  if (!dateStr || dateStr === '0000-00-00') return '-';
  try {
    const date = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
}

export default function ProjectLetters() {
  const navigate = useNavigate();
  const { uuid } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [related, setRelated] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    Promise.all([
      projectService.fetchProjectDetailByUuid(uuid).catch(() => null),
      projectService.fetchProjectLetters(uuid),
    ])
      .then(([projRes, lettersRes]) => {
        if (cancelled) return;
        if (projRes?.status === 'ok' && projRes.data) {
          setProjectName(projRes.data.judul || projRes.data.name || 'Projek');
          const client = projRes.data.client;
          setClientName(client?.nama || '');
        }
        if (lettersRes?.status !== 'ok' || !lettersRes.data) {
          setError('Gagal memuat dokumen terkait projek.');
          return;
        }
        setInvoices(Array.isArray(lettersRes.data.invoices) ? lettersRes.data.invoices : []);
        setRelated(Array.isArray(lettersRes.data.related) ? lettersRes.data.related : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Gagal memuat dokumen terkait projek.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uuid]);

  const renderViewButton = (jenis, id, nomor) => (
    <button
      type="button"
      onClick={() => navigate(viewUrl(jenis, id))}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 transition-colors"
      title={`Lihat ${nomor || 'dokumen'}`}
    >
      <Eye className="w-3.5 h-3.5" />
      Lihat
    </button>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate(`/projects/${uuid}`)}
            className="mt-0.5 p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-gray-100 transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="page-title">
              {projectName || 'Surat-Surat Projek'}
            </h2>
            <p className="page-subtitle">{clientName || 'Memuat dokumen...'}</p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <Card>
          <p className="text-sm text-error">{error}</p>
        </Card>
      )}

      {!isLoading && !error && (
        <>
          {/* Card Invoice */}
          <Card>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary-600" />
                </span>
                Invoice dari Projek
              </h3>
              <span className="text-xs font-medium text-text-muted">{invoices.length} dokumen</span>
            </div>
            {invoices.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Belum ada invoice"
                description="Invoice yang dibuat dari projek ini akan muncul di sini."
              />
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5 pr-4">Nomor Invoice</th>
                      <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5 pr-4">Tanggal</th>
                      <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5 pr-4">Customer</th>
                      <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5 pr-4">Nominal</th>
                      <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 pr-4 font-medium text-text-primary whitespace-nowrap">{inv.nomor || '-'}</td>
                        <td className="py-3 pr-4 text-text-secondary whitespace-nowrap">{formatTanggal(inv.tanggal)}</td>
                        <td className="py-3 pr-4 text-text-primary min-w-0 max-w-[220px] truncate">{inv.pengirim || '-'}</td>
                        <td className="py-3 pr-4 text-right text-text-primary font-medium whitespace-nowrap">{rupiah(inv.total ?? 0)}</td>
                        <td className="py-3 text-right">{renderViewButton('invoice', inv.id, inv.nomor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Card Surat Terkait */}
          <Card>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary-600" />
                </span>
                Surat Terkait
              </h3>
              <span className="text-xs font-medium text-text-muted">{related.length} dokumen</span>
            </div>
            {related.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Belum ada surat terkait"
                description="Surat Jalan, BAST, Permohonan Pemeriksaan/Pembayaran, dan Kuitansi yang dibuat dari invoice projek ini akan muncul di sini."
              />
            ) : (
              <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5 pr-4">Jenis Surat</th>
                      <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5 pr-4">Nomor Surat</th>
                      <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5 pr-4">Tanggal</th>
                      <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5 pr-4">Nomor Invoice Sumber</th>
                      <th className="text-right text-xs font-semibold text-text-muted uppercase tracking-wider py-2.5">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {related.map((surat) => {
                      const meta = JENIS_META[surat.jenis] || { label: surat.jenis };
                      return (
                        <tr key={surat.id} className="border-b border-border last:border-0 hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 pr-4 text-text-primary whitespace-nowrap">{meta.label}</td>
                          <td className="py-3 pr-4 font-medium text-text-primary whitespace-nowrap">{surat.nomor || '-'}</td>
                          <td className="py-3 pr-4 text-text-secondary whitespace-nowrap">{formatTanggal(surat.tanggal)}</td>
                          <td className="py-3 pr-4 text-text-secondary whitespace-nowrap">{surat.nomorInvoice || '-'}</td>
                          <td className="py-3 text-right">{renderViewButton(surat.jenis, surat.id, surat.nomor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
