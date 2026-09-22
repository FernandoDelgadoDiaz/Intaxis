-- Configuración vertical del negocio piloto. No forma parte del core genérico.
insert into public.business_profiles (
  business_id, industry, business_model, offer_mode,
  target_market, discovery_context, operational_context, terminology, vertical_config
)
select
  b.id,
  'Alimentos y bebidas · postres individuales',
  'Producción artesanal de baja escala con validación por piloto y reinversión',
  'product',
  '{"primary":"Río Gallegos, Santa Cruz","secondary":"Argentina","international_benchmark":true}'::jsonb,
  '{"objective":"Definir tres variedades iniciales con evidencia nacional e internacional","category":"postres individuales","differentiation":"presentación visual en envase transparente tipo lata, capas visibles y apertura como parte de la experiencia","candidate_count":3,"priority_signals":["interacción","interés comercial observable","tendencias","competencia","presentación","sabores"]}'::jsonb,
  '{"initial_scale":"baja escala","growth":"reinversión gradual","physical_execution":"producción y entrega siguen requiriendo trabajo humano"}'::jsonb,
  '{"offer_singular":"producto","offer_plural":"productos","component":"insumo","process":"producción","operator":"operario"}'::jsonb,
  '{"requires_recipe":true,"requires_conservation":true,"requires_food_safety_review":true,"visual_experience_is_product_attribute":true}'::jsonb
from public.businesses b
where b.name = 'Postres Experiencia'
on conflict (business_id) do update set
  industry = excluded.industry,
  business_model = excluded.business_model,
  offer_mode = excluded.offer_mode,
  target_market = excluded.target_market,
  discovery_context = excluded.discovery_context,
  operational_context = excluded.operational_context,
  terminology = excluded.terminology,
  vertical_config = excluded.vertical_config,
  updated_at = now();
