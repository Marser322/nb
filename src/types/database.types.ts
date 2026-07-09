// Tipos de base de datos para NB Barber
// Estos tipos se generarán automáticamente con Supabase CLI

export type UserRole = 'cliente' | 'barbero' | 'admin' | 'gerente'
export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled'
export type OrderType = 'online' | 'local'
export type FulfillmentType = 'pickup' | 'delivery'
export type PaymentMethod = 'mercadopago' | 'efectivo' | 'transferencia' | 'cash' | 'card' | 'transfer' | 'other'

export interface Profile {
  id: string

  full_name: string | null
  phone: string | null
  avatar_url: string | null
  role: UserRole
  notes: string | null
  /** Overrides de permisos por persona (RBAC). Ver src/lib/permissions.ts */
  permissions?: Record<string, boolean> | null
  created_at: string
}

export interface Barber {
  id: string
  profile_id: string
  name: string
  bio: string | null
  avatar_url: string | null
  is_active: boolean
  branch_id: string | null
  working_hours: WorkingHours | null
  created_at: string
}

export interface WorkingHours {
  [day: string]: {
    start: string // "09:00"
    end: string   // "20:00"
    break_start?: string
    break_end?: string
  } | null
}

export interface Service {
  id: string
  name: string
  description: string | null
  price: number
  duration_minutes: number
  image_url: string | null
  is_active: boolean
  sort_order: number
  category?: string
  created_at: string
}

export interface Appointment {
  id: string
  client_id: string
  barber_id: string
  service_id: string
  appointment_date: string
  start_time: string
  end_time: string
  status: AppointmentStatus
  notes: string | null
  style_reference: string | null
  subscription_id?: string | null
  created_at: string
  // Relaciones expandidas
  client?: Profile
  barber?: Barber
  service?: Service
}

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  stock: number
  low_stock_threshold: number
  image_url: string | null
  category: string
  is_active: boolean
  created_at: string
}

export interface Order {
  id: string
  client_id: string | null
  branch_id: string | null
  order_type: OrderType
  fulfillment: FulfillmentType
  contact_name: string | null
  contact_phone: string | null
  delivery_address: string | null
  notes: string | null
  subtotal: number
  total: number
  status: OrderStatus
  payment_method: PaymentMethod | null
  created_at: string
  created_by: string | null
  updated_at: string
  items?: OrderItem[]
  branch?: Branch | null
  client?: Profile | null
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  product?: Product
}

export interface HaircutHistory {
  id: string
  client_id: string
  barber_id: string
  service_id: string
  appointment_id: string | null
  notes: string | null
  photo_urls: string[]
  created_at: string
}

export interface Lookbook {
  id: string
  title: string
  image_url: string
  instagram_url: string | null
  tags: string[]
  is_featured: boolean
  created_at: string
}

export interface Branch {
  id: string
  name: string
  address: string
  phone: string | null
  image_url: string | null
  working_hours: WorkingHours | null
  is_active: boolean
  created_at: string
}

export interface CashMovement {
  id: string
  type: 'income' | 'expense'
  category: 'service' | 'product' | 'tip' | 'adjustment' | 'supply' | 'salary' | 'rent' | 'chair_rental' | 'settlement' | 'other'
  amount: number
  payment_method: 'cash' | 'card' | 'transfer' | 'other'
  description: string | null
  reference_id: string | null
  barber_id: string | null
  appointment_id: string | null
  branch_id: string | null
  created_by: string | null
  created_at: string
  barber?: Barber | null
}

export interface ProductStock {
  product_id: string
  branch_id: string
  quantity: number
  low_stock_threshold: number
  updated_at: string
  product?: Product | null
  branch?: Branch | null
}

export interface StockMovement {
  id: string
  product_id: string
  branch_id: string
  delta: number
  reason: 'sale_online' | 'sale_local' | 'adjustment' | 'restock' | 'cancel_restock'
  reference_id: string | null
  created_by: string | null
  created_at: string
}

export interface BarberCompensation {
  id: string
  barber_id: string
  model: 'commission' | 'chair_rental' | 'hybrid' | 'employee'
  commission_pct: number | null
  rental_amount: number | null
  rental_period: 'weekly' | 'monthly' | null
  salary_amount: number | null
  effective_from: string
  notes: string | null
  created_at: string
}

export interface BarberSettlement {
  id: string
  barber_id: string
  period_from: string
  period_to: string
  model: 'commission' | 'chair_rental' | 'hybrid' | 'employee'
  services_total: number
  tips_total: number
  commission_pct: number | null
  rental_amount: number | null
  barber_total: number
  house_total: number
  status: 'closed' | 'paid'
  payout_movement_id: string | null
  created_by: string | null
  created_at: string
}

export interface SettlementPreview {
  barber_id: string
  from: string
  to: string
  model: 'commission' | 'chair_rental' | 'hybrid' | 'employee'
  commission_pct: number | null
  rental_amount: number | null
  rental_period: 'weekly' | 'monthly' | null
  salary_amount: number | null
  services_total: number
  tips_total: number
  appointments_count: number
  rental_due: number
  barber_total: number
  house_total: number
  has_compensation: boolean
}


export interface CommunicationLog {
  id: string
  client_id: string | null
  client_name: string | null
  client_phone: string | null
  message_sent: string | null
  status: 'sent' | 'failed' | 'delivered'
  sent_at: string
  metadata: unknown
}

export interface ChatLog {
  id: string
  mode: 'client' | 'admin'
  question: string
  normalized_question: string
  answer: string | null
  provider: 'gemini' | 'openai' | 'rules'
  was_fallback: boolean
  created_at: string
}

export interface ChatKnowledge {
  id: string
  question: string
  normalized_question: string
  answer: string
  source: 'auto' | 'manual'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface RemindersConfig {
  id: string
  days_since_last_visit: number
  message_template: string
  is_active: boolean
  channel: string | null
  created_at: string
  updated_at: string
}

export interface MessageTemplate {
  id: string
  event_type: 'cancelled' | 'confirmed' | 'rescheduled' | 'reminder' | 'thanks'
  name: string
  body: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ClientOverview {
  id: string
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  created_at: string
  notes: string | null
  last_visit: string | null
  total_appointments: number
  total_spent: number
}

export interface ClientOverviewPage extends ClientOverview {
  total_count: number
}

export interface Subscription {
  id: string
  client_id: string
  barber_id: string
  service_id: string
  day_of_week: number
  start_time: string
  status: 'active' | 'paused' | 'cancelled'
  created_at: string
  updated_at: string
  // Relaciones opcionales para UI
  barber?: Barber | null
  service?: Service | null
}

export interface ScheduleBlock {
  id: string
  barber_id: string | null
  branch_id: string | null
  start_date: string // "YYYY-MM-DD"
  end_date: string // "YYYY-MM-DD"
  start_time: string | null // "HH:mm:ss"
  end_time: string | null // "HH:mm:ss"
  reason: string | null
  created_by: string | null
  created_at: string
}

export interface DayAvailability {
  day: string
  is_open: boolean
  open_time: string | null
  close_time: string | null
  break_start: string | null
  break_end: string | null
  slot_minutes: number
  booked: { start: string; end: string }[]
  blocks: { start: string; end: string; reason: string | null }[]
}

export interface AppSetting {
  key: string
  value: unknown
  description: string | null
  updated_at: string
  updated_by: string | null
}

// Schema mínimo para tipar SupabaseClient (no es el tipo generado por la CLI;
// cubre lo que consume src/lib/booking.ts — ampliar a medida que haga falta).
// Los Row usan mapped types porque las interfaces no satisfacen Record<string, unknown>.
export interface Database {
  public: {
    Tables: {
      app_settings: {
        Row: { [K in keyof AppSetting]: AppSetting[K] }
        Insert: { [K in keyof AppSetting]?: AppSetting[K] }
        Update: { [K in keyof AppSetting]?: AppSetting[K] }
        Relationships: []
      }
      appointments: {
        Row: { [K in keyof Appointment]: Appointment[K] }
        Insert: { [K in keyof Appointment]?: Appointment[K] }
        Update: { [K in keyof Appointment]?: Appointment[K] }
        Relationships: []
      }
      branches: {
        Row: { [K in keyof Branch]: Branch[K] }
        Insert: { [K in keyof Branch]?: Branch[K] }
        Update: { [K in keyof Branch]?: Branch[K] }
        Relationships: []
      }
      products: {
        Row: { [K in keyof Product]: Product[K] }
        Insert: { [K in keyof Product]?: Product[K] }
        Update: { [K in keyof Product]?: Product[K] }
        Relationships: []
      }
      orders: {
        Row: { [K in keyof Order]: Order[K] }
        Insert: { [K in keyof Order]?: Order[K] }
        Update: { [K in keyof Order]?: Order[K] }
        Relationships: []
      }
      order_items: {
        Row: { [K in keyof OrderItem]: OrderItem[K] }
        Insert: { [K in keyof OrderItem]?: OrderItem[K] }
        Update: { [K in keyof OrderItem]?: OrderItem[K] }
        Relationships: []
      }
      product_stock: {
        Row: { [K in keyof ProductStock]: ProductStock[K] }
        Insert: { [K in keyof ProductStock]?: ProductStock[K] }
        Update: { [K in keyof ProductStock]?: ProductStock[K] }
        Relationships: []
      }
      stock_movements: {
        Row: { [K in keyof StockMovement]: StockMovement[K] }
        Insert: { [K in keyof StockMovement]?: StockMovement[K] }
        Update: { [K in keyof StockMovement]?: StockMovement[K] }
        Relationships: []
      }
      schedule_blocks: {
        Row: { [K in keyof ScheduleBlock]: ScheduleBlock[K] }
        Insert: { [K in keyof ScheduleBlock]?: ScheduleBlock[K] }
        Update: { [K in keyof ScheduleBlock]?: ScheduleBlock[K] }
        Relationships: []
      }
      cash_movements: {
        Row: { [K in keyof CashMovement]: CashMovement[K] }
        Insert: { [K in keyof CashMovement]?: CashMovement[K] }
        Update: { [K in keyof CashMovement]?: CashMovement[K] }
        Relationships: []
      }
      barber_compensation: {
        Row: { [K in keyof BarberCompensation]: BarberCompensation[K] }
        Insert: { [K in keyof BarberCompensation]?: BarberCompensation[K] }
        Update: { [K in keyof BarberCompensation]?: BarberCompensation[K] }
        Relationships: []
      }
      barber_settlements: {
        Row: { [K in keyof BarberSettlement]: BarberSettlement[K] }
        Insert: { [K in keyof BarberSettlement]?: BarberSettlement[K] }
        Update: { [K in keyof BarberSettlement]?: BarberSettlement[K] }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_booked_slots: {
        Args: { p_barber_id: string; p_date: string }
        Returns: { start_time: string; end_time: string }[]
      }
      get_availability: {
        Args: { p_barber_id: string; p_from: string; p_to?: string | null }
        Returns: {
          day: string
          is_open: boolean
          open_time: string | null
          close_time: string | null
          break_start: string | null
          break_end: string | null
          slot_minutes: number
          booked: unknown
          blocks: unknown
        }[]
      }
      is_slot_bookable: {
        Args: { p_barber_id: string; p_date: string; p_start: string; p_end: string }
        Returns: boolean
      }
      book_appointment: {
        Args: {
          p_barber_id: string
          p_service_id: string
          p_date: string
          p_start_time: string
          p_recurring?: boolean
          p_style_reference?: string | null
          p_notes?: string | null
        }
        Returns: { appointment_id: string; subscription_id: string | null }
      }
      cancel_appointment: {
        Args: { p_appointment_id: string }
        Returns: undefined
      }
      admin_create_appointment: {
        Args: {
          p_client_name: string
          p_client_phone: string | null
          p_service_id: string
          p_barber_id: string
          p_date: string
          p_start_time: string
          p_notes?: string | null
        }
        Returns: string
      }
      admin_reschedule_appointment: {
        Args: {
          p_appointment_id: string
          p_date: string
          p_start_time: string
        }
        Returns: undefined
      }
      admin_update_appointment_status: {
        Args: {
          p_appointment_id: string
          p_status: string
        }
        Returns: undefined
      }
      complete_appointment_with_payment: {
        Args: {
          p_appointment_id: string
          p_final_amount: number
          p_payment_method: string
          p_tip_amount?: number
        }
        Returns: undefined
      }
      create_order_with_items: {
        Args: {
          p_payment_method: 'mercadopago' | 'efectivo' | 'transferencia'
          p_items: unknown
          p_branch_id: string
          p_fulfillment?: FulfillmentType
          p_contact_name?: string | null
          p_contact_phone?: string | null
          p_delivery_address?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      create_counter_sale: {
        Args: {
          p_branch_id: string
          p_payment_method: 'mercadopago' | 'efectivo' | 'transferencia'
          p_items: unknown
          p_barber_id?: string | null
          p_notes?: string | null
        }
        Returns: string
      }
      update_order_status: {
        Args: {
          p_order_id: string
          p_new_status: OrderStatus
        }
        Returns: undefined
      }
      set_product_stock: {
        Args: {
          p_product_id: string
          p_branch_id: string
          p_new_quantity: number
        }
        Returns: undefined
      }
      get_clients_overview_page: {
        Args: {
          p_search?: string | null
          p_inactive_only?: boolean
          p_inactive_days?: number
          p_limit?: number
          p_offset?: number
        }
        Returns: { [K in keyof ClientOverviewPage]: ClientOverviewPage[K] }[]
      }
      get_barber_settlement: {
        Args: {
          p_barber_id: string
          p_from: string
          p_to: string
        }
        Returns: SettlementPreview
      }
      close_barber_settlement: {
        Args: {
          p_barber_id: string
          p_from: string
          p_to: string
          p_register_payout?: boolean
        }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
