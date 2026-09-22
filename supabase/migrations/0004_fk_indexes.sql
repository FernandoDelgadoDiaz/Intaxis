-- Agentic Pymes · índices para claves foráneas detectadas por Supabase Advisor

create index if not exists agent_runs_thread_id_idx
  on public.agent_runs(thread_id);

create index if not exists recipes_product_business_idx
  on public.recipes(product_id, business_id);

create index if not exists recipe_items_recipe_business_idx
  on public.recipe_items(recipe_id, business_id);

create index if not exists recipe_items_ingredient_business_idx
  on public.recipe_items(ingredient_id, business_id);

create index if not exists inventory_movements_ingredient_business_idx
  on public.inventory_movements(ingredient_id, business_id);
