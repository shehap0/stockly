export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"branch_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"new_values": Json | null,"old_values": Json | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"branch_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"new_values"?: Json | null,"old_values"?: Json | null,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"branch_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"new_values"?: Json | null,"old_values"?: Json | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    }
                  ]
                },"branch_inventory": {
                  Row: {
                    "branch_id": string,"id": string,"low_stock_threshold": number | null,"product_id": string,"quantity": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"id"?: string,"low_stock_threshold"?: number | null,"product_id": string,"quantity"?: number,"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string,"id"?: string,"low_stock_threshold"?: number | null,"product_id"?: string,"quantity"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branch_inventory_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "branch_inventory_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"branches": {
                  Row: {
                    "address": string | null,"company_id": string,"created_at": string,"id": string,"is_active": boolean,"name": string,"phone": string | null,"short_code": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"company_id": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name": string,"phone"?: string | null,"short_code": string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"company_id"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"phone"?: string | null,"short_code"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "branches_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"company_settings": {
                  Row: {
                    "company_id": string,"created_at": string,"currency": string,"default_low_stock_threshold": number | null,"max_discount_percent": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"currency"?: string,"default_low_stock_threshold"?: number | null,"max_discount_percent"?: number,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"currency"?: string,"default_low_stock_threshold"?: number | null,"max_discount_percent"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "company_settings_company_id_fkey"
      columns: ["company_id"]
isOneToOne: true
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"customers": {
                  Row: {
                    "company_id": string,"created_at": string,"id": string,"name": string,"notes": string | null,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customers_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_movements": {
                  Row: {
                    "branch_id": string,"created_at": string,"created_by": string | null,"id": string,"idempotency_key": string | null,"movement_type": Database["public"]['Enums']["movement_type"],"new_quantity": number,"previous_quantity": number,"product_id": string,"quantity_change": number,"reason": string | null,"reference_id": string | null,"reference_type": string | null,"unit_purchase_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string | null,"movement_type": Database["public"]['Enums']["movement_type"],"new_quantity": number,"previous_quantity": number,"product_id": string,"quantity_change": number,"reason"?: string | null,"reference_id"?: string | null,"reference_type"?: string | null,"unit_purchase_cost"?: number | null
                  }
                  Update: {
                    "branch_id"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"idempotency_key"?: string | null,"movement_type"?: Database["public"]['Enums']["movement_type"],"new_quantity"?: number,"previous_quantity"?: number,"product_id"?: string,"quantity_change"?: number,"reason"?: string | null,"reference_id"?: string | null,"reference_type"?: string | null,"unit_purchase_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_attribute_definitions": {
                  Row: {
                    "company_id": string,"created_at": string,"data_type": Database["public"]['Enums']["attribute_data_type"],"display_order": number,"id": string,"is_active": boolean,"is_required": boolean,"name": string,"options": (string)[] | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"data_type": Database["public"]['Enums']["attribute_data_type"],"display_order"?: number,"id"?: string,"is_active"?: boolean,"is_required"?: boolean,"name": string,"options"?: (string)[] | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"data_type"?: Database["public"]['Enums']["attribute_data_type"],"display_order"?: number,"id"?: string,"is_active"?: boolean,"is_required"?: boolean,"name"?: string,"options"?: (string)[] | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_attribute_definitions_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"product_attribute_values": {
                  Row: {
                    "attribute_id": string,"created_at": string,"product_id": string,"updated_at": string,"value_boolean": boolean | null,"value_date": string | null,"value_number": number | null,"value_text": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "attribute_id": string,"created_at"?: string,"product_id": string,"updated_at"?: string,"value_boolean"?: boolean | null,"value_date"?: string | null,"value_number"?: number | null,"value_text"?: string | null
                  }
                  Update: {
                    "attribute_id"?: string,"created_at"?: string,"product_id"?: string,"updated_at"?: string,"value_boolean"?: boolean | null,"value_date"?: string | null,"value_number"?: number | null,"value_text"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_attribute_values_attribute_id_fkey"
      columns: ["attribute_id"]
isOneToOne: false
      referencedRelation: "product_attribute_definitions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_attribute_values_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_categories": {
                  Row: {
                    "company_id": string,"created_at": string,"description": string | null,"id": string,"is_active": boolean,"name": string,"parent_category_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "company_id": string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"parent_category_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "company_id"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"parent_category_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_categories_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_categories_company_id_parent_category_id_fkey"
      columns: ["company_id","parent_category_id"]
isOneToOne: false
      referencedRelation: "product_categories"
      referencedColumns: ["company_id","id"]
    }
                  ]
                },"products": {
                  Row: {
                    "barcode": string | null,"brand": string | null,"car_make": string | null,"car_model": string | null,"category_id": string | null,"company_id": string,"condition": Database["public"]['Enums']["product_condition"] | null,"created_at": string,"description": string | null,"id": string,"image_path": string | null,"is_active": boolean,"manufacturer": string | null,"manufacturing_year": number | null,"name": string,"oem_number": string | null,"purchase_cost": number | null,"selling_price": number,"sku": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "barcode"?: string | null,"brand"?: string | null,"car_make"?: string | null,"car_model"?: string | null,"category_id"?: string | null,"company_id": string,"condition"?: Database["public"]['Enums']["product_condition"] | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"manufacturer"?: string | null,"manufacturing_year"?: number | null,"name": string,"oem_number"?: string | null,"purchase_cost"?: number | null,"selling_price": number,"sku"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "barcode"?: string | null,"brand"?: string | null,"car_make"?: string | null,"car_model"?: string | null,"category_id"?: string | null,"company_id"?: string,"condition"?: Database["public"]['Enums']["product_condition"] | null,"created_at"?: string,"description"?: string | null,"id"?: string,"image_path"?: string | null,"is_active"?: boolean,"manufacturer"?: string | null,"manufacturing_year"?: number | null,"name"?: string,"oem_number"?: string | null,"purchase_cost"?: number | null,"selling_price"?: number,"sku"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_company_id_category_id_fkey"
      columns: ["company_id","category_id"]
isOneToOne: false
      referencedRelation: "product_categories"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "products_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "branch_id": string | null,"company_id": string,"created_at": string,"full_name": string,"id": string,"is_active": boolean,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id"?: string | null,"company_id": string,"created_at"?: string,"full_name": string,"id": string,"is_active"?: boolean,"phone"?: string | null,"role": Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "branch_id"?: string | null,"company_id"?: string,"created_at"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_company_id_branch_id_fkey"
      columns: ["company_id","branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["company_id","id"]
    },{
      foreignKeyName: "profiles_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_items": {
                  Row: {
                    "created_at": string,"discount_amount": number,"id": string,"line_total": number,"product_id": string,"product_name_snapshot": string,"quantity": number,"sale_id": string,"unit_purchase_cost_snapshot": number | null,"unit_selling_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"discount_amount"?: number,"id"?: string,"line_total": number,"product_id": string,"product_name_snapshot": string,"quantity": number,"sale_id": string,"unit_purchase_cost_snapshot"?: number | null,"unit_selling_price": number
                  }
                  Update: {
                    "created_at"?: string,"discount_amount"?: number,"id"?: string,"line_total"?: number,"product_id"?: string,"product_name_snapshot"?: string,"quantity"?: number,"sale_id"?: string,"unit_purchase_cost_snapshot"?: number | null,"unit_selling_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_items_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "branch_id": string,"company_id": string,"created_at": string,"created_by": string | null,"customer_id": string | null,"discount_amount": number,"discount_type": Database["public"]['Enums']["discount_type"],"discount_value": number,"id": string,"idempotency_key": string,"payment_method": Database["public"]['Enums']["payment_method"],"sale_number": string,"status": Database["public"]['Enums']["sale_status"],"subtotal": number,"total_amount": number,"updated_at": string,"void_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "branch_id": string,"company_id": string,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"discount_amount"?: number,"discount_type"?: Database["public"]['Enums']["discount_type"],"discount_value"?: number,"id"?: string,"idempotency_key": string,"payment_method": Database["public"]['Enums']["payment_method"],"sale_number": string,"status"?: Database["public"]['Enums']["sale_status"],"subtotal": number,"total_amount": number,"updated_at"?: string,"void_reason"?: string | null
                  }
                  Update: {
                    "branch_id"?: string,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_id"?: string | null,"discount_amount"?: number,"discount_type"?: Database["public"]['Enums']["discount_type"],"discount_value"?: number,"id"?: string,"idempotency_key"?: string,"payment_method"?: Database["public"]['Enums']["payment_method"],"sale_number"?: string,"status"?: Database["public"]['Enums']["sale_status"],"subtotal"?: number,"total_amount"?: number,"updated_at"?: string,"void_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_branch_id_fkey"
      columns: ["branch_id"]
isOneToOne: false
      referencedRelation: "branches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_company_id_fkey"
      columns: ["company_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_customer_id_fkey"
      columns: ["customer_id"]
isOneToOne: false
      referencedRelation: "customers"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_stock":
{ Args: { "p_branch_id": string,"p_idempotency_key"?: string,"p_product_id": string,"p_quantity": number,"p_reason"?: string,"p_unit_purchase_cost"?: number }; Returns: {
              "branch_id": string,
"created_at": string,
"created_by": string | null,
"id": string,
"idempotency_key": string | null,
"movement_type": Database["public"]['Enums']["movement_type"],
"new_quantity": number,
"previous_quantity": number,
"product_id": string,
"quantity_change": number,
"reason": string | null,
"reference_id": string | null,
"reference_type": string | null,
"unit_purchase_cost": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "inventory_movements"
        isOneToOne: true
        isSetofReturn: false
      } },
"adjust_stock":
{ Args: { "p_branch_id": string,"p_idempotency_key"?: string,"p_movement_type": string,"p_product_id": string,"p_quantity_change": number,"p_reason": string }; Returns: {
              "branch_id": string,
"created_at": string,
"created_by": string | null,
"id": string,
"idempotency_key": string | null,
"movement_type": Database["public"]['Enums']["movement_type"],
"new_quantity": number,
"previous_quantity": number,
"product_id": string,
"quantity_change": number,
"reason": string | null,
"reference_id": string | null,
"reference_type": string | null,
"unit_purchase_cost": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "inventory_movements"
        isOneToOne: true
        isSetofReturn: false
      } },
"apply_stock_change":
{ Args: { "p_branch_id": string,"p_delta": number,"p_idempotency_key"?: string,"p_movement_type": Database["public"]['Enums']["movement_type"],"p_product_id": string,"p_reason"?: string,"p_reference_id"?: string,"p_reference_type"?: string,"p_unit_purchase_cost"?: number }; Returns: {
              "branch_id": string,
"created_at": string,
"created_by": string | null,
"id": string,
"idempotency_key": string | null,
"movement_type": Database["public"]['Enums']["movement_type"],
"new_quantity": number,
"previous_quantity": number,
"product_id": string,
"quantity_change": number,
"reason": string | null,
"reference_id": string | null,
"reference_type": string | null,
"unit_purchase_cost": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "inventory_movements"
        isOneToOne: true
        isSetofReturn: false
      } },
"can_access_branch":
{ Args: { "p_branch_id": string }; Returns: boolean
                           },
"check_required_attributes":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"create_sale":
{ Args: { "p_branch_id": string,"p_customer_id"?: string,"p_discount_type"?: string,"p_discount_value"?: number,"p_idempotency_key"?: string,"p_items": Json,"p_payment_method": string }; Returns: Json
                           },
"current_company_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"current_profile":
{ Args: Record<PropertyKey, never>; Returns: {
              "branch_id": string | null,
"company_id": string,
"created_at": string,
"full_name": string,
"id": string,
"is_active": boolean,
"role": Database["public"]['Enums']["user_role"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"is_active_user":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"sale_payload":
{ Args: { "p_sale_id": string }; Returns: Json
                           },
"set_low_stock_threshold":
{ Args: { "p_branch_id": string,"p_product_id": string,"p_threshold": number }; Returns: {
              "branch_id": string,
"id": string,
"low_stock_threshold": number | null,
"product_id": string,
"quantity": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "branch_inventory"
        isOneToOne: true
        isSetofReturn: false
      } },
"show_limit":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"show_trgm":
{ Args: { "": string }; Returns: (string)[]
                           },
"upsert_inventory_row":
{ Args: { "p_branch_id": string,"p_product_id": string,"p_threshold": number }; Returns: {
              "branch_id": string,
"id": string,
"low_stock_threshold": number | null,
"product_id": string,
"quantity": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "branch_inventory"
        isOneToOne: true
        isSetofReturn: false
      } },
"user_role":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["user_role"]
                           },
"void_sale":
{ Args: { "p_reason": string,"p_sale_id": string }; Returns: Json
                           },
"write_audit":
{ Args: { "p_action": string,"p_entity_type": string,"p_new": Json,"p_old": Json,"p_operation": string }; Returns: undefined
                           }
          }
          Enums: {
            "attribute_data_type": "TEXT"|"NUMBER"|"BOOLEAN"|"DROPDOWN"|"DATE","discount_type": "NONE"|"FIXED"|"PERCENT","movement_type": "INITIAL_STOCK"|"STOCK_ADDITION"|"SALE"|"SALE_RETURN"|"DAMAGE"|"MANUAL_ADJUSTMENT"|"OTHER","payment_method": "CASH"|"CARD"|"INSTAPAY","product_condition": "NEW"|"USED"|"REFURBISHED","sale_status": "COMPLETED"|"VOIDED","user_role": "OWNER"|"BRANCH_MANAGER"|"BRANCH_EMPLOYEE"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

// ---------------------------------------------------------------------------
// Convenience aliases
// ---------------------------------------------------------------------------
type PublicSchema = Database['public']
export type Tables = PublicSchema['Tables']
export type Functions = PublicSchema['Functions']
export type Enums = NonNullable<PublicSchema['Enums']>

export type TableRow<T extends keyof Tables> = Tables[T]['Row']
export type UserRole = Enums['user_role']
export type Profile = Tables['profiles']['Row']
export type Branch = Tables['branches']['Row']
