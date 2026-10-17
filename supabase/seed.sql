-- Local development seed. Runs on `supabase db reset`. Creates no users.

-- College domain for the sign-up guard. Must match NEXT_PUBLIC_COLLEGE_EMAIL_DOMAIN.
-- Production sets its real domain directly in app_settings; nothing here applies there.
update public.app_settings set college_email_domain = 'college.edu';

insert into public.menu_items (name, description, price_paise, category, sort) values
  ('Veg Puff',             'Flaky pastry with spiced vegetable filling', 2000, 'Snacks',    10),
  ('Samosa (2 pcs)',       'Crisp samosas with mint chutney',            2500, 'Snacks',    20),
  ('Bread Omelette',       'Two-egg omelette between toasted bread',     4000, 'Snacks',    30),
  ('Veg Sandwich',         'Grilled with cheese and green chutney',      4500, 'Meals',     40),
  ('Veg Fried Rice',       'Wok-tossed rice with vegetables',            7000, 'Meals',     50),
  ('Chole Bhature',        'Two bhature with chickpea curry',            8000, 'Meals',     60),
  ('Masala Chai',          'Hot ginger-cardamom tea',                    1000, 'Drinks',    70),
  ('Cold Coffee',          'Chilled coffee with ice cream',              5000, 'Drinks',    80),
  ('Fresh Lime Soda',      'Sweet or salted',                            3000, 'Drinks',    90),
  ('Gulab Jamun (2 pcs)',  'Warm milk dumplings in syrup',               3000, 'Desserts', 100);

-- Eight 15-minute pickup slots starting at the next full hour, campus time.
insert into public.slots (starts_at, capacity)
select
  ((date_trunc('hour', now() at time zone 'Asia/Kolkata') + interval '1 hour') at time zone 'Asia/Kolkata')
    + (n * interval '15 minutes'),
  20
from generate_series(0, 7) as n;
