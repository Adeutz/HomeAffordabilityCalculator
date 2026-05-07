import { useState } from 'react';

// Lazy-loads jspdf + html2canvas only when the user clicks the button. They're
// big-ish libraries and we don't need to ship them on first load.
export default function ExportPdfButton({ targetSelector = '#pdf-target', filename = 'home-affordability.pdf' }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const target = document.querySelector(targetSelector);
      if (!target) throw new Error(`No element matched ${targetSelector}`);

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      // Force a temporary "light mode for PDF" so the export looks crisp on paper.
      target.classList.add('pdf-export');
      const canvas = await html2canvas(target, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      });
      target.classList.remove('pdf-export');

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = canvas.height / canvas.width;
      const renderWidth = pageWidth - 40;
      const renderHeight = renderWidth * ratio;

      let y = 20;
      let remaining = renderHeight;
      let sourceY = 0;

      // Slice the canvas across multiple pages if it's tall.
      while (remaining > 0) {
        const sliceHeight = Math.min(pageHeight - 40, remaining);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = (sliceHeight / renderWidth) * canvas.width;
        const ctx = sliceCanvas.getContext('2d');
        ctx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          sliceCanvas.height,
          0,
          0,
          canvas.width,
          sliceCanvas.height
        );
        pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', 20, y, renderWidth, sliceHeight);
        remaining -= sliceHeight;
        sourceY += sliceCanvas.height;
        if (remaining > 0) {
          pdf.addPage();
          y = 20;
        }
      }

      pdf.save(filename);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="button secondary small" disabled={busy} onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {busy ? 'Building PDF…' : 'Export PDF'}
    </button>
  );
}
