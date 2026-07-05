"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { format, addDays, isBefore, startOfToday, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, Clock, User, Scissors, ArrowRight, ArrowLeft, Check, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header, Footer } from "@/components/layout";
import { cn, formatPrice, generateTimeSlots, calculateEndTime } from "@/lib/utils";
import { BUSINESS_CONFIG } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Service, Barber } from "@/types/database.types";
import { toast } from "sonner";

interface Branch {
  id: number;
  name: string;
  address: string;
  image: string;
  phone: string;
}

// Pasos del flujo de reserva
const STEPS = ["Sucursal", "Servicio", "Referencia (Opcional)", "Barbero", "Fecha y Hora", "Confirmar"];

const STATIC_STYLES = [
  {
    id: "1",
    title: "Fade Degradado Alto",
    image_url: "/lookbook/fade-cut.png",
    serviceId: "1",
  },
  {
    id: "2",
    title: "Perfilado de Barba",
    image_url: "/lookbook/beard-trim.png",
    serviceId: "3",
  },
  {
    id: "3",
    title: "Afeitado Hot Towel",
    image_url: "/lookbook/hot-towel.png",
    serviceId: "3",
  },
  {
    id: "4",
    title: "Styling Texturizado",
    image_url: "/lookbook/styling-pomade.png",
    serviceId: "1",
  },
  {
    id: "6",
    title: "Corte a Tijera",
    image_url: "/lookbook/scissor-cut.png",
    serviceId: "1",
  },
  {
    id: "8",
    title: "Lavado Premium",
    image_url: "/lookbook/hair-wash.png",
    serviceId: "1",
  }
];

function ReservarPageContent() {
  const searchParams = useSearchParams();
  const paramStyleId = searchParams.get("styleId");
  const paramServiceId = searchParams.get("serviceId");

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<typeof STATIC_STYLES[0] | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [hoveredService, setHoveredService] = useState<Service | null>(null);

  // Static Branches
  const STATIC_BRANCHES = [
    {
      id: 1,
      name: "New Brothers Central",
      address: "Av. Principal 1234, Centro",
      image: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&q=80",
      phone: "099 123 456"
    },
    {
      id: 2,
      name: "New Brothers Norte",
      address: "Shopping Norte, Local 5",
      image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&q=80",
      phone: "098 765 432"
    },
    {
      id: 3,
      name: "New Brothers Beach",
      address: "Rambla Costanera 500",
      image: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&q=80",
      phone: "091 112 233"
    }
  ];

  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const supabase = createClient();

  // Cargar servicios y barberos
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);

      const [servicesRes, barbersRes] = await Promise.all([
        supabase.from("services").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("barbers").select("*").eq("is_active", true),
      ]);

      if (servicesRes.data) setServices(servicesRes.data);
      if (barbersRes.data) setBarbers(barbersRes.data);

      setIsLoading(false);
    }
    loadData();
  }, []);

  // Procesar parámetros de URL (Lookbook/Asistente de IA)
  useEffect(() => {
    if (services.length > 0 && paramServiceId) {
      const foundService = services.find((s) => s.id === paramServiceId);
      if (foundService) {
        setSelectedService(foundService);
        // Saltamos directo al paso de seleccionar sucursal (o ya que tiene el servicio pre-elegido,
        // el usuario puede elegir sucursal primero y luego ir directo)
      }
    }
  }, [services, paramServiceId]);

  useEffect(() => {
    if (paramStyleId) {
      const foundStyle = STATIC_STYLES.find((s) => s.id === paramStyleId);
      if (foundStyle) {
        setSelectedStyle(foundStyle);
      }
    }
  }, [paramStyleId]);

  // Cargar slots ocupados cuando cambia barbero o fecha
  useEffect(() => {
    async function loadBookedSlots() {
      if (!selectedBarber || !selectedDate) return;

      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const { data } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("barber_id", selectedBarber.id)
        .eq("appointment_date", dateStr)
        .not("status", "in", '("cancelled")');

      if (data) {
        const booked: string[] = [];
        data.forEach((apt) => {
          const slots = generateTimeSlots(
            BUSINESS_CONFIG.workingHours.start,
            BUSINESS_CONFIG.workingHours.end,
            BUSINESS_CONFIG.timeSlotMinutes || 30
          );
          const startIdx = slots.indexOf(apt.start_time.slice(0, 5));
          const endIdx = slots.indexOf(apt.end_time.slice(0, 5));
          for (let i = startIdx; i < endIdx; i++) {
            if (slots[i]) booked.push(slots[i]);
          }
        });
        setBookedSlots(booked);
      }
    }
    loadBookedSlots();
  }, [selectedBarber, selectedDate]);

  // Generar próximos 14 días disponibles
  const availableDates = Array.from({ length: 14 }, (_, i) => addDays(startOfToday(), i)).filter(
    (date) => BUSINESS_CONFIG.workingDays.includes(date.getDay())
  );

  // Generar slots de tiempo
  const timeSlots = generateTimeSlots(
    BUSINESS_CONFIG.workingHours.start,
    BUSINESS_CONFIG.workingHours.end,
    30
  );

  // Verificar si un slot está disponible
  const isSlotAvailable = (time: string): boolean => {
    if (!selectedService) return false;

    // Verificar que no esté en el pasado si es hoy
    if (selectedDate && isToday(selectedDate)) {
      const [hours, minutes] = time.split(":").map(Number);
      const slotTime = new Date();
      slotTime.setHours(hours, minutes, 0, 0);
      if (isBefore(slotTime, new Date())) return false;
    }

    // Verificar todos los slots que ocupa el servicio
    const slotsNeeded = Math.ceil(selectedService.duration_minutes / 30);
    const startIdx = timeSlots.indexOf(time);

    for (let i = 0; i < slotsNeeded; i++) {
      const slotToCheck = timeSlots[startIdx + i];
      if (!slotToCheck || bookedSlots.includes(slotToCheck)) {
        return false;
      }
    }

    // Verificar que no exceda el horario de cierre
    const endTime = calculateEndTime(time, selectedService.duration_minutes);
    const [endHour] = endTime.split(":").map(Number);
    if (endHour > BUSINESS_CONFIG.workingHours.end) return false;

    return true;
  };

  // Navegación entre pasos
  const canProceed = () => {
    switch (currentStep) {
      case 0: return !!selectedBranch;
      case 1: return !!selectedService;
      case 2: return true; // La referencia es opcional
      case 3: return !!selectedBarber;
      case 4: return !!selectedDate && !!selectedTime;
      case 5: return true;
      default: return false;
    }
  };

  const nextStep = () => {
    if (canProceed() && currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Enviar reserva
  const handleSubmit = async () => {
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime) return;

    setIsSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Debés iniciar sesión para reservar");
      setIsSubmitting(false);
      return;
    }

    // Obtener profile_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      toast.error("Error al obtener tu perfil");
      setIsSubmitting(false);
      return;
    }

    const endTime = calculateEndTime(selectedTime, selectedService.duration_minutes);

    const { error } = await supabase.from("appointments").insert({
      client_id: profile.id,
      barber_id: selectedBarber.id,
      service_id: selectedService.id,
      appointment_date: format(selectedDate, "yyyy-MM-dd"),
      start_time: selectedTime,
      end_time: endTime,
      status: "pending",
      style_reference: selectedStyle ? `${selectedStyle.title} (${selectedStyle.image_url})` : null,
    });

    if (error) {
      if (error.code === "23505") {
        toast.error("Ese horario ya fue reservado. Por favor elegí otro.");
      } else {
        toast.error("Error al crear la reserva. Intentá de nuevo.");
      }
      setIsSubmitting(false);
      return;
    }

    toast.success("¡Reserva confirmada! Te esperamos.");
    // Reset form
    setCurrentStep(0);
    setSelectedService(null);
    setSelectedStyle(null);
    setSelectedBarber(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="pb-16 relative">
        {/* Hero Section */}
        <div className="relative h-[40vh] min-h-[350px] w-full flex items-center justify-center overflow-hidden mb-12">
          {/* Background Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/95 via-black/80 to-background z-0" />
          <div className="absolute inset-0 bg-noise opacity-30 mix-blend-overlay z-0" />

          {/* Floating Images Composition */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute top-0 left-0 bottom-0 w-[15%] md:w-[25%] flex flex-col justify-center py-10 pl-4 md:pl-10">
              <motion.div
                animate={{ y: [0, -15, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="relative w-20 h-20 md:w-32 md:h-32 opacity-20"
              >
                <Image src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&q=80" alt="Scissor" fill className="object-cover rounded-2xl grayscale border border-white/10" />
              </motion.div>
            </div>

            <div className="absolute top-0 right-0 bottom-0 w-[15%] md:w-[25%] flex flex-col justify-center py-10 pr-4 md:pr-10 items-end">
              <motion.div
                animate={{ y: [0, 20, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="relative w-24 h-24 md:w-40 md:h-40 opacity-20"
              >
                <Image src="https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&q=80" alt="Clippers" fill className="object-cover rounded-full grayscale blur-[1px]" />
              </motion.div>
            </div>
          </div>

          <div className="relative z-10 text-center px-4 max-w-4xl pt-16">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Badge variant="outline" className="mb-6 border-primary/50 text-white bg-white/5 backdrop-blur-md px-4 py-1 uppercase tracking-[0.2em] text-xs">
                Premium Booking
              </Badge>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 text-white tracking-tighter drop-shadow-2xl">
                Elegí tu <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-amber-200 to-primary">Estilo</span>
              </h1>
              <p className="text-base md:text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed font-light">
                Seleccioná el servicio, tu profesional de confianza y el horario que mejor te quede. Nosotros nos ocupamos del resto.
              </p>
            </motion.div>
          </div>
        </div>

        <div className="container mx-auto px-4 relative z-10">
          {/* Indicador de pasos */}
          <div className="flex items-center justify-center flex-wrap gap-2 md:gap-4 mb-12 max-w-3xl mx-auto">
            {STEPS.map((step, index) => (
              <div key={step} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full text-xs md:text-sm font-medium transition-all",
                    index < currentStep
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : index === currentStep
                        ? "bg-primary/20 text-primary border-2 border-primary"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {index < currentStep ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span className={cn(
                  "ml-2 text-xs hidden md:block",
                  index === currentStep ? "text-primary font-bold" : "text-muted-foreground"
                )}>
                  {step}
                </span>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-4 md:w-8 lg:w-12 h-0.5 mx-1 md:mx-2",
                      index < currentStep ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Contenido del paso actual */}
          <div className="max-w-4xl mx-auto">
            {/* Paso 1: Sucursal */}
            {currentStep === 0 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  ¿A cuál sucursal querés ir?
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {STATIC_BRANCHES.map((branch) => (
                    <Card
                      key={branch.id}
                      className={cn(
                        "cursor-pointer transition-all duration-300 hover:border-primary/50 group overflow-hidden relative h-full flex flex-col",
                        selectedBranch?.id === branch.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                      )}
                      onClick={() => setSelectedBranch(branch)}
                    >
                      <div className="relative h-48 w-full overflow-hidden">
                        <Image
                          src={branch.image}
                          alt={branch.name}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                        <div className="absolute bottom-0 left-0 p-4">
                          <h3 className="font-bold text-white text-lg">{branch.name}</h3>
                        </div>
                      </div>
                      <CardContent className="p-4 flex-grow">
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-primary" />
                          {branch.address}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          Abierto hoy
                        </p>
                      </CardContent>
                      {selectedBranch?.id === branch.id && (
                        <div className="absolute top-4 right-4 bg-primary text-primary-foreground h-8 w-8 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                          <Check className="h-5 w-5" />
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Paso 2: Servicio */}
            {currentStep === 1 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start animate-in fade-in duration-300">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Scissors className="h-5 w-5 text-primary" />
                    ¿Qué servicio necesitás?
                  </h2>
                  <div className="space-y-3">
                    {services.map((service) => (
                      <Card
                        key={service.id}
                        className={cn(
                          "cursor-pointer transition-all duration-300 hover:border-primary/50 group overflow-hidden relative",
                          selectedService?.id === service.id ? "border-primary bg-primary/5" : "bg-card/50 hover:bg-card/80"
                        )}
                        onClick={() => setSelectedService(service)}
                        onMouseEnter={() => setHoveredService(service)}
                      >
                        <CardContent className="p-6 relative z-10">
                          <div className="flex justify-between items-start mb-2 opacity-90 group-hover:opacity-100 transition-opacity">
                            <h3 className="font-bold text-lg">{service.name}</h3>
                            <Badge variant="secondary" className="bg-white/5 border-white/10 group-hover:border-primary/30 transition-colors">
                              {service.duration_minutes} min
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-4 group-hover:text-gray-300 transition-colors">
                            {service.description}
                          </p>
                          <p className="text-xl font-bold text-primary">
                            {formatPrice(service.price)}
                          </p>
                        </CardContent>
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="hidden lg:block sticky top-24 h-[500px] rounded-3xl overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl relative">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={hoveredService?.id || selectedService?.id || "default"}
                      initial={{ opacity: 0, scale: 1.1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.5 }}
                      className="absolute inset-0"
                    >
                      <Image
                        src={hoveredService?.image_url || selectedService?.image_url || "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&q=80"}
                        alt="Service Preview"
                        fill
                        className="object-cover opacity-60"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    </motion.div>
                  </AnimatePresence>

                  <div className="absolute bottom-0 left-0 right-0 p-8 z-20">
                    <motion.div
                      key={(hoveredService?.id || selectedService?.id) + "-text"}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h3 className="text-2xl font-bold text-white mb-2">
                        {hoveredService?.name || selectedService?.name || "Seleccioná tu experiencia"}
                      </h3>
                      <p className="text-zinc-300 text-sm">
                        {hoveredService?.description || selectedService?.description || "Nuestros barberos expertos te esperan."}
                      </p>
                    </motion.div>
                  </div>
                </div>
              </div>
            )}

            {/* Paso 3: Referencia de Estilo (Opcional) */}
            {currentStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Elegí una referencia de corte (Opcional)
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Seleccioná un estilo visual del Lookbook para que tu barbero sepa exactamente qué estás buscando.
                    </p>
                  </div>
                  {selectedStyle && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedStyle(null)}
                      className="text-xs text-muted-foreground hover:text-white"
                    >
                      Limpiar selección
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {STATIC_STYLES.map((style) => (
                    <Card
                      key={style.id}
                      className={cn(
                        "cursor-pointer transition-all duration-300 hover:border-primary/50 group overflow-hidden relative flex flex-col h-full",
                        selectedStyle?.id === style.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                      )}
                      onClick={() => setSelectedStyle(style)}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-900">
                        <Image
                          src={style.image_url}
                          alt={style.title}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      </div>
                      <CardContent className="p-3 text-center flex-grow flex items-center justify-center">
                        <span className="font-bold text-xs text-white group-hover:text-amber-400 transition-colors">
                          {style.title}
                        </span>
                      </CardContent>
                      {selectedStyle?.id === style.id && (
                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground h-6 w-6 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in">
                          <Check className="h-4 w-4" />
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Paso 4: Barbero */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  ¿Con qué barbero preferís?
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {barbers.map((barber) => (
                    <Card
                      key={barber.id}
                      className={cn(
                        "cursor-pointer transition-all hover:border-primary/50",
                        selectedBarber?.id === barber.id && "border-primary bg-primary/5"
                      )}
                      onClick={() => setSelectedBarber(barber)}
                    >
                      <CardContent className="p-6 text-center">
                        <div className="h-16 w-16 rounded-full bg-primary/10 mx-auto mb-4 flex items-center justify-center">
                          <User className="h-8 w-8 text-primary" />
                        </div>
                        <h3 className="font-semibold text-sm">{barber.name}</h3>
                        {barber.bio && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {barber.bio}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {barbers.length === 0 && (
                    <div className="col-span-3 text-center py-12 text-muted-foreground text-sm">
                      No hay barberos disponibles
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Paso 5: Fecha y Hora */}
            {currentStep === 4 && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    ¿Qué día te queda bien?
                  </h2>
                  <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                    {availableDates.map((date) => (
                      <button
                        key={date.toISOString()}
                        onClick={() => {
                          setSelectedDate(date);
                          setSelectedTime(null);
                        }}
                        className={cn(
                          "flex-shrink-0 flex flex-col items-center p-3 rounded-lg border transition-colors min-w-[80px]",
                          selectedDate?.toDateString() === date.toDateString()
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {format(date, "EEE", { locale: es })}
                        </span>
                        <span className="text-xl font-bold">{format(date, "d")}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(date, "MMM", { locale: es })}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedDate && (
                  <div>
                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      ¿A qué hora?
                    </h2>
                    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                      {timeSlots.map((time) => {
                        const available = isSlotAvailable(time);
                        return (
                          <button
                            key={time}
                            disabled={!available}
                            onClick={() => setSelectedTime(time)}
                            className={cn(
                              "p-2.5 rounded-lg border text-xs text-center transition-colors",
                              !available && "opacity-30 cursor-not-allowed bg-muted",
                              available && selectedTime === time
                                ? "border-primary bg-primary/10 text-primary"
                                : available && "border-border hover:border-primary/50"
                            )}
                          >
                            {time}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paso 6: Confirmación */}
            {currentStep === 5 && (
              <div className="animate-in fade-in duration-300">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <Check className="h-5 w-5 text-primary" />
                  Confirmá tu reserva
                </h2>
                <Card className="overflow-hidden border border-white/10 bg-zinc-900/50 backdrop-blur-sm">
                  <CardHeader className="bg-gradient-to-r from-zinc-900 to-zinc-950 border-b border-white/5">
                    <CardTitle className="text-lg">Resumen de tu turno</CardTitle>
                    <CardDescription className="text-xs">Verificá que todo esté correcto antes de confirmar</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 p-6">
                    <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                      <span className="text-muted-foreground">Sucursal</span>
                      <span className="font-medium text-white">{selectedBranch?.name}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                      <span className="text-muted-foreground">Servicio</span>
                      <span className="font-medium text-white">{selectedService?.name}</span>
                    </div>
                    {selectedStyle && (
                      <div className="flex justify-between py-2 border-b border-white/5 text-sm items-center">
                        <span className="text-muted-foreground">Referencia de Estilo</span>
                        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-2 py-1 rounded">
                          <span className="font-bold text-xs text-primary">{selectedStyle.title}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                      <span className="text-muted-foreground">Barbero</span>
                      <span className="font-medium text-white">{selectedBarber?.name}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                      <span className="text-muted-foreground">Fecha</span>
                      <span className="font-medium text-white">
                        {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                      <span className="text-muted-foreground">Hora</span>
                      <span className="font-medium text-white">
                        {selectedTime} - {selectedService && calculateEndTime(selectedTime!, selectedService.duration_minutes)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-white/5 text-sm">
                      <span className="text-muted-foreground">Duración</span>
                      <span className="font-medium text-white">{selectedService?.duration_minutes} minutos</span>
                    </div>
                    <div className="flex justify-between py-4 text-base">
                      <span className="font-bold text-white">Total a pagar en local</span>
                      <span className="font-bold text-primary text-lg">
                        {selectedService && formatPrice(selectedService.price)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Navegación */}
            <div className="flex justify-between mt-8 border-t border-white/5 pt-6">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 0}
                className="gap-2 h-10 px-4 text-xs md:text-sm border-white/10 text-zinc-300 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>

              {currentStep < STEPS.length - 1 ? (
                <Button onClick={nextStep} disabled={!canProceed()} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground h-10 px-5 text-xs md:text-sm rounded-full">
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold h-10 px-6 rounded-full shadow-lg shadow-amber-500/10 active:scale-95 transition-all"
                >
                  {isSubmitting ? "Confirmando..." : "Confirmar Reserva"}
                  <Check className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function ReservarPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-white">Cargando...</div>}>
      <ReservarPageContent />
    </Suspense>
  );
}
