-- Stockly migration 00007: product image storage
-- Bucket: product-images. Public read (product photos), owner-only writes.
-- Path convention: products/{product_id}/{uuid}.webp
-- Size/type limits enforced by the bucket AND by client-side compression.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  2097152, -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Read: any authenticated user of any company may view product images.
create policy product_images_select on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images');

-- Write: owner only, inside the products/<uuid>/ prefix.
create policy product_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.is_owner()
    and (storage.foldername(name))[1] = 'products'
    and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  );

create policy product_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_owner()
    and (storage.foldername(name))[1] = 'products'
  )
  with check (
    bucket_id = 'product-images'
    and public.is_owner()
    and (storage.foldername(name))[1] = 'products'
  );

create policy product_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and public.is_owner()
    and (storage.foldername(name))[1] = 'products'
  );
