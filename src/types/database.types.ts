// Tipos de base de datos para NB Barber
// Estos tipos se generarán automáticamente con Supabase CLI

export type UserRole = 'cliente' | 'barbero' | 'admin'
export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
export type OrderStatus = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentMethod = 'mercadopago' | 'efectivo' | 'transferencia'

export interface Profile {
  id: string

  full_name: string | null
  phone: string | null
  avatar_url: string | null
  role: UserRole
  notes: string | null
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
  client_id: string
  subtotal: number
  total: number
  status: OrderStatus
  payment_method: PaymentMethod | null
  created_at: string
  items?: OrderItem[]
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

export interface CashRegister {
  id: string
  barber_id: string
  appointment_id: string
  amount: number
  payment_type: 'efectivo' | 'transferencia'
  register_date: string
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
  type: 'ingreso' | 'egreso'
  amount: number
  description: string
  payment_method: 'efectivo' | 'transferencia' | 'tarjeta'
  created_at: string
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

export interface RemindersConfig {
  id: string
  days_since_last_visit: number
  message_template: string
  is_active: boolean
  channel: string | null
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



