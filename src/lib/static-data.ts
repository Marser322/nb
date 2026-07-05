import type { Lookbook, Product, Barber } from "@/types/database.types";
import { BRANCHES, type Branch } from "@/lib/constants";

export type StaticBranch = Branch;

export type StaticStyle = Lookbook & {
  serviceId: string | null;
};

// Las sucursales viven en src/lib/constants.ts (BRANCHES); se re-exportan acá
// con el nombre histórico para no romper importaciones existentes.
export const STATIC_BRANCHES: StaticBranch[] = BRANCHES;

export const STATIC_STYLES: StaticStyle[] = [
  {
    id: "1",
    title: "Fade Degradado Alto",
    image_url: "/lookbook/fade-cut.png",
    tags: ["Corte", "Fade", "Moderno"],
    is_featured: true,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "1",
  },
  {
    id: "2",
    title: "Perfilado de Barba",
    image_url: "/lookbook/beard-trim.png",
    tags: ["Barba", "Grooming", "Tijera"],
    is_featured: true,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "3",
  },
  {
    id: "3",
    title: "Afeitado Hot Towel",
    image_url: "/lookbook/hot-towel.png",
    tags: ["Afeitado", "Spa", "Clásico"],
    is_featured: true,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "3",
  },
  {
    id: "4",
    title: "Styling Texturizado",
    image_url: "/lookbook/styling-pomade.png",
    tags: ["Styling", "Producto", "Textura"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "1",
  },
  {
    id: "5",
    title: "Instrumentos de Precisión",
    image_url: "/lookbook/clipper-detail.png",
    tags: ["Herramientas", "Calidad"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: null,
  },
  {
    id: "6",
    title: "Corte a Tijera",
    image_url: "/lookbook/scissor-cut.png",
    tags: ["Corte", "Tijera", "Clásico"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: "1",
  },
  {
    id: "7",
    title: "Ambiente Industrial",
    image_url: "/lookbook/barber-chair.png",
    tags: ["Local", "Ambiente"],
    is_featured: false,
    instagram_url: "#",
    created_at: new Date().toISOString(),
    serviceId: null,
  },
  {
    id: "8",
    title: "Lavado Premium",
    image_url: "/lookbook/hair-wash.png",
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
    image_url: "/products/matte-clay.png",
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
    image_url: "/products/beard-elixir.png",
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
    image_url: "/products/classic-pomade.png",
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
    image_url: "/products/shampoo.png",
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
    image_url: "/products/texture-powder.png",
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
    image_url: "/products/wooden-comb.png",
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
    image_url: "/products/shave-gel.png",
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
    image_url: "/products/cooling-balm.png",
    category: "Afeitado",
    stock: 10,
    low_stock_threshold: 3,
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

export const FEATURED_PRODUCT_IDS = ["1", "2", "3"];

const BARBER_AVATARS: Record<string, string> = {
  carlos: "/images/barbers/carlos.png",
  miguel: "/images/barbers/miguel.png",
  diego: "/images/barbers/diego.png",
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
