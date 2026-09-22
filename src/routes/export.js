import { Router } from 'express';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { authenticatedUser } from '../supabase.js';

export const exportRouter = Router();
const clean = (value) => String(value || '').trim();
const filename = (ext) => `Agentic_Pymes_${new Date().toISOString().slice(0, 10)}.${ext}`;

exportRouter.post('/exportar/excel', async (req, res) => {
  await authenticatedUser(req);
  const content = clean(req.body?.contenido);
  if (!content) return res.status(400).json({ error: 'No hay información para exportar.' });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Agentic Pymes';
  const sheet = workbook.addWorksheet('Informe');
  sheet.columns = [{ header: 'INFORME DEL DIRECTOR', key: 'content', width: 110 }];
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C1F46' } };
  for (const line of content.split(/\r?\n/)) {
    const row = sheet.addRow([line || ' ']);
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  }
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
  cover.background = { color: 'F7F3F5' };
  cover.addText('Agentic Pymes', { x: 0.8, y: 1.45, w: 11.7, h: 0.8, fontSize: 34, bold: true, color: '191219' });
  cover.addText('Informe del Director', { x: 0.8, y: 2.4, w: 11.7, h: 0.5, fontSize: 20, color: '7C1F46' });
  const chunks = content.match(/[\s\S]{1,1800}(?:\n|$)/g) || [content];
  for (let index = 0; index < Math.min(chunks.length, 12); index += 1) {
    const slide = pptx.addSlide();
    slide.addText(index === 0 ? 'Informe' : 'Informe — continuación', { x: 0.7, y: 0.45, w: 12, h: 0.5, fontSize: 24, bold: true, color: '7C1F46' });
    slide.addText(chunks[index], { x: 0.75, y: 1.25, w: 11.8, h: 5.8, fontSize: 15, color: '302A30', fit: 'shrink', valign: 'top' });
  }
  const output = await pptx.write({ outputType: 'nodebuffer' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="${filename('pptx')}"`);
  res.send(Buffer.from(output));
});
