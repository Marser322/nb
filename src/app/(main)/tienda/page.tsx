"use client";

import { useState, useEffect } from "react";
import { ShoppingBag, Plus, Search, Filter, AlertCircle } from "lucide-react";
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
import { formatPrice } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import type { Product } from "@/types/database.types";
import { toast } from "sonner";
import Image from "next/image";
import { FeaturedProductsCarousel } from "@/components/shop/feature-carousel";

export default function TiendaPage() {
    // Static Premium Products for UI Demo
    const STATIC_PRODUCTS: Product[] = [
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
            created_at: new Date().toISOString()
        },
        {
            id: "2",
            name: "Beard Elixir - Sandalwood",
            description: "Aceite premium para barba con notas de sándalo y aceites esenciales. Hidrata, suaviza y elimina la picazón.",
            price: 600,
            image_url: "/products/beard-elixir.png",
            category: "Cuidado de Barba",
            stock: 8,
            low_stock_threshold: 3,
            is_active: true,
            created_at: new Date().toISOString()
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
            created_at: new Date().toISOString()
        },
        {
            id: "4",
            name: "Carbon Daily Shampoo",
            description: "Shampoo de limpieza profunda con carbón activado. Elimina residuos de productos sin resecar el cabello.",
            price: 450,
            image_url: "/products/shampoo.png",
            category: "Cuidado Capilar",
            stock: 12,
            low_stock_threshold: 4,
            is_active: true,
            created_at: new Date().toISOString()
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
            created_at: new Date().toISOString()
        },
        {
            id: "6",
            name: "Handcrafted Wooden Comb",
            description: "Peine de madera de sándalo anti-estática. Dientes anchos para desenredar sin tirar.",
            price: 350,
            image_url: "/products/wooden-comb.png",
            category: "Accesorios",
            stock: 30,
            low_stock_threshold: 5,
            is_active: true,
            created_at: new Date().toISOString()
        },
        {
            id: "7",
            name: "Precision Shave Gel",
            description: "Gel de afeitado transparente que permite ver exactamente dónde pasas la navaja. Con Aloe Vera.",
            price: 400,
            image_url: "/products/shave-gel.png",
            category: "Afeitado",
            stock: 0,
            low_stock_threshold: 5,
            is_active: true,
            created_at: new Date().toISOString()
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
            created_at: new Date().toISOString()
        }
    ];

    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [isLoading, setIsLoading] = useState(true);

    const addItem = useCartStore((state) => state.addItem);
    const supabase = createClient();

    // Cargar productos
    useEffect(() => {
        // Simulamos carga de API pero usamos datos estáticos para la demo visual
        async function loadProducts() {
            setIsLoading(true);

            // Simular delay de red
            await new Promise(resolve => setTimeout(resolve, 800));

            setProducts(STATIC_PRODUCTS);
            setFilteredProducts(STATIC_PRODUCTS);
            setIsLoading(false);
        }
        loadProducts();
    }, []);

    // Filtrar productos
    useEffect(() => {
        let filtered = products;

        // Filtrar por búsqueda
        if (searchQuery) {
            filtered = filtered.filter(
                (p) =>
                    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Filtrar por categoría
        if (selectedCategory !== "all") {
            filtered = filtered.filter((p) => p.category === selectedCategory);
        }

        setFilteredProducts(filtered);
    }, [searchQuery, selectedCategory, products]);

    const handleAddToCart = (product: Product) => {
        if (product.stock <= 0) {
            toast.error("Producto sin stock");
            return;
        }
        addItem(product);
        toast.success(`${product.name} agregado al carrito`);
    };

    // Obtener categorías únicas de los productos
    const availableCategories = [...new Set(products.map((p) => p.category))];

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="pb-20">
                {/* Hero Section */}
                <div className="container mx-auto px-4 mt-8">
                    <FeaturedProductsCarousel />
                </div>

                <div className="container mx-auto px-4 mt-16">
                    <div className="flex flex-col md:flex-row items-end justify-between mb-8 gap-4">
                        <div>
                            <h2 className="text-3xl font-bold mb-2">Nuestros Productos</h2>
                            <p className="text-muted-foreground">Calidad profesional para tu cuidado personal.</p>
                        </div>

                        {/* Filtros */}
                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-card/50 border-white/10 focus-visible:ring-primary"
                                />
                            </div>
                            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                                <SelectTrigger className="w-full sm:w-[180px] bg-card/50 border-white/10">
                                    <Filter className="h-4 w-4 mr-2 text-primary" />
                                    <SelectValue placeholder="Categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas</SelectItem>
                                    {availableCategories.map((cat) => (
                                        <SelectItem key={cat} value={cat || ""}>
                                            {cat}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Grid de productos */}
                    {isLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {[...Array(8)].map((_, i) => (
                                <Card key={i} className="animate-pulse bg-white/5 border-white/5 h-[400px]">
                                    <CardContent className="p-0">
                                        <div className="aspect-square bg-white/5 mb-4" />
                                        <div className="p-4 space-y-3">
                                            <div className="h-4 bg-white/5 rounded w-3/4" />
                                            <div className="h-4 bg-white/5 rounded w-1/2" />
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10">
                            <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                            <h3 className="text-xl font-bold mb-2">No encontramos productos</h3>
                            <p className="text-muted-foreground">Probá buscando con otros términos.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                            {filteredProducts.map((product) => (
                                <Card
                                    key={product.id}
                                    className="group bg-card/40 border-white/5 overflow-hidden hover:border-primary/50 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/10 flex flex-col"
                                >
                                    <CardContent className="p-0 flex flex-col h-full relative">
                                        {/* Imagen Container */}
                                        <div className="relative aspect-square overflow-hidden bg-black/40">
                                            {product.image_url ? (
                                                <Image
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    fill
                                                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <ShoppingBag className="h-12 w-12 text-primary/20" />
                                                </div>
                                            )}

                                            {/* Gradient Overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                                            {/* Top Badges */}
                                            <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
                                                <Badge variant="secondary" className="bg-black/60 backdrop-blur-md border-white/10 text-[10px] uppercase tracking-wider">
                                                    {product.category}
                                                </Badge>
                                                {product.stock <= 0 ? (
                                                    <Badge variant="destructive">AGOTADO</Badge>
                                                ) : product.stock <= 5 ? (
                                                    <Badge className="bg-amber-500 text-black border-none animate-pulse">
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
                                                >
                                                    <Plus className="h-5 w-5" />
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
