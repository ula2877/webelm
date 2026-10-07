import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildInvoiceTotals,
  computeItemSubtotal,
  normalizeSpecifications,
  formatDocNumber,
  formatLongDateID,
  INVOICE_BANK,
} from '../utils/invoice';
import { LETTER_HEADER_IMAGE, LETTER_FOOTER_IMAGE } from '../utils/letterAssets';

// Live A4 preview untuk INVOICE. Pola sama dengan QuotationPreview:
// setiap page = satu A4 sheet, dicopy ke PDF via HTML Live Preview.

const PX_PER_MM = 96 / 25.4;

const PAGE_LAYOUT = {
  pageHeightMm: 297,
  contentTopOffsetMm: 5,
  contentBottomOffsetMm: 5,
  safetyMm: 2,
  headerAspect: 465 / 2277,
  footerAspect: 165 / 2275,
};
const MEASURED_BLOCKS = ['header', 'totals', 'notes', 'bank', 'signature'];

const frag = (key, node) => <Fragment key={key}>{node}</Fragment>;

export default function InvoicePreview({ form }) {
  const notes = (form.notes || []).filter((n) => String(n).trim() !== '');
  const longDate = formatLongDateID(form.tanggal);
  const headerImg = LETTER_HEADER_IMAGE;
  const footerImg = LETTER_FOOTER_IMAGE;

  const { total, ppn, grandTotal } = buildInvoiceTotals(
    form.items,
    form.usePPN,
    form.ppnRate
  );

  const itemsWithIndex = useMemo(
    () => (form.items || []).map((item, index) => ({ item, index })),
    [form.items]
  );

  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const [measurements, setMeasurements] = useState(null);

  // Header invoice: judul INVOICE (center) + layout 2 kolom.
  // Kolom kiri  = customer (nama bold + alamat, wrap otomatis).
  // Kolom kanan = informasi invoice (tabel stabil: label rata
  // kiri, ":" sejajar, value mulai di posisi yang sama).
  const renderHeader = () => (
    <div className="letter-invoice-header-block">
      <h1 className="invoice-title">INVOICE</h1>
      <div className="letter-invoice-header">
        <div className="letter-invoice-customer">
          <p className="customer-name">{form.customerName || '-'}</p>
          <p className="customer-address">{form.customerAddress || '-'}</p>
        </div>
        <table className="letter-invoice-meta">
          <tbody>
            <tr><td className="w-[32mm]">Tgl. Invoice</td><td className="w-[3mm]">:</td><td>{longDate}</td></tr>
            <tr><td>No. Invoice</td><td>:</td><td>{form.nomor || '-'}</td></tr>
            <tr><td>Nomor Penawaran</td><td>:</td><td>{form.nomorPenawaran || '-'}</td></tr>
            <tr><td>Nomor PO/SPK</td><td>:</td><td>{form.nomorPo || '-'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTable = (rows, measureAttr) => (
    <table className="letter-table" {...(measureAttr ? { 'data-mtable': 'true' } : {})}>
      <thead>
        <tr>
          <th className="col-no">No</th>
          <th className="col-komponen">Komponen</th>
          <th className="col-harga">Harga</th>
          <th className="col-vol">Vol</th>
          <th className="col-satuan">Satuan</th>
          <th className="col-subtotal">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={6} className="text-center italic text-gray-400">Belum ada komponen</td></tr>
        ) : (
          rows.map(({ item, index }) => {
            const specs = normalizeSpecifications(item.spesifikasi);
            return (
              <tr key={item.id || index}>
                <td className="col-no text-center align-top">{index + 1}</td>
                <td className="col-komponen align-top">
                  <p className="font-semibold">{item.nama_komponen || '-'}</p>
                  {specs.length > 0 && (
                    <ol className="letter-spec-list">
                      {specs.map((spec, i) => (<li key={i}>{spec}</li>))}
                    </ol>
                  )}
                </td>
                <td className="col-harga text-right align-top whitespace-nowrap">{formatDocNumber(item.harga_satuan)}</td>
                <td className="col-vol text-center align-top">{Number(item.volume) || 0}</td>
                <td className="col-satuan align-top">{item.satuan || '-'}</td>
                <td className="col-subtotal text-right align-top whitespace-nowrap">{formatDocNumber(computeItemSubtotal(item))}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  const renderTotals = () => (
    <div className="letter-totals">
      <table className="letter-totals-table">
        <tbody>
          <tr><td>Total</td><td className="text-right">{formatDocNumber(total)}</td></tr>
          <tr><td>PPN{form.usePPN ? ` (${Number(form.ppnRate) || 0}%)` : ''}</td><td className="text-right">{formatDocNumber(ppn)}</td></tr>
          <tr className="grand"><td>Grand Total</td><td className="text-right">{formatDocNumber(grandTotal)}</td></tr>
        </tbody>
      </table>
    </div>
  );

  const renderNotes = () => (
    <div className="letter-notes">
      <p className="font-semibold">Keterangan:</p>
      <ol className="letter-spec-list">
        {notes.map((note, i) => (<li key={i}>{note}</li>))}
      </ol>
    </div>
  );

  // Informasi pembayaran paten - tabel 4 kolom.
  const renderBank = () => (
    <div className="invoice-bank">
      <p className="invoice-bank-title">Pembayaran dilakukan di rekening:</p>
      <table className="invoice-bank-table">
        <thead>
          <tr>
            <th className="col-bank-name">Nama Bank</th>
            <th className="col-bank-account">Rekening</th>
            <th className="col-bank-owner">Nama Pemilik</th>
            <th className="col-bank-branch">Cabang</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{INVOICE_BANK.bankName}</td>
            <td>{INVOICE_BANK.bankAccount}</td>
            <td>{INVOICE_BANK.bankOwner}</td>
            <td>{INVOICE_BANK.bankBranch}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderSignature = () => (
    <div className="letter-signature">
      <p>Hormat Kami,</p>
      <p className="font-bold">{form.companyName || '-'}</p>
      <div className="letter-signature-box">
        {form.useStamp && form.stampImage ? (
          <img
            src={form.stampImage}
            alt="Stempel"
            style={{
              transform: `translate(${Number(form.stampX) || 0}px, ${Number(form.stampY) || 0}px) scale(${(Number(form.stampZoom) || 100) / 100})`,
            }}
          />
        ) : null}
        {form.useSignature && form.signatureImage ? (
          <img
            src={form.signatureImage}
            alt="Tanda tangan"
            style={{
              transform: `translate(${Number(form.signatureX) || 0}px, ${Number(form.signatureY) || 0}px) scale(${(Number(form.signatureZoom) || 100) / 100})`,
            }}
          />
        ) : null}
      </div>
      <p className="signer-name">{form.signerName || '-'}</p>
      <p>{form.signerTitle || '-'}</p>
    </div>
  );

  const measure = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;

    const headerH = headerRef.current ? headerRef.current.getBoundingClientRect().height : 0;
    const footerH = footerRef.current ? footerRef.current.getBoundingClientRect().height : 0;

    const blocks = {};
    MEASURED_BLOCKS.forEach((key) => {
      const el = root.querySelector(`[data-mblock="${key}"]`);
      if (!el) { blocks[key] = 0; return; }
      const inner = el.firstElementChild || el;
      const cs = window.getComputedStyle(inner);
      const margins = (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
      blocks[key] = inner.getBoundingClientRect().height + margins;
    });

    const table = root.querySelector('[data-mtable]');
    let tableHeaderH = 0;
    let rows = [];
    if (table) {
      const thead = table.querySelector('thead');
      tableHeaderH = thead ? thead.getBoundingClientRect().height : 0;
      rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => tr.getBoundingClientRect().height);
    }

    setMeasurements({ headerH, footerH, blocks, tableHeaderH, rows });
  }, []);

  useLayoutEffect(() => { measure(); }, [measure, form]);

  useLayoutEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return undefined;
    let cancelled = false;
    document.fonts.ready.then(() => { if (!cancelled) measure(); });
    return () => { cancelled = true; };
  }, [measure]);

  useLayoutEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const contentMaxPx = measurements
    ? PAGE_LAYOUT.pageHeightMm * PX_PER_MM -
      measurements.headerH -
      measurements.footerH -
      (PAGE_LAYOUT.contentTopOffsetMm + PAGE_LAYOUT.contentBottomOffsetMm) * PX_PER_MM -
      PAGE_LAYOUT.safetyMm * PX_PER_MM
    : Infinity;

  const pages = useMemo(() => {
    if (!measurements) {
      return [[
        frag('header', renderHeader()),
        frag('table', renderTable(itemsWithIndex, false)),
        frag('totals', renderTotals()),
        ...(notes.length ? [frag('notes', renderNotes())] : []),
        frag('bank', renderBank()),
        frag('signature', renderSignature()),
      ]];
    }

    const { blocks, tableHeaderH, rows } = measurements;
    const out = [];
    let page = { nodes: [], used: 0 };
    out.push(page);

    const newPage = () => { page = { nodes: [], used: 0 }; out.push(page); };
    const place = (node, height) => {
      if (page.used + height > contentMaxPx && page.nodes.length) newPage();
      page.nodes.push(node);
      page.used += height;
    };

    place(frag('header', renderHeader()), blocks.header || 0);

    if (itemsWithIndex.length === 0) {
      place(frag('table-empty', renderTable([], false)), tableHeaderH + (rows[0] || 0));
    } else {
      let buffer = [];
      let bufferH = 0;
      const flush = () => {
        if (!buffer.length) return;
        page.nodes.push(frag(`table-${buffer[0].index}`, renderTable(buffer, false)));
        page.used += tableHeaderH + bufferH;
        buffer = [];
        bufferH = 0;
      };

      itemsWithIndex.forEach((row) => {
        const rowH = rows[row.index] || 0;
        if (page.used + tableHeaderH + bufferH + rowH > contentMaxPx && (bufferH > 0 || page.nodes.length)) {
          flush();
          newPage();
        }
        buffer.push(row);
        bufferH += rowH;
      });
      flush();
    }

    place(frag('totals', renderTotals()), blocks.totals || 0);
    if (notes.length) place(frag('notes', renderNotes()), blocks.notes || 0);
    place(frag('bank', renderBank()), blocks.bank || 0);
    place(frag('signature', renderSignature()), blocks.signature || 0);

    return out.map((p) => p.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, contentMaxPx, form, itemsWithIndex, notes.length]);

  return (
    <div
      id="letter-print-root"
      className="letter-doc"
      style={{
        '--letter-header-h': measurements ? `${measurements.headerH}px` : undefined,
        '--letter-footer-h': measurements ? `${measurements.footerH}px` : undefined,
        '--letter-content-pad-top': `calc(${PAGE_LAYOUT.contentTopOffsetMm}mm + var(--letter-header-h, 43mm))`,
        '--letter-content-pad-bottom': `calc(${PAGE_LAYOUT.contentBottomOffsetMm}mm + var(--letter-footer-h, 15.2mm))`,
      }}
    >
      {typeof document !== 'undefined' &&
        createPortal(
          <div ref={measureRef} className="letter-measure letter-doc" aria-hidden="true">
            <img
              ref={headerRef}
              src={headerImg}
              alt=""
              className="letter-measure-header"
              style={{ aspectRatio: `1 / ${PAGE_LAYOUT.headerAspect}` }}
              onLoad={measure}
            />
            <div className="letter-measure-content">
              <div data-mblock="header">{renderHeader()}</div>
              {renderTable(itemsWithIndex, true)}
              <div data-mblock="totals">{renderTotals()}</div>
              <div data-mblock="notes">{renderNotes()}</div>
              <div data-mblock="bank">{renderBank()}</div>
              <div data-mblock="signature">{renderSignature()}</div>
            </div>
            <img
              ref={footerRef}
              src={footerImg}
              alt=""
              className="letter-measure-footer"
              style={{ aspectRatio: `1 / ${PAGE_LAYOUT.footerAspect}` }}
              onLoad={measure}
            />
          </div>,
          document.body
        )}

      <div className="a4-document">
        {pages.map((nodes, i) => (
          <div className="a4-page" key={i}>
            <img src={headerImg} alt="Header surat" className="a4-page-header" style={{ aspectRatio: `1 / ${PAGE_LAYOUT.headerAspect}` }} />
            <div className="a4-page-content letter-doc">{nodes}</div>
            <img src={footerImg} alt="Footer surat" className="a4-page-footer" style={{ aspectRatio: `1 / ${PAGE_LAYOUT.footerAspect}` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
