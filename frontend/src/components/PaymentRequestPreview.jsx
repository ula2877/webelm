import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normalizeSpecifications } from '../utils/suratJenis';
import {
  PPB_PARAGRAF_DOKUMEN,
  PPB_PARAGRAF_PEMBAYARAN,
  PPB_PARAGRAF_PENUTUP,
  buildPpIdentitas,
  buildPpPembuka,
  buildPpTujuan,
  formatLampiran,
  formatTanggalID,
} from '../utils/paymentRequest';
import { LETTER_HEADER_IMAGE, LETTER_FOOTER_IMAGE } from '../utils/letterAssets';

// Live A4 preview untuk Surat Permohonan Pembayaran.
// Urutan blok mengikuti dokumen referensi:
//   judul -> Nomor -> Lampiran/Perihal -> "Yth." + "di Tempat" ->
//   "Dengan hormat," -> dasar (SPK + BAST) -> identitas perusahaan ->
//   "selaku Penyedia, ..." -> TABEL -> mohon pembayaran ->
//   pengantar + daftar dokumen pendukung -> penutup -> tanda tangan.
//
// Pola paginasi sama dengan InspectionRequestPreview: satu page = satu sheet
// A4, tabel dipecah per baris dengan header berulang.

const PX_PER_MM = 96 / 25.4;

const PAGE_LAYOUT = {
  pageHeightMm: 297,
  contentTopOffsetMm: 5,
  contentBottomOffsetMm: 5,
  safetyMm: 2,
  headerAspect: 465 / 2277,
  footerAspect: 165 / 2275,
};

const MEASURED_BLOCKS = [
  'judul',
  'infoSurat',
  'tujuan',
  'hormat',
  'dasar',
  'identitas',
  'permohonan',
  'pembayaran',
  'dokumen',
  'penutup',
  'signature',
];

const frag = (key, node) => <Fragment key={key}>{node}</Fragment>;

const withIndex = (items) => (items || []).map((item, index) => ({ item, index }));

export default function PaymentRequestPreview({ form }) {
  const headerImg = LETTER_HEADER_IMAGE;
  const footerImg = LETTER_FOOTER_IMAGE;

  const indexedItems = useMemo(() => withIndex(form.items), [form.items]);
  const tujuanLines = useMemo(
    () => buildPpTujuan(form.tujuanJabatan, form.tujuanInstansi),
    [form.tujuanJabatan, form.tujuanInstansi]
  );
  const identitasLines = useMemo(
    () => buildPpIdentitas(form.perusahaanNama, form.perusahaanAlamat),
    [form.perusahaanNama, form.perusahaanAlamat]
  );
  const dokumenLines = useMemo(
    () => (form.dokumenPendukung || []).map((d) => String(d).trim()).filter(Boolean),
    [form.dokumenPendukung]
  );

  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const [measurements, setMeasurements] = useState(null);

  const renderJudul = () => (
    <div className="ppb-title-block">
      <h1 className="ppb-title">SURAT PERMOHONAN PEMBAYARAN</h1>
      <p className="ppb-nomor">Nomor : {form.nomor || '-'}</p>
    </div>
  );

  const renderInfoSurat = () => (
    <div className="ppb-lines">
      <p className="ppb-line">
        <span className="ppb-label">Lampiran</span>
        <span>: {formatLampiran(form.lampiran)}</span>
      </p>
      <p className="ppb-line">
        <span className="ppb-label">Perihal</span>
        <span>: {form.perihal || '-'}</span>
      </p>
    </div>
  );

  // Dokumen referensi memakai "Yth." lalu jabatan, instansi, "di Tempat".
  const renderTujuan = () => (
    <div className="ppb-tujuan">
      <p className="ppb-line">
        Yth. <br />
        {tujuanLines.length === 0 ? (
          '-'
        ) : (
          tujuanLines.map((line, i) => (
            // Isi baris tujuan bisa diubah user, jadi key ikut unik.
            // eslint-disable-next-line react/no-array-index-key
            <span key={`${line}-${i}`}>
              {line}
              <br />
            </span>
          ))
        )}
        di Tempat
      </p>
    </div>
  );

  const renderHormat = () => <p className="ppb-para">Dengan hormat,</p>;

  const renderDasar = () => (
    <p className="ppb-para ppb-para-justify">
      {buildPpPembuka({
        namaPekerjaan: form.namaPekerjaan,
        nomorSPK: form.nomorSPK,
        tanggalSPK: form.tanggalSPK,
        nomorBAST: form.nomorBAST,
        tanggalBAST: form.tanggalBAST,
      })}
    </p>
  );

  const renderIdentitas = () => (
    <div className="ppb-identitas">
      {identitasLines.map((row) => (
        <p className="ppb-line" key={row.label}>
          <span className="ppb-label ppb-label-wide">{row.label}</span>
          <span>: {row.nilai}</span>
        </p>
      ))}
    </div>
  );

  const renderPermohonan = () => (
    <p className="ppb-para ppb-para-justify">
      selaku Penyedia, mengajukan permohonan pembayaran atas pekerjaan yang telah selesai
      dilaksanakan dan telah diserahterimakan. Adapun pekerjaan yang telah dilaksanakan adalah
      sebagai berikut:
    </p>
  );

  const renderTable = (rows) => (
    <table className="letter-table ppb-table">
      <thead>
        <tr>
          <th className="col-no">No</th>
          <th className="col-komponen">Komponen</th>
          <th className="col-vol">Vol</th>
          <th className="col-satuan">Satuan</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={4} className="text-center italic text-gray-400">
              Belum ada pekerjaan
            </td>
          </tr>
        ) : (
          rows.map(({ item, index }) => {
            const specs = normalizeSpecifications(item.spesifikasi);
            return (
              <tr key={item.id || index}>
                <td className="col-no text-center align-top">{index + 1}</td>
                <td className="col-komponen align-top">
                  <p className="font-semibold">{item.nama_komponen || '-'}</p>
                  {specs.length > 0 && (
                    <>
                      <p className="ppb-spec-label">Spesifikasi:</p>
                      <ol className="ppb-spec-list">
                        {specs.map((spec, i) => (
                          <li key={i}>{spec}</li>
                        ))}
                      </ol>
                    </>
                  )}
                </td>
                <td className="col-vol text-center align-top">{Number(item.volume) || 0}</td>
                <td className="col-satuan align-top">{item.satuan || '-'}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );

  const renderPembayaran = () => <p className="ppb-para ppb-para-justify">{PPB_PARAGRAF_PEMBAYARAN}</p>;

  // Pengantar + daftar dokumen pendukung; semua tapi poin terakhir pakai ";".
  const renderDokumen = () => (
    <div>
      <p className="ppb-para ppb-para-justify">{PPB_PARAGRAF_DOKUMEN}</p>
      {dokumenLines.length === 0 ? (
        <p className="ppb-line">-</p>
      ) : (
        <ol className="ppb-dokumen-list">
          {dokumenLines.map((d, i) => (
            <li key={`${d}-${i}`}>
              {d}
              {i === dokumenLines.length - 1 ? '.' : ';'}
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const renderPenutup = () => <p className="ppb-para ppb-para-justify">{PPB_PARAGRAF_PENUTUP}</p>;

  const renderSignature = () => (
    <table className="ppb-signature-table">
      <tbody>
        <tr>
          <td className="ppb-sig-spacer" />
          <td>
            <p className="ppb-sig-city">
              {form.city || 'Surabaya'}, {formatTanggalID(form.tanggal)}
            </p>
            <p className="ppb-sig-hormat">Hormat kami,</p>
            <p className="ppb-sig-company">{form.companyName || '-'}</p>
            <div className="ppb-sig-box">
              {form.useStamp && form.stampImage ? (
                <img
                  src={form.stampImage}
                  alt="Stempel"
                  style={{
                    transform: `translate(${Number(form.stampX) || 0}px, ${
                      Number(form.stampY) || 0
                    }px) scale(${(Number(form.stampZoom) || 100) / 100})`,
                  }}
                />
              ) : null}
              {form.useSignature && form.signatureImage ? (
                <img
                  src={form.signatureImage}
                  alt="Tanda tangan"
                  style={{
                    transform: `translate(${Number(form.signatureX) || 0}px, ${
                      Number(form.signatureY) || 0
                    }px) scale(${(Number(form.signatureZoom) || 100) / 100})`,
                  }}
                />
              ) : null}
            </div>
            <p className="ppb-sig-name">({form.signerName || '-'})</p>
            <p className="ppb-sig-title">{form.signerTitle || '-'}</p>
          </td>
        </tr>
      </tbody>
    </table>
  );

  const measure = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;

    const headerH = headerRef.current ? headerRef.current.getBoundingClientRect().height : 0;
    const footerH = footerRef.current ? footerRef.current.getBoundingClientRect().height : 0;

    const blocks = {};
    MEASURED_BLOCKS.forEach((key) => {
      const el = root.querySelector(`[data-mblock="${key}"]`);
      if (!el) {
        blocks[key] = 0;
        return;
      }
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
      rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) =>
        tr.getBoundingClientRect().height
      );
    }

    setMeasurements({ headerH, footerH, blocks, tableHeaderH, rows });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, form]);

  useLayoutEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return undefined;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
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
    // Sebelum selesai mengukur, tampilkan satu halaman agar tidak blank.
    if (!measurements) {
      return [
        [
          frag('judul', renderJudul()),
          frag('infoSurat', renderInfoSurat()),
          frag('tujuan', renderTujuan()),
          frag('hormat', renderHormat()),
          frag('dasar', renderDasar()),
          frag('identitas', renderIdentitas()),
          frag('permohonan', renderPermohonan()),
          frag('table', renderTable(indexedItems)),
          frag('pembayaran', renderPembayaran()),
          frag('dokumen', renderDokumen()),
          frag('penutup', renderPenutup()),
          frag('signature', renderSignature()),
        ],
      ];
    }

    const { blocks, tableHeaderH, rows } = measurements;
    const out = [];
    let page = { nodes: [], used: 0 };
    out.push(page);

    const newPage = () => {
      page = { nodes: [], used: 0 };
      out.push(page);
    };
    const place = (node, height) => {
      if (page.used + height > contentMaxPx && page.nodes.length) newPage();
      page.nodes.push(node);
      page.used += height;
    };

    place(frag('judul', renderJudul()), blocks.judul || 0);
    place(frag('infoSurat', renderInfoSurat()), blocks.infoSurat || 0);
    place(frag('tujuan', renderTujuan()), blocks.tujuan || 0);
    place(frag('hormat', renderHormat()), blocks.hormat || 0);
    place(frag('dasar', renderDasar()), blocks.dasar || 0);
    place(frag('identitas', renderIdentitas()), blocks.identitas || 0);
    place(frag('permohonan', renderPermohonan()), blocks.permohonan || 0);

    if (indexedItems.length === 0) {
      place(frag('table-empty', renderTable([])), tableHeaderH + (rows[0] || 0));
    } else {
      let buffer = [];
      let bufferH = 0;
      const flush = () => {
        if (!buffer.length) return;
        page.nodes.push(frag(`table-${buffer[0].index}`, renderTable(buffer)));
        page.used += tableHeaderH + bufferH;
        buffer = [];
        bufferH = 0;
      };

      indexedItems.forEach((row) => {
        const rowH = rows[row.index] || 0;
        if (
          page.used + tableHeaderH + bufferH + rowH > contentMaxPx &&
          (bufferH > 0 || page.nodes.length)
        ) {
          flush();
          newPage();
        }
        buffer.push(row);
        bufferH += rowH;
      });
      flush();
    }

    place(frag('pembayaran', renderPembayaran()), blocks.pembayaran || 0);
    place(frag('dokumen', renderDokumen()), blocks.dokumen || 0);
    place(frag('penutup', renderPenutup()), blocks.penutup || 0);
    place(frag('signature', renderSignature()), blocks.signature || 0);

    return out.map((p) => p.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, contentMaxPx, form, indexedItems, tujuanLines, identitasLines, dokumenLines]);

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
              <div data-mblock="judul">{renderJudul()}</div>
              <div data-mblock="infoSurat">{renderInfoSurat()}</div>
              <div data-mblock="tujuan">{renderTujuan()}</div>
              <div data-mblock="hormat">{renderHormat()}</div>
              <div data-mblock="dasar">{renderDasar()}</div>
              <div data-mblock="identitas">{renderIdentitas()}</div>
              <div data-mblock="permohonan">{renderPermohonan()}</div>
              <div data-mtable="true">{renderTable(indexedItems)}</div>
              <div data-mblock="pembayaran">{renderPembayaran()}</div>
              <div data-mblock="dokumen">{renderDokumen()}</div>
              <div data-mblock="penutup">{renderPenutup()}</div>
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
            <img
              src={headerImg}
              alt="Header surat"
              className="a4-page-header"
              style={{ aspectRatio: `1 / ${PAGE_LAYOUT.headerAspect}` }}
            />
            <div className="a4-page-content letter-doc">{nodes}</div>
            <img
              src={footerImg}
              alt="Footer surat"
              className="a4-page-footer"
              style={{ aspectRatio: `1 / ${PAGE_LAYOUT.footerAspect}` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
