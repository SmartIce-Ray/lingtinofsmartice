-- Insert head_chef role user for testing
-- Run on production Supabase by Jeremy
-- Replace restaurant_id and password_hash with actual values

-- Example: insert a head_chef employee for the test restaurant
-- INSERT INTO master_employee (
--   id, employee_name, restaurant_id, role_code, username, password_hash, is_active
-- ) VALUES (
--   gen_random_uuid(),
--   '厨师长',
--   '0b9e9031-4223-4124-b633-e3a853abfb8f',  -- test restaurant
--   'head_chef',
--   'chef',
--   '<bcrypt_hash>',  -- generate with: SELECT crypt('password', gen_salt('bf'))
--   true
-- );

-- Note: The actual INSERT should be done by Jeremy with the correct
-- restaurant_id and password. This file serves as documentation.
