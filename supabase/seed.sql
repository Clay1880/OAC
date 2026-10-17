-- Local development seed. Runs on `supabase db reset`. Creates no users.

-- College domain for the sign-up guard and the login form: college_domains is the only source.
-- It also picks the college for new sign-ups (0008 backfills college ait-pune).
-- Production adds its real domains directly to college_domains; nothing here applies there.
insert into public.college_domains (domain, college_id)
select 'aitpune.edu.in', id from public.colleges where slug = 'ait-pune'
on conflict do nothing;

-- The real menu of the Open Area Canteen (62 items). Prices are in paise. Items priced "MRP"
-- on the menu card are not here: add them from the admin console once their price is known.
insert into public.menu_items (canteen_id, name, price_paise, category, sort)
select (select id from public.canteens where slug = 'oac'), m.name, m.price_paise, m.category, m.sort
from (values
  ('Aloo chat', 3500, 'Chat', 10),
  ('Fruit chat', 3000, 'Chat', 20),
  ('Fruit Basket', 5000, 'Chat', 30),
  ('Pani Puri', 2000, 'Chat', 40),
  ('Dhabeli', 1500, 'Chat', 50),
  ('Misal', 5000, 'Chat', 60),
  ('Bhel', 2500, 'Chat', 70),
  ('Veg Patice', 2000, 'Bites Starter', 80),
  ('Chicken Patice', 5000, 'Bites Starter', 90),
  ('Anda Bhurji (2 Eggs)', 5000, 'Bites Starter', 100),
  ('Bread Omlete', 4000, 'Bites Starter', 110),
  ('Maggi', 3000, 'Bites Starter', 120),
  ('Veg Maggi', 3500, 'Bites Starter', 130),
  ('Masala Maggi', 4000, 'Bites Starter', 140),
  ('Anda Maggi', 4000, 'Bites Starter', 150),
  ('Pyaaz Kachouri', 1500, 'Bites Starter', 160),
  ('Veg Manchurian (Dry)', 6000, 'Bites Starter', 170),
  ('Veg Manchurian (Gravy)', 6000, 'Bites Starter', 180),
  ('Veg Cutlet', 3000, 'Bites Starter', 190),
  ('Paneer Pakoda', 8000, 'Bites Starter', 200),
  ('Kachori', 3000, 'Bites Starter', 210),
  ('Dhokla', 2000, 'Bites Starter', 220),
  ('Sandwich Dhokla', 4000, 'Bites Starter', 230),
  ('Veg Sandwich', 4000, 'Bites Starter', 240),
  ('Chicken Sandwich', 6000, 'Bites Starter', 250),
  ('Chutney Sandwich', 3000, 'Bites Starter', 260),
  ('Cheese Sandwich', 4000, 'Bites Starter', 270),
  ('Cheese Roll', 5000, 'Bites Starter', 280),
  ('Chicken Roll', 6000, 'Bites Starter', 290),
  ('Veg Roll', 5000, 'Bites Starter', 300),
  ('Club Sandwich', 3000, 'Bites Starter', 310),
  ('Samosa', 3000, 'Bites Starter', 320),
  ('Veg Burger', 6000, 'Burger', 330),
  ('Chicken Burger', 8000, 'Burger', 340),
  ('Pasta', 5000, 'Fast Food / Continental', 350),
  ('Veg Triple Rice', 7500, 'Fast Food / Continental', 360),
  ('Veg Triple Noodle', 8000, 'Fast Food / Continental', 370),
  ('Idli Sambhar', 2500, 'South Indian', 380),
  ('Vada Sambhar', 3000, 'South Indian', 390),
  ('Medu Vada', 3000, 'South Indian', 400),
  ('Sada Dosa', 3000, 'South Indian', 410),
  ('Masala Dosa', 4000, 'South Indian', 420),
  ('Pav Bhaji', 5000, 'South Indian', 430),
  ('Dahiwada', 3000, 'South Indian', 440),
  ('Potato Wada', 3000, 'South Indian', 450),
  ('Uttapam', 3000, 'South Indian', 460),
  ('Paneer Parata', 7000, 'Indian Bread - Roti', 470),
  ('Aloo Parata', 5000, 'Indian Bread - Roti', 480),
  ('Gobi Parata', 5000, 'Indian Bread - Roti', 490),
  ('Pyaz Parata', 5000, 'Indian Bread - Roti', 500),
  ('Gajar ka Halwa', 3500, 'Sweet', 510),
  ('Cold Coffee', 3000, 'Desserts - Thandai', 520),
  ('Tea', 1200, 'Beverages', 530),
  ('Sp. Tea', 1500, 'Beverages', 540),
  ('Coffee', 1500, 'Beverages', 550),
  ('Milk', 2500, 'Beverages', 560),
  ('Cutting Tea (Special)', 800, 'Beverages', 570),
  ('Daily Lunch Thali', 6000, 'Le Menu De Chef', 580),
  ('Sunday Special Thali', 7000, 'Le Menu De Chef', 590),
  ('Masala Bhindi', 5000, 'Le Menu De Chef', 600),
  ('Veg Biryani', 7000, 'Biryani', 610),
  ('Chicken Biryani', 8000, 'Biryani', 620)
) as m (name, price_paise, category, sort);

-- No sample slots: `npx tsx scripts/seed-demo.ts` (or the admin console) opens pickup times.

-- Tags and meal moments for the seeded OAC menu (see 0010_menu_tags.sql).
update public.menu_items set tags = '{veg,hot,spicy,snack,quick}', meal_moments = '{snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Aloo chat';
update public.menu_items set tags = '{veg,cold,light,sweet,snack}', meal_moments = '{snack,lunch}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Fruit chat';
update public.menu_items set tags = '{veg,cold,light,sweet,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Fruit Basket';
update public.menu_items set tags = '{veg,spicy,snack,quick}', meal_moments = '{snack,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Pani Puri';
update public.menu_items set tags = '{veg,spicy,snack,quick}', meal_moments = '{snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Dhabeli';
update public.menu_items set tags = '{veg,hot,spicy,filling,meal}', meal_moments = '{breakfast,lunch}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Misal';
update public.menu_items set tags = '{veg,spicy,snack,quick}', meal_moments = '{snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Bhel';
update public.menu_items set tags = '{veg,hot,snack,quick}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Patice';
update public.menu_items set tags = '{non-veg,hot,snack,quick}', meal_moments = '{snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Chicken Patice';
update public.menu_items set tags = '{egg,hot,filling,quick}', meal_moments = '{breakfast,lunch}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Anda Bhurji (2 Eggs)';
update public.menu_items set tags = '{egg,hot,quick,filling}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Bread Omlete';
update public.menu_items set tags = '{veg,hot,quick,snack}', meal_moments = '{snack,dinner,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Maggi';
update public.menu_items set tags = '{veg,hot,quick,snack}', meal_moments = '{snack,dinner,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Maggi';
update public.menu_items set tags = '{veg,hot,quick,snack,spicy}', meal_moments = '{snack,dinner,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Masala Maggi';
update public.menu_items set tags = '{egg,hot,quick,snack,filling}', meal_moments = '{snack,dinner,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Anda Maggi';
update public.menu_items set tags = '{veg,hot,spicy,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Pyaaz Kachouri';
update public.menu_items set tags = '{veg,hot,spicy,snack}', meal_moments = '{snack,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Manchurian (Dry)';
update public.menu_items set tags = '{veg,hot,spicy,filling,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Manchurian (Gravy)';
update public.menu_items set tags = '{veg,hot,snack}', meal_moments = '{snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Cutlet';
update public.menu_items set tags = '{veg,hot,heavy,snack}', meal_moments = '{snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Paneer Pakoda';
update public.menu_items set tags = '{veg,hot,spicy,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Kachori';
update public.menu_items set tags = '{veg,light,quick,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Dhokla';
update public.menu_items set tags = '{veg,light,quick,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Sandwich Dhokla';
update public.menu_items set tags = '{veg,light,quick,snack}', meal_moments = '{breakfast,snack,lunch}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Sandwich';
update public.menu_items set tags = '{non-veg,filling,quick,snack}', meal_moments = '{snack,lunch}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Chicken Sandwich';
update public.menu_items set tags = '{veg,light,quick,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Chutney Sandwich';
update public.menu_items set tags = '{veg,hot,filling,quick,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Cheese Sandwich';
update public.menu_items set tags = '{veg,hot,filling,snack}', meal_moments = '{snack,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Cheese Roll';
update public.menu_items set tags = '{non-veg,hot,filling,spicy,snack}', meal_moments = '{snack,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Chicken Roll';
update public.menu_items set tags = '{veg,hot,filling,snack}', meal_moments = '{snack,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Roll';
update public.menu_items set tags = '{veg,filling,snack}', meal_moments = '{snack,lunch}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Club Sandwich';
update public.menu_items set tags = '{veg,hot,spicy,quick,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Samosa';
update public.menu_items set tags = '{veg,hot,filling,snack}', meal_moments = '{snack,lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Burger';
update public.menu_items set tags = '{non-veg,hot,heavy,filling,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Chicken Burger';
update public.menu_items set tags = '{veg,hot,filling,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Pasta';
update public.menu_items set tags = '{veg,hot,heavy,filling,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Triple Rice';
update public.menu_items set tags = '{veg,hot,heavy,filling,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Triple Noodle';
update public.menu_items set tags = '{veg,hot,light,quick}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Idli Sambhar';
update public.menu_items set tags = '{veg,hot,quick,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Vada Sambhar';
update public.menu_items set tags = '{veg,hot,quick,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Medu Vada';
update public.menu_items set tags = '{veg,hot,light}', meal_moments = '{breakfast,snack,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Sada Dosa';
update public.menu_items set tags = '{veg,hot,spicy,filling}', meal_moments = '{breakfast,lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Masala Dosa';
update public.menu_items set tags = '{veg,hot,spicy,filling,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Pav Bhaji';
update public.menu_items set tags = '{veg,cold,light,snack}', meal_moments = '{snack,lunch}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Dahiwada';
update public.menu_items set tags = '{veg,hot,spicy,quick,snack}', meal_moments = '{breakfast,snack}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Potato Wada';
update public.menu_items set tags = '{veg,hot,filling}', meal_moments = '{breakfast,lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Uttapam';
update public.menu_items set tags = '{veg,hot,heavy,filling,meal}', meal_moments = '{breakfast,lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Paneer Parata';
update public.menu_items set tags = '{veg,hot,filling,meal}', meal_moments = '{breakfast,lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Aloo Parata';
update public.menu_items set tags = '{veg,hot,filling,meal}', meal_moments = '{breakfast,lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Gobi Parata';
update public.menu_items set tags = '{veg,hot,filling,meal}', meal_moments = '{breakfast,lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Pyaz Parata';
update public.menu_items set tags = '{veg,hot,sweet,snack}', meal_moments = '{snack,dinner,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Gajar ka Halwa';
update public.menu_items set tags = '{veg,cold,sweet,drink}', meal_moments = '{snack,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Cold Coffee';
update public.menu_items set tags = '{veg,hot,drink,quick}', meal_moments = '{breakfast,snack,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Tea';
update public.menu_items set tags = '{veg,hot,drink,quick}', meal_moments = '{breakfast,snack,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Sp. Tea';
update public.menu_items set tags = '{veg,hot,drink,quick}', meal_moments = '{breakfast,snack,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Coffee';
update public.menu_items set tags = '{veg,hot,light,drink}', meal_moments = '{breakfast,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Milk';
update public.menu_items set tags = '{veg,hot,drink,quick}', meal_moments = '{breakfast,snack,late}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Cutting Tea (Special)';
update public.menu_items set tags = '{veg,hot,heavy,filling,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Daily Lunch Thali';
update public.menu_items set tags = '{veg,hot,heavy,filling,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Sunday Special Thali';
update public.menu_items set tags = '{veg,hot,spicy,meal}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Masala Bhindi';
update public.menu_items set tags = '{veg,hot,heavy,filling,meal,spicy}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Veg Biryani';
update public.menu_items set tags = '{non-veg,heavy,filling,meal,spicy}', meal_moments = '{lunch,dinner}'
  where canteen_id = (select id from public.canteens where slug = 'oac') and name = 'Chicken Biryani';
