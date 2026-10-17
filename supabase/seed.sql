-- Local development seed. Runs on `supabase db reset`. Creates no users.

-- College domain for the sign-up guard. Must match NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN.
-- Production sets its real domain directly in app_settings; nothing here applies there.
update public.app_settings set college_email_domain = 'aitpune.edu.in';

-- The real canteen menu. Prices are in paise.
insert into public.menu_items (name, description, price_paise, category, sort) values
  ('Samosa (2 pcs)',  'Crisp samosas with mint chutney',          2000, 'Snacks', 10),
  ('Bread Pakoda',    'Gram-flour fried bread with chutney',      1500, 'Snacks', 20),
  ('Vada Pav',        'Spiced potato vada in a soft pav',         2000, 'Snacks', 30),
  ('Veg Puff',        'Flaky pastry with vegetable filling',      2000, 'Snacks', 40),
  ('Poha',            'Flattened rice with peanuts and lemon',    3000, 'Meals',  50),
  ('Veg Sandwich',    'Grilled with cheese and green chutney',    4000, 'Meals',  60),
  ('Masala Dosa',     'Crisp dosa with potato filling, sambar',   6000, 'Meals',  70),
  ('Chole Bhature',   'Two bhature with chickpea curry',          7000, 'Meals',  80),
  ('Masala Chai',     'Hot ginger-cardamom tea',                  1000, 'Drinks', 90),
  ('Cold Coffee',     'Chilled coffee with ice cream',            4000, 'Drinks', 100);

-- No sample slots: `npx tsx scripts/seed-demo.ts` (or the admin console) opens pickup times.
