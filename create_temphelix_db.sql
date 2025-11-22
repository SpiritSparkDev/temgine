-- create_temphelix_db.sql
-- SQL to create the role and database used by the project

-- Create role/user
CREATE ROLE temphelix WITH LOGIN PASSWORD 'temphelix_dev';

-- Create database and set owner
CREATE DATABASE temphelix OWNER temphelix;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE temphelix TO temphelix;

-- Notes:
-- 1) Run this in pgAdmin's Query Tool while connected as a superuser (e.g. postgres),
--    or using psql as a superuser: psql -h localhost -U postgres -f create_temphelix_db.sql
-- 2) If the role or database already exist, you'll get an error; drop them first if needed.
