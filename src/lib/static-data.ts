import type { Lookbook, Product, Barber, Service } from "@/types/database.types";
import { BRANCHES, type Branch } from "@/lib/constants";

export type StaticBranch = Branch;

export type StaticStyle = Lookbook & {
  serviceId: string | null;
};

// Las sucursales viven en src/lib/constants.ts (BRANCHES); se re-exportan acá
// con el nombre histórico para no romper importaciones existentes.
export const STATIC_BRANCHES: StaticBranch[] = BRANCHES;

export const STATIC_SERVICES: Service[] = [
  {
    id: "service-1",
    name: "Corte Clásico",
    description: "Corte de precisión adaptado a tu estilo personal y fisionomía.",
    price: 450,
    duration_minutes: 30,
    image_url: "/images/hero/maquina-clippers.jpg",
    is_active: true,
    sort_order: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: "service-2",
    name: "Corte + Barba",
    description: "El combo premium completo para el cuidado del cabello y la barba.",
    price: 750,
    duration_minutes: 60,
    image_url: "/images/hero/detalle-corte.jpg",
    is_active: true,
    sort_order: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: "service-3",
    name: "Diseño de Barba",
    description: "Perfilado de barba con navaja y toalla caliente, hidratación final.",
    price: 350,
    duration_minutes: 30,
    image_url: "/images/hero/detalle-barba.jpg",
    is_active: true,
    sort_order: 3,
    created_at: new Date().toISOString(),
  },
];

export const STATIC_BARBERS: Barber[] = [
  // ── Sucursal Central (branch 1) ──
  {
    id: "barber-1",
    profile_id: "carlos-profile",
    name: "Carlos",
    bio: "Especialista en cortes clásicos y modernos, con terminaciones de alta precisión.",
    avatar_url: "/images/barbers/carlos.jpg",
    is_active: true,
    branch_id: "1",
    working_hours: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "barber-2",
    profile_id: "miguel-profile",
    name: "Miguel",
    bio: "Experto en diseño de barba, afeitados tradicionales hot towel y estilos urbanos.",
    avatar_url: "/images/barbers/miguel.jpg",
    is_active: true,
    branch_id: "1",
    working_hours: null,
    created_at: new Date().toISOString(),
  },
  // ── Sucursal Norte (branch 2) ──
  {
    id: "barber-3",
    profile_id: "diego-profile",
    name: "Diego",
    bio: "Estilista con más de 10 años de experiencia internacional en cortes texturizados.",
    avatar_url: "/images/barbers/diego.jpg",
    is_active: true,
    branch_id: "2",
    working_hours: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "barber-4",
    profile_id: "martin-profile",
    name: "Martín",
    bio: "Fades impecables y diseños geométricos. Competidor nacional de barbería 2024.",
    avatar_url: "/images/barbers/martin.jpg",
    is_active: true,
    branch_id: "2",
    working_hours: null,
    created_at: new Date().toISOString(),
  },
  // ── Sucursal Beach (branch 3) ──
  {
    id: "barber-5",
    profile_id: "lucas-profile",
    name: "Lucas",
    bio: "Cortes surferos y estilos relajados con acabado profesional. Onda costera, precisión NB.",
    avatar_url: "/images/barbers/lucas.jpg",
    is_active: true,
    branch_id: "3",
    working_hours: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "barber-6",
    profile_id: "facu-profile",
    name: "Facundo",
    bio: "Especialista en barbas largas y tratamientos capilares. 8 años de experiencia.",
    avatar_url: "/images/barbers/facundo.jpg",
    is_active: true,
    branch_id: "3",
    working_hours: null,
    created_at: new Date().toISOString(),
  },
];


export const STATIC_STYLES: StaticStyle[] = [
  {
    id: "1",
    title: "Fade Degradado Alto",
    image_url: "/lookbook/fade-cut.jpg",
    tags: ["Corte", "Fade", "Moderno"],
    is_featured: true,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "1",
  },
  {
    id: "2",
    title: "Perfilado de Barba",
    image_url: "/lookbook/beard-trim.jpg",
    tags: ["Barba", "Grooming", "Tijera"],
    is_featured: true,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "3",
  },
  {
    id: "3",
    title: "Afeitado Hot Towel",
    image_url: "/lookbook/hot-towel.jpg",
    tags: ["Afeitado", "Spa", "Clásico"],
    is_featured: true,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "3",
  },
  {
    id: "4",
    title: "Styling Texturizado",
    image_url: "/lookbook/styling-pomade.jpg",
    tags: ["Styling", "Producto", "Textura"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "1",
  },
  {
    id: "5",
    title: "Instrumentos de Precisión",
    image_url: "/lookbook/clipper-detail.jpg",
    tags: ["Herramientas", "Calidad"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: null,
  },
  {
    id: "6",
    title: "Corte a Tijera",
    image_url: "/lookbook/scissor-cut.jpg",
    tags: ["Corte", "Tijera", "Clásico"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "1",
  },
  {
    id: "7",
    title: "Ambiente Industrial",
    image_url: "/lookbook/barber-chair.jpg",
    tags: ["Local", "Ambiente"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: null,
  },
  {
    id: "8",
    title: "Lavado Premium",
    image_url: "/lookbook/hair-wash.jpg",
    tags: ["Servicio", "Relax"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "1",
  },
];

export const STATIC_PRODUCTS: Product[] = [
  {
    id: "1",
    name: "NB Matte Clay",
    description: "Cera de arcilla con fijación fuerte y acabado mate natural. Ideal para estilos texturizados que duran todo el día.",
    price: 750,
    image_url: "/products/matte-clay.webp",
    category: "Styling",
    stock: 15,
    low_stock_threshold: 5,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Beard Elixir - Sandalwood",
    description: "Aceite premium para barba con notas de sándalo y aceites esenciales. Hidrata, suaviza y elimina la picazón.",
    price: 600,
    image_url: "/products/beard-elixir.webp",
    category: "Barba",
    stock: 8,
    low_stock_threshold: 3,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "3",
    name: "Classic Pomade",
    description: "Pomada a base de agua con brillo medio y fijación flexible. Se lava fácilmente y mantiene el estilo clásico.",
    price: 550,
    image_url: "/products/classic-pomade.webp",
    category: "Styling",
    stock: 20,
    low_stock_threshold: 5,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "4",
    name: "Carbon Daily Shampoo",
    description: "Shampoo de limpieza profunda con carbón activado. Elimina residuos de productos sin resecar el cabello.",
    price: 450,
    image_url: "/products/shampoo.webp",
    category: "Cabello",
    stock: 12,
    low_stock_threshold: 4,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "5",
    name: "Texture Powder Volumizer",
    description: "Polvo ligero para dar volumen y textura instantánea. Acabado invisible y máximo control.",
    price: 650,
    image_url: "/products/texture-powder.webp",
    category: "Styling",
    stock: 5,
    low_stock_threshold: 2,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "6",
    name: "Handcrafted Wooden Comb",
    description: "Peine de madera de sándalo antiestática. Dientes anchos para desenredar sin tirar.",
    price: 350,
    image_url: "/products/wooden-comb.webp",
    category: "Accesorios",
    stock: 30,
    low_stock_threshold: 5,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "7",
    name: "Precision Shave Gel",
    description: "Gel de afeitado transparente que permite ver exactamente dónde pasa la navaja. Con aloe vera.",
    price: 400,
    image_url: "/products/shave-gel.webp",
    category: "Afeitado",
    stock: 0,
    low_stock_threshold: 5,
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "8",
    name: "Post-Shave Cooling Balm",
    description: "Bálsamo refrescante para después del afeitado. Calma la irritación y cierra los poros.",
    price: 500,
    image_url: "/products/cooling-balm.webp",
    category: "Afeitado",
    stock: 10,
    low_stock_threshold: 3,
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

export const FEATURED_PRODUCT_IDS = ["1", "2", "3"];

const BARBER_AVATARS: Record<string, string> = {
  carlos: "/images/barbers/carlos.jpg",
  miguel: "/images/barbers/miguel.jpg",
  diego: "/images/barbers/diego.jpg",
  martin: "/images/barbers/carlos.jpg",
  lucas: "/images/barbers/miguel.jpg",
  facundo: "/images/barbers/diego.jpg",
};

export function getBarberAvatarUrl(barber: Pick<Barber, "name" | "avatar_url">): string | null {
  if (barber.avatar_url) return barber.avatar_url;

  const firstName = barber.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(" ")[0]
    .toLowerCase();

  return BARBER_AVATARS[firstName] ?? null;
}

export function getServiceIdForStyle(styleId: string): string | null {
  return STATIC_STYLES.find((style) => style.id === styleId)?.serviceId ?? null;
}
