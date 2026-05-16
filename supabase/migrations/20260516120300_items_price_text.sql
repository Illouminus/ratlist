-- ============================================================================
-- items.price: collapse to a single free-text field
-- ============================================================================
-- The original schema split price into (price_min, price_max, currency) to
-- support range filtering. In practice users want to paste things like
-- "€25", "$30-50", "около 4000 руб" — strings the design already shows
-- verbatim. Filtering by price range is a v0.2+ feature; until then a
-- single text column is friendlier to both the UI and the user.
--
-- Data note: this drops three columns. Safe to do here because no real
-- data exists yet (we're still building v0.1). If you're applying this
-- against a non-empty DB later — back up first.
-- ============================================================================

alter table public.items
  drop column if exists price_min,
  drop column if exists price_max,
  drop column if exists currency,
  add  column if not exists price_text text;
