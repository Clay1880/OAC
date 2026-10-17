-- AI assistant: menu items carry descriptor tags and the meal moments they suit.
--   tags          one diet tag (veg | non-veg | egg) plus descriptors
--                 (hot cold light heavy spicy sweet quick filling drink snack meal)
--   meal_moments  any of breakfast | lunch | snack | dinner | late
-- Both default to empty, so items without tags simply score on nothing in the rules engine.
alter table public.menu_items
  add column tags text[] not null default '{}',
  add column meal_moments text[] not null default '{}';
