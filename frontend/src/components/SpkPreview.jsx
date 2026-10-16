import { Fragment, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LETTER_FOOTER_IMAGE, LETTER_HEADER_IMAGE } from '../utils/letterAssets';
import { SPK_TITLE, buildSpkInfoRows } from '../utils/spk';

// Live A4 preview untuk Surat Perintah Kerja (SPK).
// Struktur mengikuti pola BastPreview/QuotationPreview:
//   judul (center) -> tabel informasi (3 kolom) -> detail pekerjaan ->
//   tanda tangan. Header/footer artwork (letterhead/footer-strip) dipakai
//   persis seperti dokumen surat lainnya.
//
// Paginasi memakai measurement yang sama (BastPreview): tiap blok diukur
// sebagai SATU unit; bila tidak muat, blok dipindah ke halaman baru.
// Blok 'detail' berisi HTML deskripsi yang bisa lebih panjang dari satu
// halaman - ia dibagi secara sederhana seperti blok 'paragraph' di modul
// lain (lihat MEASURED_BLOCKS).

const PX_PER_MM = 96 / 25.4;

const PAGE_LAYOUT = {
  pageHeightMm: 297,
  contentTopOffsetMm: 5,
  contentBottomOffsetMm: 5,
  safetyMm: 2,
  headerAspect: 465 / 2277,
  footerAspect: 165 / 2275,
};

// Blok utama yang diukur satu per satu sebelum dipakarkan.
const MEASURED_BLOCKS = ['title', 'info', 'detail', 'signature'];

const frag = (key, node) => <Fragment key={key}>{node}</Fragment>;

export default function SpkPreview({ project }) {
  const headerImg = LETTER_HEADER_IMAGE;
  const footerImg = LETTER_FOOTER_IMAGE;

  const [measurements, setMeasurements] = useState(null);

  const measureRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);

  const renderTitle = () => (
    <div className="spk-title-block" data-mblock="title">
      <h1 className="spk-title">{SPK_TITLE}</h1>
    </div>
  );

  const renderInfo = () => (
    <table className="letter-table spk-info-table" data-mtable="true">
      <tbody>
        {buildSpkInfoRows(project).map((row) => (
          <tr key={row.label}>
            <td className="col-spk-label">{row.label}</td>
            <td className="col-spk-colon">{row.colon}</td>
            <td className="col-spk-value">{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderDetail = () => (
    <div data-mblock="detail">
      <div className="spk-detail-heading">Detail pekerjaan:</div>
      <div
        className="spk-detail-content"
        dangerouslySetInnerHTML={{ __html: project.descriptionHtml }}
      />
    </div>
  );

  const renderSignature = () => (
    <div className="letter-signature spk-signature" data-mblock="signature">
      <p className="spk-sig-mengetahui">Mengetahui,</p>
      <div className="letter-signature-box">
        {project.stampImage ? (
          <img
            src={project.stampImage}
            alt="Stempel"
            style={{
              transform: `translate(${Number(project.stampX) || 0}px, ${
                Number(project.stampY) || 0
              }px) scale(${(Number(project.stampZoom) || 100) / 100})`,
            }}
          />
        ) : null}
        {project.signatureImage ? (
          <img
            src={project.signatureImage}
            alt="Tanda tangan"
            style={{
              transform: `translate(${Number(project.signatureX) || 0}px, ${
                Number(project.signatureY) || 0
              }px) scale(${(Number(project.signatureZoom) || 100) / 100})`,
            }}
          />
        ) : null}
      </div>
      <p className="letter-signature signer-name">
        {project.penanggungJawab || '(Belum ada penanggung jawab)'}
      </p>
      <p className="letter-signature signer-title">Penanggung Jawab Projek</p>
    </div>
  );

  const measure = useCallback(() => {
    const root = measureRef.current;
    if (!root) return;

    const headerH = headerRef.current
      ? headerRef.current.getBoundingClientRect().height
      : 0;
    const footerH = footerRef.current
      ? footerRef.current.getBoundingClientRect().height
      : 0;

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

    setMeasurements({
      headerH,
      footerH,
      blocks,
      signatureH: blocks.signature || 0,
    });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, project]);

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
    return () => {
      window.removeEventListener('resize', measure);
    };
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
      // Sebelum selesai mengukur, tampilkan satu halaman agar tidak blank.
      return [
        [
          frag('title', renderTitle()),
          frag('info', renderInfo()),
          frag('detail', renderDetail()),
          frag('signature', renderSignature()),
        ],
      ];
    }

    const { blocks, signatureH } = measurements;
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

    place(frag('title', renderTitle()), blocks.title || 0);
    place(frag('info', renderInfo()), blocks.info || 0);
    place(frag('detail', renderDetail()), blocks.detail || 0);
    place(frag('signature', renderSignature()), signatureH);

    return out.map((p) => p.nodes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, contentMaxPx, project]);

  return (
    <div
      id="letter-print-root"
      className="letter-doc spk-root"
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
              <div data-mblock="title">{renderTitle()}</div>
              <div data-mblock="info">{renderInfo()}</div>
              <div data-mblock="detail">{renderDetail()}</div>
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
