import { Router } from 'express';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { authenticatedUser } from '../supabase.js';

export const exportRouter = Router();
const clean = (value) => String(value || '').trim();
const filename = (ext) => `Agentic_Pymes_${new Date().toISOString().slice(0, 10)}.${ext}`;

function markdownCells(line) {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(line) {
  const cells = markdownCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')));
}

function markdownTables(content) {
  const lines = String(content || '').split(/\r?\n/);
  const tables = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes('|') || !isSeparatorRow(lines[index + 1])) continue;
    const rows = [markdownCells(lines[index])];
    index += 2;
    while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
      rows.push(markdownCells(lines[index]));
      index += 1;
    }
    index -= 1;
    if (rows.length > 1) tables.push(rows);
  }
  return tables;
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102A43' } };
  row.alignment = { vertical: 'middle', wrapText: true };
}

exportRouter.post('/exportar/excel', async (req, res) => {
  await authenticatedUser(req);
  const content = clean(req.body?.contenido);
  if (!content) return res.status(400).json({ error: 'No hay información para exportar.' });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Agentic Pymes';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Informe');
  sheet.columns = [{ header: 'INFORME DEL DIRECTOR', key: 'content', width: 110 }];
  styleHeader(sheet.getRow(1));
  sheet.getRow(1).height = 26;

  for (const line of content.split(/\r?\n/)) {
    const row = sheet.addRow([line || ' ']);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const tables = markdownTables(content);
  tables.forEach((rows, index) => {
    const tableSheet = workbook.addWorksheet(`Datos ${index + 1}`);
    const width = Math.max(...rows.map((row) => row.length));
    tableSheet.columns = Array.from({ length: width }, (_, column) => ({
      header: rows[0][column] || `Campo ${column + 1}`,
      width: Math.min(38, Math.max(14, ...rows.slice(1).map((row) => String(row[column] || '').length + 2))),
    }));
    styleHeader(tableSheet.getRow(1));
    rows.slice(1).forEach((values) => {
      const row = tableSheet.addRow(values);
      row.alignment = { vertical: 'top', wrapText: true };
    });
    tableSheet.views = [{ state: 'frozen', ySplit: 1 }];
  });

  const output = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename('xlsx')}"`);
  res.send(Buffer.from(output));
});

exportRouter.post('/exportar/presentacion', async (req, res) => {
  await authenticatedUser(req);
  const content = clean(req.body?.contenido);
  if (!content) return res.status(400).json({ error: 'No hay información para exportar.' });
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Agentic Pymes';
  const cover = pptx.addSlide();
  cover.background = { color: 'F7F9FC' };
  cover.addText('Agentic Pymes', { x: 0.8, y: 1.45, w: 11.7, h: 0.8, fontSize: 34, bold: true, color: '102A43' });
  cover.addText('Informe del Director', { x: 0.8, y: 2.4, w: 11.7, h: 0.5, fontSize: 20, color: '2563EB' });
  const chunks = content.match(/[\s\S]{1,1800}(?:\n|$)/g) || [content];
  for (let index = 0; index < Math.min(chunks.length, 12); index += 1) {
    const slide = pptx.addSlide();
    slide.addText(index === 0 ? 'Informe' : 'Informe — continuación', { x: 0.7, y: 0.45, w: 12, h: 0.5, fontSize: 24, bold: true, color: '102A43' });
    slide.addText(chunks[index], { x: 0.75, y: 1.25, w: 11.8, h: 5.8, fontSize: 15, color: '302A30', fit: 'shrink', valign: 'top' });
  }
  const output = await pptx.write({ outputType: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="${filename('pptx')}"`);
  res.send(Buffer.from(output));
});
