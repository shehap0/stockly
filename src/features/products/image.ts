import { supabase } from '@/lib/supabase'

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_DIMENSION = 800

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'Only JPEG, PNG, or WebP images are allowed'
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image is larger than 2 MB'
  }
  return null
}

/** Downscale to ≤800px longest edge and re-encode as WebP. */
export async function compressToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', 0.85),
  )
  if (!blob) throw new Error('Image encoding failed')
  return blob
}

/**
 * Upload a product image (compressed WebP) and return the storage path.
 * Path convention: products/{productId}/{uuid}.webp — enforced server-side.
 */
export async function uploadProductImage(productId: string, file: File): Promise<string> {
  const validationError = validateImageFile(file)
  if (validationError) throw new Error(validationError)

  const blob = await compressToWebp(file)
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('Compressed image still exceeds 2 MB')
  }

  const path = `products/${productId}/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, blob, { contentType: 'image/webp', upsert: false })
  if (error) throw error
  return path
}

export async function deleteProductImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from('product-images').remove([path])
  if (error) throw error
}

/** Public URL for a stored product image path (bucket is public-read). */
export function productImageUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}
