-- Stockly migration 00001: extensions + enum types
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create type public.user_role as enum ('OWNER', 'BRANCH_MANAGER', 'BRANCH_EMPLOYEE');
create type public.attribute_data_type as enum ('TEXT', 'NUMBER', 'BOOLEAN', 'DROPDOWN', 'DATE');
create type public.movement_type as enum (
  'INITIAL_STOCK',
  'STOCK_ADDITION',
  'SALE',
  'SALE_RETURN',
  'DAMAGE',
  'MANUAL_ADJUSTMENT',
  'OTHER'
);
create type public.discount_type as enum ('NONE', 'FIXED', 'PERCENT');
create type public.payment_method as enum ('CASH', 'CARD');
create type public.sale_status as enum ('COMPLETED', 'VOIDED');
create type public.product_condition as enum ('NEW', 'USED', 'REFURBISHED');
