-- Demo data for local development: npm run db:seed:local
INSERT OR IGNORE INTO venues (id, name, address, city, map_url, notes) VALUES
  ('v_demo_indoor', 'Padel Indoor Palma', 'Carrer de Gremi de Sabaters 21', 'Palma', 'https://maps.google.com/?q=Padel+Indoor+Palma', 'Free parking. Entrance on the left.'),
  ('v_demo_club', 'Club Padel Son Vida', 'Carrer del Golf 2', 'Palma', NULL, 'Bar open after sessions.');

INSERT OR IGNORE INTO match_days (id, title, venue_id, date, start_time, end_time, group_type, level_min, level_max, courts, hosted, description, social_after, prize, status) VALUES
  ('md_demo_1', 'Ladies · Hosted', 'v_demo_indoor', date('now','+2 days'), '18:30', '20:00', 'female', 2.0, 3.5, 2, 1, 'Americano format: rotate partners every 15 minutes. Balls provided.', 'Cava on the terrace after', NULL, 'open'),
  ('md_demo_2', 'Mixed · Hosted', 'v_demo_club', date('now','+4 days'), '19:00', '20:30', 'mixed', 3.0, 4.5, 2, 1, 'Fixed pairs, round robin. Bring a partner at your level or we pair you.', 'Drinks at the club bar, first one on us', 'Bottle of wine for the winning pair', 'open'),
  ('md_demo_3', 'Ladies · Hosted', 'v_demo_indoor', date('now','+9 days'), '18:30', '20:00', 'female', 2.0, 3.5, 2, 1, NULL, NULL, NULL, 'open'),
  ('md_demo_4', 'Mixed · Hosted', 'v_demo_club', date('now','+11 days'), '19:00', '20:30', 'mixed', 3.0, 4.5, 2, 1, NULL, 'Drinks after', NULL, 'open');

INSERT OR IGNORE INTO events (id, title, description, category, location, date, start_time, end_time, group_type, price_cents, guest_price_cents, capacity, allow_guests, status) VALUES
  ('ev_demo_1', 'World Court Fashion Show', 'Padel meets the runway. Dress code: white. Welcome drink included.', 'fashion', 'Hotel rooftop, Palma', date('now','+12 days'), '20:00', '23:30', 'all', 2500, 3500, 80, 1, 'open'),
  ('ev_demo_2', 'Sunset drinks catch-up', 'Casual drinks for members. First round on the club.', 'social', 'Portixol beach bar', date('now','+6 days'), '19:30', NULL, 'all', 0, NULL, NULL, 0, 'open'),
  ('ev_demo_3', 'Autumn retreat · Sóller', 'Two nights, four padel clinics, one long lunch. Deposit secures your place.', 'retreat', 'Sóller', date('now','+40 days'), '10:00', NULL, 'all', 15000, NULL, 16, 0, 'open');

INSERT OR IGNORE INTO perks (id, sponsor_name, category, title, description, how_to_redeem, code, address, url, featured, active) VALUES
  ('pk_demo_1', 'Bodega Son Vives', 'wine', '15% off all wines', 'In-store and online.', 'Show this screen at the till', 'CROSSCOURT15', 'Carrer de Sant Feliu 4, Palma', 'https://example.com', 1, 1),
  ('pk_demo_2', 'Arrels Spa', 'spa', 'Free upgrade to a 90-minute massage', 'Book any 60-minute treatment.', 'Mention Crosscourt Social when booking', NULL, 'Passeig Marítim 12, Palma', NULL, 1, 1),
  ('pk_demo_3', 'La Rosa Vermutería', 'bar', 'Free tapa with every vermut', NULL, 'Show your member profile', NULL, 'Carrer de la Rosa 5, Palma', NULL, 0, 1);
