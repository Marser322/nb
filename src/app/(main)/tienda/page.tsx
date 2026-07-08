"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, Plus, Search, Filter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Header, Footer } from "@/components/layout";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { IllustratedEmptyState } from "@/components/shared/IllustratedEmptyState";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/stores/cartStore";
import type { Product } from "@/types/database.types";
import { toast } from "sonner";
import Image from "next/image";
import { FeaturedProductsCarousel } from "@/components/shop/feature-carousel";
import { STATIC_PRODUCTS } from "@/lib/static-data";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";

const CATEGORY_BANNERS: Record<string, { title: string; description: string; image?: string; alt: string }> = {
    cabello: {
        title: "Cabello",
        description: "Textura, limpieza y control para el corte de todos los días.",
        image: "/images/tienda/cat-cabello.webp",
        alt: "Productos premium para cuidado del cabello en New Brothers",
    },
    barba: {
        title: "Barba",
        description: "Aceites, bálsamos y terminaciones para una barba cuidada.",
        image: "/images/tienda/cat-barba.webp",
        alt: "Productos premium para barba en New Brothers",
    },
    styling: {
        title: "Styling",
        description: "Fijación profesional con acabado natural y elegante.",
        image: "/images/tienda/cat-styling.webp",
        alt: "Productos de styling profesional para cabello masculino",
    },
    afeitado: {
        title: "Afeitado",
        description: "Ritual clásico con precisión, confort y piel prolija.",
        image: "/images/tienda/cat-afeitado.webp",
        alt: "Productos premium para afeitado clásico",
    },
};

function getCategoryBanner(category: string) {
    const key = category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return CATEGORY_BANNERS[key] ?? {
        title: category,
        description: "Selección curada para completar tu rutina NB.",
        alt: `Categoría ${category} en la tienda New Brothers`,
    };
}

export default function TiendaPage() {
    const { features, isLoaded } = useFeatures();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && !features.tienda) {
            toast.error("La tienda no está disponible");
            router.replace("/");
        }
    }, [isLoaded, features.tienda, router]);

    const [products, setProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [isLoading, setIsLoading] = useState(true);

    const addItem = useCartStore((state) => state.addItem);

    // Cargar productos desde Supabase (STATIC_PRODUCTS solo como fallback)
    useEffect(() => {
        async function loadProducts() {
            setIsLoading(true);

            const supabase = createClient();
            const { data, error } = await supabase
                .from("products")
                .select("*")
                .eq("is_active", true)
                .order("name");

            // Si la query falla o no hay productos cargados, caemos al catálogo estático
            // para no dejar la tienda en blanco.
            setProducts(!error && data && data.length > 0 ? data : STATIC_PRODUCTS);
            setIsLoading(false);
        }
        loadProducts();
    }, []);

    if (!isLoaded || !features.tienda) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    // Filter logic derived directly from state (no separate state needed)
    const filteredProducts = products.filter(p => {
        const matchesSearch = !searchQuery ||
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.description?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;

        return matchesSearch && matchesCategory;
    });

    const handleAddToCart = (product: Product) => {
        if (product.stock <= 0) {
            toast.error("Producto sin stock");
            return;
        }
        addItem(product);
        toast.success(`${product.name} agregado al carrito`);
    };

    const handleSelectCategory = (category: string) => {
        setSelectedCategory(category);
        document.getElementById("productos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // Obtener categorías únicas de los productos
    const availableCategories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="pb-20">
                {/* Hero Section */}
                <div className="container mx-auto px-4 mt-8">
                    <FeaturedProductsCarousel
                        products={products.length > 0 ? products : STATIC_PRODUCTS}
                        onAddToCart={handleAddToCart}
                        onSelectCategory={handleSelectCategory}
                    />
                </div>

                <div id="productos" className="container mx-auto px-4 mt-16 scroll-mt-24">
                    <div className="flex flex-col md:flex-row items-end justify-between mb-8 gap-4">
                        <div>
                            <h2 className="text-3xl font-bold mb-2">Nuestros Productos</h2>
                            <p className="text-muted-foreground">Calidad profesional para tu cuidado personal.</p>
                        </div>

                        {/* Filtros */}
                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                            <div id="shop-search" className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-card/50 border-border focus-visible:ring-primary"
                                />
                            </div>
                            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger className="w-full sm:w-[180px] bg-card/50 border-border">
                                    <Filter className="h-4 w-4 mr-2 text-primary" />
                                    <SelectValue placeholder="Categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas</SelectItem>
                                    {availableCategories.map((cat) => (
                                        <SelectItem key={cat} value={cat}>
                                            {cat}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <button
                            type="button"
                            onClick={() => handleSelectCategory("all")}
                            aria-pressed={selectedCategory === "all"}
                            className={`group relative min-h-36 overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 ${selectedCategory === "all" ? "border-primary bg-primary/10 shadow-lg shadow-primary/10" : "border-border bg-card/50 hover:border-primary/40"}`}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent opacity-70" />
                            <div className="relative flex h-full flex-col justify-end">
                                <ShoppingBag className="mb-4 h-7 w-7 text-primary" />
                                <span className="font-display text-xl font-bold text-foreground">Todo NB</span>
                                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">Catálogo completo de cuidado profesional.</span>
                            </div>
                        </button>
                        {availableCategories.map((category) => {
                            const banner = getCategoryBanner(category);
                            const isActive = selectedCategory === category;

                            return (
                                <button
                                    key={category}
                                    type="button"
                                    onClick={() => handleSelectCategory(category)}
                                    aria-pressed={isActive}
                                    className={`group relative min-h-36 overflow-hidden rounded-2xl border bg-card text-left transition-all duration-300 ${isActive ? "border-primary shadow-lg shadow-primary/10" : "border-border hover:border-primary/40"}`}
                                >
                                    {banner.image ? (
                                        <Image
                                            src={banner.image}
                                            alt={banner.alt}
                                            fill
                                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 20vw"
                                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center bg-muted">
                                            <ShoppingBag className="h-10 w-10 text-primary/35" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
                                    <div className="relative flex min-h-36 flex-col justify-end p-4">
                                        <span className="font-display text-xl font-bold text-foreground">{banner.title}</span>
                                        <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{banner.description}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Grid de productos */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {[...Array(8)].map((_, i) => (
                                <Card key={i} className="animate-pulse bg-card/50 border-border h-[400px]">
                                    <CardContent className="p-0">
                                        <div className="aspect-square bg-muted mb-4" />
                                        <div className="p-4 space-y-3">
                                            <div className="h-4 bg-muted rounded w-3/4" />
                                            <div className="h-4 bg-muted rounded w-1/2" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-card/45">
                            <IllustratedEmptyState
                                icon={ShoppingBag}
                                imageSrc="/images/empty/no-productos.webp"
                                imageAlt="Estantería premium de productos NB sin resultados visibles"
                                title="No encontramos productos"
                                description="Probá con otra categoría o ajustá la búsqueda para volver al catálogo."
                                action={
                                    <Button variant="outline" size="sm" onClick={() => {
                                        setSearchQuery("");
                                        setSelectedCategory("all");
                                    }}>
                                        Ver todo el catálogo
                                    </Button>
                                }
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {filteredProducts.map((product) => (
                                <Card
                                    key={product.id}
                                    className="group bg-card/40 border-border overflow-hidden hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/10 flex flex-col"
                                >
                                    <CardContent className="p-0 flex flex-col h-full relative">
                                        {/* Imagen Container */}
                                        <div className="relative aspect-square overflow-hidden bg-muted">
                                            <ImageWithFallback
                                                src={product.image_url}
                                                alt={product.name}
                                                fill
                                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                                                fallbackClassName="h-full w-full"
                                                iconClassName="h-12 w-12 text-primary/20"
                                            />

                                            {/* Gradient Overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-70 transition-opacity group-hover:opacity-50" />

                                            {/* Top Badges */}
                                            <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                                                <Badge variant="secondary" className="border-border bg-background/70 text-[10px] uppercase tracking-wider backdrop-blur-md">
                                                    {product.category}
                                                </Badge>
                                                {product.stock <= 0 ? (
                                                    <Badge variant="destructive">AGOTADO</Badge>
                                                ) : product.stock <= 5 ? (
                                                    <Badge variant="outline" className="animate-pulse border-primary/40 bg-primary/10 text-primary">
                                                        Últimos {product.stock}
                                                    </Badge>
                                                ) : null}
                                            </div>

                                            {/* Add to Cart Overlay Button (Desktop) */}
                                            <div className="absolute inset-x-0 bottom-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 hidden lg:block">
                                                <Button
                                                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-wide"
                                                    onClick={() => handleAddToCart(product)}
                                                    disabled={product.stock <= 0}
                                                >
                                                    <Plus className="mr-2 h-4 w-4" />
                                                    AGREGAR AL CARRITO
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Product Info */}
                                        <div className="p-5 flex flex-col flex-grow relative bg-card/40 backdrop-blur-sm">
                                            <h3 className="font-bold text-lg mb-1 leading-tight group-hover:text-primary transition-colors">
                                                {product.name}
                                            </h3>
                                            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                                                {product.description}
                                            </p>

                                            <div className="mt-auto flex items-center justify-between">
                                                <span className="text-xl font-bold tracking-tight">
                                                    {formatPrice(product.price)}
                                                </span>

                                                {/* Mobile Add Button */}
                                                <Button
                                                    size="icon"
                                                    className="lg:hidden rounded-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                                                    onClick={() => handleAddToCart(product)}
                                                    disabled={product.stock <= 0}
                                                    aria-label={`Agregar ${product.name} al carrito`}
                                                >
                                                    <Plus className="h-5 w-5" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* Carrito flotante */}
            <CartDrawer />

            <Footer />
        </div>
    );
}
