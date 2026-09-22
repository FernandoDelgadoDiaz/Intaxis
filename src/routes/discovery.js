import { Router } from 'express';
import ExcelJS from 'exceljs';
import { authenticatedUser } from '../supabase.js';
import { requireBusiness } from '../business-context.js';

export const discoveryRouter = Router();

const bandLabel = (value) => ({ low: 'Bajo', medium: 'Medio', high: 'Alto' }[value] || 'Sin dato');
const safeExcelFormulaString = (value) => String(value || '').replace(/"/g, '""');
const jsonCell = (value, fallback) => JSON.stringify(value ?? fallback);
const asArray = (value) => Array.isArray(value) ? value : [];

async function loadDiscovery(supabase, businessId, runId = null) {
  let runQuery = supabase.from('product_discovery_runs').select('*').eq('business_id', businessId);
  if (runId) runQuery = runQuery.eq('id', runId);
  else runQuery = runQuery.order('created_at', { ascending: false }).limit(1);

  const runResult = await runQuery.maybeSingle();
  if (runResult.error) throw runResult.error;
  if (!runResult.data) return null;
  const run = runResult.data;

  const [candidates, evidence, blueprints] = await Promise.all([
    supabase.from('product_discovery_candidates').select('*').eq('business_id', businessId).eq('discovery_run_id', run.id).order('rank'),
    supabase.from('product_discovery_evidence').select('*').eq('business_id', businessId).eq('discovery_run_id', run.id).order('created_at'),
    supabase.from('product_discovery_blueprints').select('*').eq('business_id', businessId),
  ]);
  for (const result of [candidates, evidence, blueprints]) if (result.error) throw result.error;

  const candidateIds = new Set((candidates.data || []).map((item) => item.id));
  return {
    run,
    candidates: candidates.data || [],
    evidence: evidence.data || [],
    blueprints: (blueprints.data || []).filter((item) => candidateIds.has(item.candidate_id)),
  };
}

function discoveryFilename(run) {
  const date = new Date(run.completed_at || run.created_at || Date.now()).toISOString().slice(0, 10);
  return `Descubrimiento_Oportunidades_${date}.xlsx`;
}

function headerStyle(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B61' } };
  row.alignment = { vertical: 'middle', wrapText: true };
}

function autosize(sheet, widths = {}) {
  sheet.columns.forEach((column, index) => {
    column.width = widths[index] || Math.min(42, Math.max(12, ...column.values.filter(Boolean).map((value) => String(value).length + 2)));
    column.alignment = { vertical: 'top', wrapText: true };
  });
}

discoveryRouter.get('/discovery', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const discovery = await loadDiscovery(supabase, business.id);
  res.json({ discovery });
});

discoveryRouter.get('/discovery/:id', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const discovery = await loadDiscovery(supabase, business.id, req.params.id);
  if (!discovery) return res.status(404).json({ error: 'La investigación no existe.' });
  res.json({ discovery });
});

discoveryRouter.post('/discovery/:id/select', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const candidateIds = Array.isArray(req.body?.candidate_ids)
    ? [...new Set(req.body.candidate_ids.map(String))].slice(0, 3)
    : [];
  if (!candidateIds.length) return res.status(400).json({ error: 'Seleccioná al menos un candidato.' });

  const current = await loadDiscovery(supabase, business.id, req.params.id);
  if (!current) return res.status(404).json({ error: 'La investigación no existe.' });
  const validIds = new Set(current.candidates.map((item) => item.id));
  if (candidateIds.some((id) => !validIds.has(id))) return res.status(400).json({ error: 'Hay candidatos que no pertenecen a esta investigación.' });

  const rejected = await supabase.from('product_discovery_candidates').update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('business_id', business.id).eq('discovery_run_id', current.run.id).not('id', 'in', `(${candidateIds.join(',')})`);
  if (rejected.error) throw rejected.error;

  const selected = await supabase.from('product_discovery_candidates').update({ status: 'selected', updated_at: new Date().toISOString() })
    .eq('business_id', business.id).eq('discovery_run_id', current.run.id).in('id', candidateIds);
  if (selected.error) throw selected.error;

  const approved = await supabase.from('product_discovery_runs').update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('business_id', business.id).eq('id', current.run.id);
  if (approved.error) throw approved.error;

  res.json({ ok: true, selected: candidateIds.length });
});

discoveryRouter.get('/discovery/:id/excel', async (req, res) => {
  const { supabase } = await authenticatedUser(req);
  const business = await requireBusiness(supabase);
  const discovery = await loadDiscovery(supabase, business.id, req.params.id);
  if (!discovery) return res.status(404).json({ error: 'La investigación no existe.' });

  const { run, candidates, evidence, blueprints } = discovery;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Agentic Pymes';
  workbook.company = business.name;
  workbook.created = new Date();
  const candidateById = new Map(candidates.map((item) => [item.id, item]));

  const summary = workbook.addWorksheet('Resumen');
  summary.addRow(['DESCUBRIMIENTO DE OPORTUNIDADES']);
  summary.mergeCells('A1:F1');
  summary.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF102A43' } };
  summary.addRow(['Negocio', business.name]);
  summary.addRow(['Investigación', run.title]);
  summary.addRow(['Estado investigación', run.status]);
  summary.addRow(['Estado desarrollo técnico', run.development_status || 'No iniciado']);
  summary.addRow(['Etapa desarrollo', run.development_stage || '']);
  summary.addRow(['Estado presentación / enriquecimiento', run.enrichment_status || 'No iniciado']);
  summary.addRow(['Etapa presentación / enriquecimiento', run.enrichment_stage || '']);
  summary.addRow(['Objetivo', run.objective || '']);
  summary.addRow(['Resumen ejecutivo', run.executive_summary || '']);
  summary.addRow(['Notas de recomendación', run.recommendation_notes || '']);
  summary.addRow(['Observación desarrollo', run.development_error_message || '']);
  summary.addRow(['Observación enriquecimiento', run.enrichment_error_message || '']);
  summary.addRow(['Alcance', JSON.stringify(run.scope || {})]);
  summary.getColumn(1).width = 36;
  summary.getColumn(2).width = 92;
  summary.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });

  const comparison = workbook.addWorksheet('Comparativo');
  comparison.addRow(['Ranking', 'Oferta', 'Aceptación', 'Score', 'Tendencia', 'Afinidad Argentina', 'Potencial visual', 'Complejidad operación', 'Riesgo específico', 'Complejidad costo', 'Presentación', 'Fundamento', 'Estado']);
  headerStyle(comparison.getRow(1));
  for (const item of candidates) {
    comparison.addRow([
      item.rank, item.name, bandLabel(item.acceptance_band),
      item.acceptance_score == null ? '' : Number(item.acceptance_score),
      bandLabel(item.trend_strength), bandLabel(item.argentina_fit), bandLabel(item.visual_potential),
      bandLabel(item.production_complexity), bandLabel(item.conservation_risk), bandLabel(item.cost_complexity),
      item.presentation || '', item.rationale || '', item.status,
    ]);
  }
  autosize(comparison, { 0: 10, 1: 30, 2: 16, 3: 10, 4: 16, 5: 18, 6: 18, 7: 20, 8: 18, 9: 18, 10: 34, 11: 56, 12: 14 });
  comparison.views = [{ state: 'frozen', ySplit: 1 }];
  comparison.autoFilter = { from: 'A1', to: 'M1' };

  const evidenceSheet = workbook.addWorksheet('Evidencia');
  evidenceSheet.addRow(['Mercado', 'País', 'Oferta', 'Tipo', 'Hallazgo', 'Métrica', 'Valor', 'Unidad', 'Fuente', 'URL', 'Confianza', 'Observado']);
  headerStyle(evidenceSheet.getRow(1));
  for (const item of evidence) {
    evidenceSheet.addRow([
      item.market_scope, item.country || '', candidateById.get(item.candidate_id)?.name || '', item.evidence_type,
      item.claim, item.metric_name || '', item.metric_value == null ? '' : Number(item.metric_value), item.metric_unit || '',
      item.source_name || '', item.source_url || '', item.confidence, item.observed_at || '',
    ]);
  }
  autosize(evidenceSheet, { 0: 15, 1: 18, 2: 30, 3: 18, 4: 62, 5: 18, 6: 12, 7: 12, 8: 28, 9: 52, 10: 14, 11: 22 });
  evidenceSheet.views = [{ state: 'frozen', ySplit: 1 }];
  evidenceSheet.autoFilter = { from: 'A1', to: 'L1' };

  const presentation = workbook.addWorksheet('Presentación');
  presentation.addRow(['Oferta', 'Presentación recomendada', 'Fundamento', 'Patrones observados', 'Prioridades visuales', 'Diferenciales', 'Qué evitar', 'Referencias']);
  headerStyle(presentation.getRow(1));
  for (const blueprint of blueprints) {
    const candidate = candidateById.get(blueprint.candidate_id);
    const strategy = blueprint.visual_strategy || {};
    presentation.addRow([
      candidate?.name || '',
      strategy.recommended_presentation || '',
      strategy.strategy_summary || '',
      jsonCell(strategy.market_patterns, []),
      jsonCell(strategy.visual_priorities, []),
      jsonCell(strategy.differentiators, []),
      jsonCell(strategy.avoid, []),
      jsonCell(blueprint.reference_media, []),
    ]);
  }
  autosize(presentation, { 0: 30, 1: 52, 2: 62, 3: 50, 4: 46, 5: 46, 6: 42, 7: 68 });
  presentation.views = [{ state: 'frozen', ySplit: 1 }];

  const images = workbook.addWorksheet('Imágenes');
  images.addRow(['Ranking', 'Oferta', 'Tipo', 'Imagen', 'URL imagen', 'Fuente / fundamento']);
  headerStyle(images.getRow(1));
  for (const item of candidates) {
    const blueprint = blueprints.find((row) => row.candidate_id === item.id);
    const aspiration = blueprint?.aspirational_media || {};
    if (/^https:\/\//i.test(aspiration.url || '')) {
      const row = images.addRow([item.rank, item.name, 'Aspiracional', '', aspiration.url, aspiration.disclaimer || 'Hipótesis visual basada en análisis de mercado']);
      row.height = 105;
      row.getCell(4).value = { formula: `IMAGE("${safeExcelFormulaString(aspiration.url)}","Aspiracional",3,100,130)` };
      row.getCell(5).value = { text: 'Abrir imagen', hyperlink: aspiration.url };
    }
    for (const ref of asArray(blueprint?.reference_media).slice(0, 6)) {
      const imageUrl = /^https:\/\//i.test(ref.image_url || '') ? ref.image_url : '';
      const row = images.addRow([item.rank, item.name, `Competencia · ${ref.market_scope || 'mercado'}`, '', imageUrl, ref.source_url || ref.source_name || '']);
      row.height = 95;
      if (imageUrl) {
        row.getCell(4).value = { formula: `IMAGE("${safeExcelFormulaString(imageUrl)}","Referencia",3,90,120)` };
        row.getCell(5).value = { text: 'Abrir imagen', hyperlink: imageUrl };
      } else if (/^https:\/\//i.test(ref.source_url || '')) {
        row.getCell(5).value = { text: 'Abrir fuente', hyperlink: ref.source_url };
      }
    }
    const legacyUrls = [item.image_url, ...evidence.filter((row) => row.candidate_id === item.id).map((row) => row.image_url)].filter(Boolean);
    for (const url of [...new Set(legacyUrls)].slice(0, 3)) {
      if (!/^https:\/\//i.test(url)) continue;
      const row = images.addRow([item.rank, item.name, 'Evidencia previa', '', url, item.image_source_url || '']);
      row.height = 95;
      row.getCell(4).value = { formula: `IMAGE("${safeExcelFormulaString(url)}","Referencia",3,90,120)` };
      row.getCell(5).value = { text: 'Abrir imagen', hyperlink: url };
    }
  }
  images.getColumn(1).width = 10;
  images.getColumn(2).width = 30;
  images.getColumn(3).width = 24;
  images.getColumn(4).width = 24;
  images.getColumn(5).width = 28;
  images.getColumn(6).width = 54;
  images.views = [{ state: 'frozen', ySplit: 1 }];

  const blueprintsSheet = workbook.addWorksheet('Ficha técnica');
  blueprintsSheet.addRow([
    'Oferta', 'Definición', 'Unidad / alcance', 'Porción g', 'Rendimiento',
    'Componentes / receta', 'Recursos', 'Instrucciones simples', 'Proceso técnico', 'Condiciones operativas',
    'Conservación', 'Alérgenos', 'Controles de calidad', 'Packaging / entrega',
    'Estado de costeo', 'Datos de costo faltantes', 'Notas calidad', 'Estado desarrollo', 'Estado aprobación',
  ]);
  headerStyle(blueprintsSheet.getRow(1));
  for (const blueprint of blueprints) {
    const candidate = candidateById.get(blueprint.candidate_id);
    const offer = blueprint.offer_definition || {};
    const costing = blueprint.costing || {};
    blueprintsSheet.addRow([
      candidate?.name || '', offer.summary || '', offer.unit_or_scope || '', blueprint.portion_grams ?? '', blueprint.yield_units ?? '',
      jsonCell(blueprint.ingredients, []), jsonCell(blueprint.resources, []), jsonCell(blueprint.human_instructions, []),
      jsonCell((blueprint.instructions || []).length ? blueprint.instructions : blueprint.process_steps, []),
      jsonCell(blueprint.operating_conditions, {}), jsonCell(blueprint.conservation, {}), jsonCell(blueprint.allergens, []),
      jsonCell(blueprint.quality_controls, []), jsonCell(blueprint.packaging, {}), costing.status || '', jsonCell(costing.required_inputs, []),
      blueprint.quality_notes || '', blueprint.development_status || '', blueprint.approval_status,
    ]);
  }
  autosize(blueprintsSheet, {
    0: 30, 1: 48, 2: 20, 3: 12, 4: 12, 5: 58, 6: 44, 7: 68, 8: 68, 9: 48,
    10: 52, 11: 34, 12: 44, 13: 42, 14: 20, 15: 48, 16: 52, 17: 18, 18: 18,
  });
  blueprintsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  blueprintsSheet.autoFilter = { from: 'A1', to: 'S1' };

  const output = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${discoveryFilename(run)}"`);
  res.send(Buffer.from(output));
});