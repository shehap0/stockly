import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  productFormSchema,
  useProduct,
  useProductMutations,
  type Product,
  type ProductFormValues,
} from './api'
import {
  useAttributeDefinitions,
  useProductAttributeValues,
  useSetProductAttributes,
  attributeValueColumn,
  attributeValueOf,
} from '@/features/attributes/api'
import { useCategories } from '@/features/categories/api'
import { useBranches } from '@/features/branches/api'
import { useAddStock } from '@/features/inventory/api'
import { productImageUrl, uploadProductImage, deleteProductImage, validateImageFile } from './image'
import { useAuth } from '@/features/auth/AuthContext'
import type { AttributeDataType } from '@/features/attributes/api'
import { describeError } from '@/lib/errors'

export default function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>()
  const isEdit = Boolean(productId)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: existing } = useProduct(productId ?? '')
  const { data: categories } = useCategories()
  const { data: branches } = useBranches()
  const { data: defs } = useAttributeDefinitions()
  const { data: existingValues } = useProductAttributeValues(productId ?? '')
  const setAttributes = useSetProductAttributes(productId ?? '')
  const { create, update } = useProductMutations()
  const addStock = useAddStock()
  const [initialBranchId, setInitialBranchId] = useState('')
  const [initialQuantity, setInitialQuantity] = useState('')
  const [savedProduct, setSavedProduct] = useState<Product | null>(null)
  const [initialStockIdempotencyKey] = useState(() => crypto.randomUUID())
  const isOwner = profile?.role === 'OWNER'

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      is_active: true,
      condition: null,
      category_id: null,
      selling_price: '',
    },
  })

  useEffect(() => {
    if (isEdit && existing) {
      form.reset({
        name: existing.name,
        selling_price: String(existing.selling_price),
        purchase_cost: existing.purchase_cost != null ? String(existing.purchase_cost) : '',
        category_id: existing.category_id,
        description: existing.description ?? '',
        manufacturer: existing.manufacturer ?? '',
        brand: existing.brand ?? '',
        car_make: existing.car_make ?? '',
        car_model: existing.car_model ?? '',
        manufacturing_year: existing.manufacturing_year?.toString() ?? '',
        sku: existing.sku ?? '',
        barcode: existing.barcode ?? '',
        oem_number: existing.oem_number ?? '',
        condition: existing.condition,
        is_active: existing.is_active,
      })
    }
  }, [existing, isEdit, form])

  const { register, handleSubmit, formState: { errors, isSubmitting } } = form

  // Only user edits live in state; values are otherwise derived from the server.
  const [attrEdits, setAttrEdits] = useState<Record<string, string | number | boolean>>({})

  if (!isOwner) {
    return <p>Only the owner can manage the product catalog.</p>
  }
  function attrValue(defId: string, dataType: AttributeDataType): string | number | boolean | undefined {
    if (defId in attrEdits) return attrEdits[defId]
    const stored = attributeValueOf(
      existingValues?.find((x) => x.attribute_id === defId),
      dataType,
    )
    return stored === null ? undefined : stored
  }
  function setAttr(id: string, value: string | number | boolean) {
    setAttrEdits((prev) => ({ ...prev, [id]: value }))
  }

  async function onSubmit(values: ProductFormValues) {
    setServerError(null)
    try {
      const openingQuantity = initialQuantity === '' ? 0 : Number(initialQuantity)
      if (!Number.isInteger(openingQuantity) || openingQuantity < 0) {
        throw new Error('Opening quantity must be a whole number of zero or more')
      }
      if (!isEdit && openingQuantity > 0 && !initialBranchId) {
        throw new Error('Choose a branch for the initial stock')
      }
      let product = savedProduct ?? existing
      if ((isEdit && productId) || savedProduct) {
        product = await update.mutateAsync({ productId: productId ?? savedProduct!.id, values })
      } else {
        if (!profile) throw new Error('Not signed in')
        product = await create.mutateAsync({ values, companyId: profile.company_id })
        setSavedProduct(product)
      }
      if (!product) throw new Error('Product save failed')

      if (!isEdit && openingQuantity > 0) {
        await addStock.mutateAsync({
          branchId: initialBranchId,
          productId: product.id,
          quantity: openingQuantity,
          unitPurchaseCost: values.purchase_cost ? Number(values.purchase_cost) : null,
          reason: 'Opening stock',
          idempotencyKey: initialStockIdempotencyKey,
        })
      }

      // Attributes (server trigger validates type/dropdown/required rules)
      const map = new Map<string, string | number | boolean>()
      for (const def of defs ?? []) {
        const input = attrValue(def.id, def.data_type)
        if (input === undefined || input === '') continue
        if (def.data_type === 'NUMBER') map.set(def.id, Number(input))
        else map.set(def.id, input)
      }
      if (map.size > 0 || isEdit) {
        await setAttributes.mutateAsync(map)
      }

      // Image upload after product exists (needs product id for the path)
      if (imageFile && product) {
        if (existing?.image_path) await deleteProductImage(existing.image_path)
        const path = await uploadProductImage(product.id, imageFile)
        const { error: imgErr } = await (
          await import('@/lib/supabase')
        ).supabase
          .from('products')
          .update({ image_path: path })
          .eq('id', product.id)
        if (imgErr) throw imgErr
      }

      navigate(`/products/${product.id}`)
    } catch (err) {
      setServerError(describeError(err))
    }
  }

  function pickImage(file: File | null) {
    setImageError(null)
    if (!file) {
      setImageFile(null)
      return
    }
    const err = validateImageFile(file)
    if (err) {
      setImageError(err)
      setImageFile(null)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setImageFile(file)
  }

  const field = (name: keyof ProductFormValues, label: string, type = 'text') => (
    <div style={{ marginBottom: 10 }}>
      <label htmlFor={name}>{label}</label>
      <input id={name} type={type} {...register(name)} />
      {errors[name] && <span role="alert" style={{ color: 'crimson' }}>{String(errors[name]?.message)}</span>}
    </div>
  )

  const currentImage = existing?.image_path ? productImageUrl(existing.image_path) : null

  return (
    <section style={{ maxWidth: 760 }}>
      <p>
        <Link to="/products">← Back to products</Link>
      </p>
      <div className="page-heading"><div><h1>{isEdit ? 'Edit product' : 'Add product'}</h1><p>
        Only name and selling price are required. Stock is added separately per branch.
      </p></div></div>

      <form className="surface" style={{ padding: 22 }} onSubmit={handleSubmit(onSubmit)} noValidate>
        {field('name', 'Product name *')}
        {field('selling_price', 'Selling price (EGP) *', 'number')}
        {field('purchase_cost', 'Purchase cost (EGP, optional)', 'number')}
        {field('description', 'Description')}
        {field('manufacturer', 'Manufacturer')}
        {field('brand', 'Brand')}
        {field('car_make', 'Car make')}
        {field('car_model', 'Car model')}
        {field('manufacturing_year', 'Manufacturing year')}
        {field('sku', 'SKU')}
        {field('barcode', 'Barcode')}
        {field('oem_number', 'OEM number')}

        {!isEdit && <fieldset style={{ margin: '18px 0', padding: 16, border: '1px solid var(--line)', borderRadius: 9 }}>
          <legend>Initial stock</legend>
          <p className="muted" style={{ fontSize: '.88rem' }}>Choose where the opening quantity will be stored. You can add stock to other branches later.</p>
          <div className="form-grid">
            <div><label htmlFor="initial-branch">Branch</label><select id="initial-branch" value={initialBranchId} onChange={(e) => setInitialBranchId(e.target.value)}><option value="">Select a branch</option>{branches?.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            <div><label htmlFor="initial-quantity">Opening quantity</label><input id="initial-quantity" type="number" min="0" step="1" value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} placeholder="0" /></div>
          </div>
        </fieldset>}

        <div style={{ marginBottom: 10 }}>
          <label htmlFor="category_id">Category</label>
          <select id="category_id" {...register('category_id')}>
            <option value="">— none —</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label htmlFor="condition">Condition</label>
          <select id="condition" {...register('condition')}>
            <option value="">— unknown —</option>
            <option value="NEW">New</option>
            <option value="USED">Used</option>
            <option value="REFURBISHED">Refurbished</option>
          </select>
        </div>

        {(defs?.filter((d) => d.is_active) ?? []).length > 0 && (
          <fieldset style={{ margin: '12px 0', padding: 12 }}>
            <legend>Custom attributes</legend>
            {defs!.filter((d) => d.is_active).map((def) => (
              <AttributeInput
                key={def.id}
                def={def}
                value={attrValue(def.id, def.data_type)}
                onChange={(v) => setAttr(def.id, v)}
              />
            ))}
          </fieldset>
        )}

        <div style={{ marginBottom: 10 }}>
          <label htmlFor="image">Product image (JPEG/PNG/WebP, ≤2MB)</label>
          <input
            ref={fileRef}
            id="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
          />
          {imageError && <span role="alert" style={{ color: 'crimson' }}>{imageError}</span>}
          {currentImage && !imageFile && (
            <div>
              <img src={currentImage} alt="Current" style={{ width: 72, height: 72, objectFit: 'cover' }} />
            </div>
          )}
        </div>

        {isEdit && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" {...register('is_active')} />
              Active (visible in catalog)
            </label>
          </div>
        )}

        {serverError && <p className="error-state" role="alert">{serverError}</p>}

        <button className="primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
      </form>
    </section>
  )
}

function AttributeInput({
  def,
  value,
  onChange,
}: {
  def: { id: string; name: string; data_type: AttributeDataType; is_required: boolean; options: string[] | null }
  value: string | number | boolean | undefined
  onChange: (v: string | number | boolean) => void
}) {
  const label = `${def.name}${def.is_required ? ' *' : ''}`
  switch (def.data_type) {
    case 'TEXT':
      return (
        <div style={{ marginBottom: 8 }}>
          <label htmlFor={def.id}>{label}</label>
          <input id={def.id} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      )
    case 'NUMBER':
      return (
        <div style={{ marginBottom: 8 }}>
          <label htmlFor={def.id}>{label}</label>
          <input
            id={def.id}
            type="number"
            step="any"
            value={value === undefined || value === '' ? '' : String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
    case 'BOOLEAN':
      return (
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              id={def.id}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
            />
            {label}
          </label>
        </div>
      )
    case 'DATE':
      return (
        <div style={{ marginBottom: 8 }}>
          <label htmlFor={def.id}>{label}</label>
          <input
            id={def.id}
            type="date"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      )
    case 'DROPDOWN':
      return (
        <div style={{ marginBottom: 8 }}>
          <label htmlFor={def.id}>{label}</label>
          <select
            id={def.id}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— none —</option>
            {(def.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      )
    default:
      return null
  }
}

// Register dynamic attribute fields through their own controlled inputs above;
// the attributeValueColumn mapping is applied at submit time.
void attributeValueColumn
