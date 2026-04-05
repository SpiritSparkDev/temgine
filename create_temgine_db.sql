-- create_temgine_db.sql
-- SQL to create the role and database used by the project

-- Create role/user
CREATE ROLE temgine WITH LOGIN PASSWORD 'temgine_dev';

-- Create database and set owner
CREATE DATABASE temgine OWNER temgine;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE temgine TO temgine;

-- Notes:
-- 1) Run this in pgAdmin's Query Tool while connected as a superuser (e.g. postgres),
--    or using psql as a superuser: psql -h localhost -U postgres -f create_temgine_db.sql
-- 2) If the role or database already exist, you'll get an error; drop them first if needed.
