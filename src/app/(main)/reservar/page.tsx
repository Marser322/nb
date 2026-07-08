"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useRef, Suspense, useMemo, type KeyboardEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { format, addDays, isBefore, startOfToday, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar, Clock, User, Scissors, ArrowRight, ArrowLeft, Check, MapPin, Sparkles, Repeat, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header, Footer } from "@/components/layout";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { cn, formatPrice, generateTimeSlotsFromRange, calculateEndTime } from "@/lib/utils";
import { BRANCHES, ROUTES, SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Service, Barber, DayAvailability } from "@/types/database.types";
import { toast } from "sonner";
import { STATIC_STYLES, getBarberAvatarUrl, STATIC_SERVICES, STATIC_BARBERS } from "@/lib/static-data";
import { bookAppointment, fetchAvailability, dayHasFreeSlot } from "@/lib/booking";
import { useFeatures } from "@/lib/features";

interface Branch {
  id: string | number;
  name: string;
  address: string;
  image: string;
  phone: string;
  tone: string;
}

// Referencia de estilo del wizard: mezcla de la tabla `lookbook` (DB) y `STATIC_STYLES`
// (fallback). Solo se usan estos campos comunes en todo el flujo de reserva.
interface StyleItem {
  id: string;
  title: string;
  image_url: string;
  serviceId?: string | null;
  tags?: string[];
}

// Pasos del flujo de reserva
const STEPS = ["Sucursal", "Servicio", "Referencia (Opcional)", "Barbero", "Fecha y Hora", "Confirmar"];

function ReservarPageContent() {
  const { features } = useFeatures();
  const searchParams = useSearchParams();
  const router = useRouter();
  const paramStyleId = searchParams.get("styleId");
  const paramServiceId = searchParams.get("serviceId");
  const paramBarberId = searchParams.get("barberId");

  const [currentStep, setCurrentStep] = useState(0);
  const [draftChecked, setDraftChecked] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<StyleItem | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<Barber | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [hoveredService, setHoveredService] = useState<Service | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [styles, setStyles] = useState<StyleItem[]>(STATIC_STYLES);
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const stepContentRef = useRef<HTMLDivElement>(null);

  // Cargar servicios, barberos, sucursales y lookbook
  useEffect(() => {
    async function loadData() {
      setIsLoading(true);

      const [servicesRes, barbersRes, branchesRes, lookbookRes] = await Promise.all([
        supabase.from("services").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("barbers").select("*").eq("is_active", true),
        supabase.from("branches").select("*").eq("is_active", true).order("name"),
        supabase.from("lookbook").select("*").order("created_at", { ascending: false }),
      ]);

      const loadedServices = servicesRes?.data && servicesRes.data.length > 0 ? servicesRes.data : STATIC_SERVICES;
      const loadedBarbers = barbersRes?.data && barbersRes.data.length > 0 ? barbersRes.data : STATIC_BARBERS;
      const loadedStyles: StyleItem[] =
        lookbookRes?.data && lookbookRes.data.length > 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? lookbookRes.data.map((s: any) => ({
              id: s.id,
              title: s.title,
              image_url: s.image_url,
              serviceId: s.serviceId ?? null,
              tags: s.tags ?? [],
            }))
          : STATIC_STYLES;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadedBranches = (branchesRes?.data || []).map((dbb: any) => {
        const staticB = BRANCHES.find((sb) => sb.name === dbb.name);
        return {
          id: dbb.id,
          name: dbb.name,
          address: dbb.address || staticB?.address || "",
          image: staticB?.image || "/images/branches/sucursal-central.jpg",
          phone: dbb.phone || staticB?.phone || "",
          tone: staticB?.tone || "",
        };
      });

      const finalBranches = loadedBranches.length > 0 ? loadedBranches : BRANCHES;

      setServices(loadedServices);
      setBarbers(loadedBarbers);
      setBranches(finalBranches);
      setStyles(loadedStyles);

      let resolvedService: Service | null = null;
      let resolvedStyle: StyleItem | null = null;
      let resolvedBarber: Barber | null = null;

      if (paramServiceId) {
        const numericServiceId = Number(paramServiceId);
        resolvedService = loadedServices.find((service) => service.id === paramServiceId)
          || loadedServices.find((service) => Number.isFinite(numericServiceId) && service.sort_order === numericServiceId)
          || null;

        if (resolvedService) setSelectedService(resolvedService);
      }

      if (paramStyleId) {
        // El Lookbook público (`/lookbook`) sigue usando ids estáticos aunque la DB
        // tenga registros reales, así que buscamos primero en la lista cargada y,
        // si no aparece, en STATIC_STYLES (compatibilidad con links viejos/estáticos).
        resolvedStyle = loadedStyles.find((style) => style.id === paramStyleId)
          ?? STATIC_STYLES.find((style) => style.id === paramStyleId)
          ?? null;
        if (resolvedStyle) setSelectedStyle(resolvedStyle);
      }

      if (paramBarberId) {
        resolvedBarber = loadedBarbers.find((barber) => barber.id === paramBarberId) ?? null;
        if (resolvedBarber) setSelectedBarber(resolvedBarber);
      }

      // Sucursal única: se auto-selecciona (el paso Sucursal queda resuelto).
      // FASE 22 A2: en rebook desde "Mi cuenta" la sucursal se deriva del barbero.
      let resolvedBranch: Branch | null = null;
      if (finalBranches.length === 1) {
        resolvedBranch = finalBranches[0];
      } else if (resolvedBarber?.branch_id) {
        resolvedBranch = finalBranches.find((branch) => String(branch.id) === String(resolvedBarber?.branch_id)) ?? null;
      }
      if (resolvedBranch) setSelectedBranch(resolvedBranch);

      // Arranque inteligente: aterrizar en el primer paso sin resolver.
      // El draft-check (efecto siguiente) tiene prioridad y puede pisar esto con el paso 5.
      let landingStep = 0;
      if (resolvedBranch) {
        landingStep = 1;
        if (resolvedService) {
          landingStep = 2;
          if (resolvedStyle) {
            landingStep = 3;
            if (resolvedBarber) {
              landingStep = 4;
            }
          }
        }
      }
      if (landingStep > 0) setCurrentStep(landingStep);

      setIsLoading(false);
    }
    loadData();
  }, [paramBarberId, paramServiceId, paramStyleId, supabase]);

  // Rehidratar borrador de sessionStorage
  useEffect(() => {
    if (isLoading || draftChecked) return;
    setDraftChecked(true);

    async function checkDraft() {
      const draftStr = sessionStorage.getItem("nb-reserva-draft");
      if (!draftStr) return;

      try {
        const draft = JSON.parse(draftStr);
        // Validar expiración (45 minutos)
        if (!draft.savedAt || Date.now() - draft.savedAt > 2700000) {
          sessionStorage.removeItem("nb-reserva-draft");
          return;
        }

        // Verificar sesión activa
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // Si no hay sesión, mantenemos el draft para cuando se loguee
          return;
        }

        // Rehidratar si los elementos existen en las listas cargadas
        const branch = branches.find((b) => String(b.id) === String(draft.branchId)) ?? null;
        const service = services.find((s) => s.id === draft.serviceId) ?? null;
        const style = styles.find((st) => st.id === draft.styleId)
          ?? STATIC_STYLES.find((st) => st.id === draft.styleId)
          ?? null;
        const barber = barbers.find((ba) => ba.id === draft.barberId) ?? null;

        if (branch && service && barber && draft.dateISO && draft.time) {
          setSelectedBranch(branch);
          setSelectedService(service);
          setSelectedStyle(style);
          setSelectedBarber(barber);
          setSelectedDate(new Date(draft.dateISO));
          setSelectedTime(draft.time);
          setIsRecurring(draft.isRecurring || false);

          // Saltar directamente a la confirmación (Paso 6, índice 5)
          setCurrentStep(5);
          toast.success("Retomamos tu reserva donde la dejaste");
        }

        sessionStorage.removeItem("nb-reserva-draft");
      } catch (err) {
        console.error("Error parsing or rehydrating draft:", err);
        sessionStorage.removeItem("nb-reserva-draft");
      }
    }

    checkDraft();
  }, [isLoading, draftChecked, branches, services, barbers, styles, supabase]);

  // Filtrar barberos según la sucursal seleccionada (los barberos sin branch_id asignado se muestran en todas)
  const filteredBarbers = useMemo(() => {
    return barbers.filter(
      (b) => !selectedBranch || !b.branch_id || String(b.branch_id) === String(selectedBranch.id)
    );
  }, [barbers, selectedBranch]);

  // Agrupar servicios por categoría (paso 1). Con una sola categoría (o `category`
  // ausente en la DB, columna de la migración 021 aún no corrida) queda lista plana,
  // sin cambios de comportamiento. `category` puede venir undefined/null: fallback 'otro'.
  const groupedServices = useMemo(() => {
    const distinctCategories = new Set(services.map((s) => s.category || "otro"));
    if (distinctCategories.size <= 1) return null;

    const order = [...SERVICE_CATEGORIES, "otro"];
    return order
      .map((category) => ({
        category,
        label: SERVICE_CATEGORY_LABELS[category] || SERVICE_CATEGORY_LABELS.otro,
        items: services.filter((s) => (s.category || "otro") === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [services]);

  // Obtener la configuración del día seleccionado
  const selectedDayConfig = useMemo(() => {
    if (!selectedDate || availability.length === 0) return null;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    return availability.find((day) => day.day === dateStr) || null;
  }, [selectedDate, availability]);

  // Generar slots de tiempo dinámicos para el día seleccionado
  const timeSlots = useMemo(() => {
    if (!selectedDayConfig || !selectedDayConfig.is_open || !selectedDayConfig.open_time || !selectedDayConfig.close_time) {
      return [];
    }
    const startStr = selectedDayConfig.open_time.slice(0, 5);
    const endStr = selectedDayConfig.close_time.slice(0, 5);
    return generateTimeSlotsFromRange(startStr, endStr, selectedDayConfig.slot_minutes || 30);
  }, [selectedDayConfig]);

  // Cargar disponibilidad completa de 14 días cuando cambia el barbero
  useEffect(() => {
    async function loadAvailability() {
      if (!selectedBarber) {
        setAvailability([]);
        return;
      }

      setIsLoadingSlots(true);
      try {
        const todayStr = format(startOfToday(), "yyyy-MM-dd");
        const toStr = format(addDays(startOfToday(), 13), "yyyy-MM-dd");
        const data = await fetchAvailability(supabase, selectedBarber.id, todayStr, toStr);
        setAvailability(data);
      } catch (err) {
        console.error("Error loading availability:", err);
        toast.error("Error al cargar la disponibilidad del barbero.");
      } finally {
        setIsLoadingSlots(false);
      }
    }
    loadAvailability();
  }, [selectedBarber, supabase]);

  // Generar próximos 14 días disponibles a partir de la respuesta del RPC.
  // Los días abiertos pero completos (sin hueco para la duración del servicio) se
  // mantienen visibles y deshabilitados en vez de ocultarse.
  const availableDates = useMemo(() => {
    return availability
      .filter((day) => day.is_open)
      .map((day) => ({
        date: new Date(day.day + "T00:00:00"),
        hasFreeSlot: selectedService ? dayHasFreeSlot(day, selectedService.duration_minutes) : true,
      }));
  }, [availability, selectedService]);

  // Verificar si un slot está disponible en el cliente
  const isSlotAvailable = (time: string): boolean => {
    if (!selectedService || !selectedDayConfig) return false;

    // 1. Verificar que no esté en el pasado si es hoy
    if (selectedDate && isToday(selectedDate)) {
      const [hours, minutes] = time.split(":").map(Number);
      const slotTime = new Date();
      slotTime.setHours(hours, minutes, 0, 0);
      if (isBefore(slotTime, new Date())) return false;
    }

    const slotDuration = selectedDayConfig.slot_minutes || 30;
    const slotsNeeded = Math.ceil(selectedService.duration_minutes / slotDuration);
    const startIdx = timeSlots.indexOf(time);

    // Calcular hora de fin
    const endTime = calculateEndTime(time, selectedService.duration_minutes);

    // 2. Verificar que no exceda el horario de cierre
    const closeTimeStr = selectedDayConfig.close_time!.slice(0, 5);
    if (endTime > closeTimeStr) return false;

    // Verificar superposiciones para todos los slots consecutivos requeridos
    for (let i = 0; i < slotsNeeded; i++) {
      const slotToCheck = timeSlots[startIdx + i];
      if (!slotToCheck) return false;

      const slotEndToCheck = calculateEndTime(slotToCheck, slotDuration);

      // A. Citas existentes (booked)
      const isBooked = selectedDayConfig.booked.some((apt) => {
        const aptStart = apt.start.slice(0, 5);
        const aptEnd = apt.end.slice(0, 5);
        return slotToCheck < aptEnd && aptStart < slotEndToCheck;
      });
      if (isBooked) return false;

      // B. Descanso (break_start, break_end)
      if (selectedDayConfig.break_start && selectedDayConfig.break_end) {
        const breakStart = selectedDayConfig.break_start.slice(0, 5);
        const breakEnd = selectedDayConfig.break_end.slice(0, 5);
        if (slotToCheck < breakEnd && breakStart < slotEndToCheck) return false;
      }

      // C. Bloqueos de agenda
      const isBlocked = selectedDayConfig.blocks.some((block) => {
        const blockStart = block.start.slice(0, 5);
        const blockEnd = block.end.slice(0, 5);
        return slotToCheck < blockEnd && blockStart < slotEndToCheck;
      });
      if (isBlocked) return false;
    }

    return true;
  };

  // Si el día elegido no deja ningún horario disponible (ni siquiera uno)
  const hasAnyTimeSlot = useMemo(() => {
    if (timeSlots.length === 0) return false;
    return timeSlots.some((time) => isSlotAvailable(time));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlots, selectedDayConfig, selectedService, selectedDate]);

  const handleBranchSelect = (branch: Branch) => {
    setSelectedBranch(branch);
    setSelectedBarber(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setAvailability([]);
  };

  const handleServiceSelect = (service: Service) => {
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedTime(null);
  };

  // Card de servicio (paso 1). Extraída para reusarse tanto en la lista plana
  // como en los grupos por categoría (FASE 26).
  const renderServiceCard = (service: Service) => (
    <Card
      key={service.id}
      role="button"
      tabIndex={0}
      aria-pressed={selectedService?.id === service.id}
      className={cn(
        "cursor-pointer transition-all duration-300 hover:border-primary/50 group overflow-hidden relative",
        selectedService?.id === service.id ? "border-primary bg-primary/5" : "bg-card/50 hover:bg-card/80"
      )}
      onClick={() => handleServiceSelect(service)}
      onKeyDown={(event) => handleSelectionKey(event, () => handleServiceSelect(service))}
      onMouseEnter={() => setHoveredService(service)}
      onMouseLeave={() => setHoveredService(null)}
    >
      <CardContent className="p-6 relative z-10">
        <div className="flex items-start gap-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-muted lg:hidden">
            <ImageWithFallback
              src={service.image_url}
              alt={service.name}
              fill
              sizes="64px"
              className="object-cover"
              fallbackClassName="h-full w-full"
              iconClassName="h-6 w-6"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between items-start mb-2 opacity-90 group-hover:opacity-100 transition-opacity">
              <h3 className="font-bold text-lg">{service.name}</h3>
              <Badge variant="secondary" className="bg-muted border-border group-hover:border-primary/30 transition-colors">
                {service.duration_minutes} min
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-4 group-hover:text-foreground transition-colors">
              {service.description}
            </p>
            <p className="text-xl font-bold text-primary">
              {formatPrice(service.price)}
            </p>
          </div>
        </div>
      </CardContent>
      <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
    </Card>
  );

  const handleBarberSelect = (barber: Barber) => {
    setSelectedBarber(barber);
    setSelectedDate(null);
    setSelectedTime(null);
    setAvailability([]);
  };

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  };

  const handleSelectionKey = (event: KeyboardEvent<HTMLElement>, action: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
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

  const scrollToStepContent = () => {
    stepContentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const nextStep = () => {
    if (canProceed() && currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      scrollToStepContent();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      scrollToStepContent();
    }
  };

  // Enviar reserva
  const handleSubmit = async () => {
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime) return;

    const isRecurringVal = isRecurring && features.suscripciones;
    setIsSubmitting(true);

    const isDummy = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("dummy") || false;

    if (isDummy) {
      // Modo de prueba local interactivo
      await new Promise((resolve) => setTimeout(resolve, 800)); // simular latencia

      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const endTime = calculateEndTime(selectedTime, selectedService.duration_minutes);

      const mockAppointmentId = Math.random().toString(36).substring(2, 9);
      let mockSubscriptionId = null;

      if (isRecurringVal) {
        mockSubscriptionId = "sub-" + Math.random().toString(36).substring(2, 9);
        const localSubs = JSON.parse(localStorage.getItem("nb-subscriptions") || "[]");
        const newSub = {
          id: mockSubscriptionId,
          client_id: "mock-client-id",
          barber_id: selectedBarber.id,
          service_id: selectedService.id,
          day_of_week: selectedDate.getDay(),
          start_time: selectedTime,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        localSubs.push(newSub);
        localStorage.setItem("nb-subscriptions", JSON.stringify(localSubs));
      }

      const localAppointments = JSON.parse(localStorage.getItem("nb-appointments") || "[]");
      const newAppointment = {
        id: mockAppointmentId,
        client_id: "mock-client-id",
        barber_id: selectedBarber.id,
        service_id: selectedService.id,
        appointment_date: dateStr,
        start_time: selectedTime,
        end_time: endTime,
        status: "pending",
        style_reference: selectedStyle ? `${selectedStyle.title}` : null,
        subscription_id: mockSubscriptionId,
        created_at: new Date().toISOString(),
      };
      localAppointments.push(newAppointment);
      localStorage.setItem("nb-appointments", JSON.stringify(localAppointments));

      toast.success(
        isRecurringVal
          ? "¡Suscripción y primera cita confirmadas en modo local!"
          : "¡Reserva confirmada en modo local! Te esperamos."
      );

      setIsConfirmed(true);
      setIsSubmitting(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Guardar borrador en sessionStorage
      const draft = {
        branchId: selectedBranch?.id,
        serviceId: selectedService?.id,
        styleId: selectedStyle?.id,
        barberId: selectedBarber?.id,
        dateISO: selectedDate?.toISOString(),
        time: selectedTime,
        isRecurring: isRecurringVal,
        savedAt: Date.now()
      };
      sessionStorage.setItem("nb-reserva-draft", JSON.stringify(draft));
      toast.error("Debés iniciar sesión para reservar. Guardamos tu borrador.");
      setIsSubmitting(false);
      router.push("/login?next=/reservar");
      return;
    }

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const styleRef = selectedStyle ? `${selectedStyle.title} (${selectedStyle.image_url})` : null;

    const res = await bookAppointment(supabase, {
      barberId: selectedBarber.id,
      serviceId: selectedService.id,
      date: dateStr,
      startTime: selectedTime,
      isRecurring: isRecurringVal,
      styleReference: styleRef,
      notes: null,
    });

    if (!res.ok) {
      toast.error(res.message);
      if (res.code === "SLOT_OCUPADO" || res.code === "23P01" || res.code === "FUERA_DE_HORARIO") {
        // Volver al paso de Fecha y Hora y recargar disponibilidad completa
        try {
          const todayStr = format(startOfToday(), "yyyy-MM-dd");
          const toStr = format(addDays(startOfToday(), 13), "yyyy-MM-dd");
          const data = await fetchAvailability(supabase, selectedBarber.id, todayStr, toStr);
          setAvailability(data);
        } catch (err) {
          console.error("Error refreshing availability:", err);
        }
        setSelectedTime(null);
        setCurrentStep(4);
      }
      setIsSubmitting(false);
      return;
    }

    toast.success(
      isRecurringVal
        ? "¡Suscripción de Turno Fijo y cita confirmadas!"
        : "¡Reserva confirmada! Te esperamos."
    );

    // Borrar draft tras submit exitoso
    sessionStorage.removeItem("nb-reserva-draft");

    setIsConfirmed(true);
    setIsSubmitting(false);
  };

  // Reinicia el wizard por completo (usado tras la pantalla de éxito)
  const resetForm = () => {
    setIsConfirmed(false);
    setCurrentStep(0);
    setSelectedBranch(null);
    setSelectedService(null);
    setSelectedStyle(null);
    setSelectedBarber(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setIsRecurring(false);
  };

  // Pantalla de éxito: cierra el ciclo de la reserva con resumen y CTAs.
  // Guard después de todos los hooks del componente (regla de oro).
  if (isConfirmed) {
    const isRecurringVal = isRecurring && features.suscripciones;
    return (
      <div className="min-h-screen bg-background">
        <Header />

        <main className="pb-16">
          <div className="container mx-auto px-4 py-20 md:py-28 max-w-2xl">
            <div className="text-center mb-10 animate-in fade-in duration-500">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 border border-primary/30">
                <Check className="h-10 w-10 text-primary" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                ¡Reserva confirmada!
              </h1>
              <p className="text-muted-foreground">
                Te esperamos. Guardamos este resumen en tu cuenta para que lo consultes cuando quieras.
              </p>
            </div>

            <Card className="overflow-hidden border border-border bg-card/50 backdrop-blur-sm animate-in fade-in duration-500">
              <CardHeader className="bg-gradient-to-r from-card to-background border-b border-border">
                <CardTitle className="text-lg">Resumen de tu turno</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                  <span className="text-muted-foreground">Sucursal</span>
                  <span className="font-medium text-foreground">{selectedBranch?.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                  <span className="text-muted-foreground">Servicio</span>
                  <span className="font-medium text-foreground">{selectedService?.name}</span>
                </div>
                {selectedStyle && (
                  <div className="flex justify-between py-2 border-b border-border/50 text-sm items-center">
                    <span className="text-muted-foreground">Referencia de Estilo</span>
                    <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-2 py-1 rounded">
                      <span className="font-bold text-xs text-primary">{selectedStyle.title}</span>
                    </div>
                  </div>
                )}
                <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                  <span className="text-muted-foreground">Barbero</span>
                  <span className="font-medium text-foreground">{selectedBarber?.name}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                  <span className="text-muted-foreground">Fecha</span>
                  <span className="font-bold text-foreground">
                    {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                  <span className="text-muted-foreground">Hora</span>
                  <span className="font-bold text-foreground">
                    {selectedTime} - {selectedService && selectedTime && calculateEndTime(selectedTime, selectedService.duration_minutes)}
                  </span>
                </div>
                {isRecurringVal && (
                  <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                    <span className="text-muted-foreground">Turno fijo</span>
                    <span className="font-medium text-primary">Activado (semanal)</span>
                  </div>
                )}
                <div className="flex justify-between py-4 text-base">
                  <span className="font-bold text-foreground">Total a pagar en local</span>
                  <span className="font-bold text-primary text-lg">
                    {selectedService && formatPrice(selectedService.price)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center animate-in fade-in duration-500">
              <Button asChild size="lg" className="gap-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
                <Link href={ROUTES.MI_CUENTA}>
                  Ver mis reservas
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="rounded-full" onClick={resetForm}>
                Hacer otra reserva
              </Button>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    );
  }

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
                <Image src="/images/hero/herramientas-barberia.jpg" alt="Herramientas de barbería" fill sizes="(max-width: 768px) 80px, 128px" className="object-cover rounded-2xl grayscale border border-border" />
              </motion.div>
            </div>

            <div className="absolute top-0 right-0 bottom-0 w-[15%] md:w-[25%] flex flex-col justify-center py-10 pr-4 md:pr-10 items-end">
              <motion.div
                animate={{ y: [0, 20, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="relative w-24 h-24 md:w-40 md:h-40 opacity-20"
              >
                <Image src="/images/hero/maquina-clippers.jpg" alt="Máquina de corte profesional" fill sizes="(max-width: 768px) 96px, 160px" className="object-cover rounded-full grayscale blur-[1px]" />
              </motion.div>
            </div>
          </div>

          <div className="relative z-10 text-center px-4 max-w-4xl pt-16">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Badge variant="outline" className="mb-6 border-primary/50 text-foreground bg-primary/10 backdrop-blur-md px-4 py-1 uppercase tracking-[0.2em] text-xs">
                Premium Booking
              </Badge>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 text-foreground tracking-tighter drop-shadow-2xl">
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
          <div className="mb-10 rounded-2xl border border-border bg-card/50 p-4 shadow-sm md:hidden">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Paso {currentStep + 1} de {STEPS.length}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {STEPS[currentStep]}
                </p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary bg-primary/10 text-sm font-bold text-primary">
                {currentStep + 1}
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="mb-12 hidden max-w-3xl items-center justify-center gap-2 md:flex md:flex-wrap md:gap-4 md:mx-auto">
            {STEPS.map((step, index) => (
              <div key={step} className="flex items-center">
                <div
                  id={`step-indicator-${index}`}
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
          <div ref={stepContentRef} className="max-w-4xl mx-auto scroll-mt-24">
            {/* Paso 1: Sucursal */}
            {currentStep === 0 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  ¿A cuál sucursal querés ir?
                </h2>
                <p className="-mt-4 mb-6 text-sm text-muted-foreground">
                  Tocá una tarjeta para seleccionarla y después avanzá con Siguiente.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {branches.map((branch) => (
                    <Card
                      key={branch.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedBranch?.id === branch.id}
                      className={cn(
                        "cursor-pointer transition-all duration-300 hover:border-primary/50 group overflow-hidden relative h-full flex flex-col",
                        selectedBranch?.id === branch.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                      )}
                      onClick={() => handleBranchSelect(branch)}
                      onKeyDown={(event) => handleSelectionKey(event, () => handleBranchSelect(branch))}
                    >
                      <div className="relative h-48 w-full overflow-hidden">
                        <ImageWithFallback
                          src={branch.image}
                          alt={branch.name}
                          fill
                          sizes="(max-width: 768px) 100vw, 33vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-110"
                          fallbackClassName="h-full w-full"
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
                        <p className="text-xs text-muted-foreground mb-3">
                          {branch.tone}
                        </p>
                        {branch.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-2">
                            <Phone className="h-4 w-4 text-primary" />
                            {branch.phone}
                          </p>
                        )}
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
                  <p className="-mt-4 mb-6 text-sm text-muted-foreground">
                    Elegí el servicio y confirmá el paso con Siguiente.
                  </p>
                  <div className="space-y-3">
                    {isLoading ? (
                      <div className="space-y-3">
                        {[...Array(4)].map((_, i) => (
                          <Card key={i} className="bg-card/50 border-border animate-pulse">
                            <CardContent className="p-6 space-y-3">
                              <div className="flex justify-between items-center">
                                <div className="h-5 bg-muted/60 rounded w-1/3" />
                                <div className="h-5 bg-muted/40 rounded w-16" />
                              </div>
                              <div className="h-3 bg-muted/30 rounded w-3/4" />
                              <div className="h-3 bg-muted/20 rounded w-1/2" />
                              <div className="h-6 bg-muted/50 rounded w-20 pt-2" />
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : groupedServices ? (
                      groupedServices.map((group) => (
                        <div key={group.category} className="space-y-3">
                          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            {group.label}
                          </h3>
                          {group.items.map((service) => renderServiceCard(service))}
                        </div>
                      ))
                    ) : (
                      services.map((service) => renderServiceCard(service))
                    )}
                  </div>
                </div>

                <div className="hidden lg:block sticky top-24 h-[500px] rounded-3xl overflow-hidden border border-border bg-card/45 backdrop-blur-xl relative">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={hoveredService?.id || selectedService?.id || "default"}
                      initial={{ opacity: 0, scale: 1.1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.5 }}
                      className="absolute inset-0"
                    >
                      <ImageWithFallback
                        src={hoveredService?.image_url || selectedService?.image_url || "/images/hero/ambiente-barberia.jpg"}
                        alt={hoveredService?.name || selectedService?.name || "Vista previa del servicio"}
                        fill
                        sizes="(max-width: 1024px) 0px, 50vw"
                        className="object-cover opacity-60"
                        fallbackClassName="h-full w-full"
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
                      <h3 className="text-2xl font-bold text-foreground mb-2">
                        {hoveredService?.name || selectedService?.name || "Seleccioná tu experiencia"}
                      </h3>
                      <p className="text-muted-foreground text-sm">
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
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-primary" />
                      Elegí una referencia de corte (Opcional)
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Seleccioná un estilo visual del Lookbook para que tu barbero sepa exactamente qué estás buscando.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedStyle(null);
                      }}
                      className="text-xs border-border text-muted-foreground hover:text-foreground bg-muted rounded-full px-4"
                    >
                      Sin referencia
                    </Button>
                    {selectedStyle && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedStyle(null)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Limpiar
                      </Button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {styles.map((style) => (
                    <Card
                      key={style.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedStyle?.id === style.id}
                      className={cn(
                        "cursor-pointer transition-all duration-300 hover:border-primary/50 group overflow-hidden relative flex flex-col h-full",
                        selectedStyle?.id === style.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                      )}
                      onClick={() => setSelectedStyle(style)}
                      onKeyDown={(event) => handleSelectionKey(event, () => setSelectedStyle(style))}
                    >
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                        <ImageWithFallback
                          src={style.image_url}
                          alt={style.title}
                          fill
                          sizes="(max-width: 768px) 50vw, 33vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          fallbackClassName="h-full w-full"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      </div>
                      <CardContent className="p-3 text-center flex-grow flex items-center justify-center">
                        <span className="font-bold text-xs text-foreground group-hover:text-primary transition-colors">
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
                <p className="-mt-4 mb-6 text-sm text-muted-foreground">
                  Seleccioná tu barbero y avanzá cuando estés seguro.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {isLoading ? (
                    [...Array(3)].map((_, i) => (
                      <Card key={i} className="bg-card/50 border-border animate-pulse overflow-hidden">
                        <div className="relative aspect-square w-full bg-muted/40 animate-pulse" />
                        <div className="p-5 space-y-2">
                          <div className="h-4 bg-muted/60 rounded w-1/2" />
                          <div className="h-3 bg-muted/30 rounded w-3/4" />
                          <div className="h-3 bg-muted/20 rounded w-1/2" />
                        </div>
                      </Card>
                    ))
                  ) : filteredBarbers.length === 0 ? (
                    <div className="col-span-1 md:col-span-3 text-center py-12 text-muted-foreground bg-card/25 border border-border rounded-xl">
                      <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30 animate-pulse" />
                      <p className="font-semibold text-foreground/80 text-base">No hay barberos asignados a esta sucursal</p>
                      <p className="text-xs mt-1">Intentá seleccionando otra sucursal.</p>
                    </div>
                  ) : filteredBarbers.map((barber) => {
                    const avatarUrl = getBarberAvatarUrl(barber);
                    const isSelected = selectedBarber?.id === barber.id;

                    return (
                      <Card
                        key={barber.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={isSelected}
                        className={cn(
                          "group cursor-pointer transition-all duration-300 hover:border-primary/50 overflow-hidden",
                          isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                        )}
                        onClick={() => handleBarberSelect(barber)}
                        onKeyDown={(event) => handleSelectionKey(event, () => handleBarberSelect(barber))}
                      >
                        <CardContent className="p-0">
                          <div className="relative aspect-square overflow-hidden bg-muted">
                            <ImageWithFallback
                              src={avatarUrl}
                              alt={barber.name}
                              fill
                              sizes="(max-width: 768px) 100vw, 33vw"
                              className="object-cover transition-transform duration-500 group-hover:scale-105"
                              fallbackClassName="h-full w-full"
                              iconClassName="h-12 w-12"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                            {isSelected && (
                              <div className="absolute top-3 right-3 bg-primary text-primary-foreground h-8 w-8 rounded-full flex items-center justify-center shadow-lg">
                                <Check className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div className="p-5">
                            <h3 className="font-semibold text-base text-foreground">{barber.name}</h3>
                            {barber.bio && (
                              <p className="text-xs text-muted-foreground mt-2 line-clamp-3">
                                {barber.bio}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
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
                    {availableDates.map(({ date, hasFreeSlot }) => (
                      <button
                        key={date.toISOString()}
                        onClick={() => hasFreeSlot && handleDateSelect(date)}
                        disabled={!hasFreeSlot}
                        aria-disabled={!hasFreeSlot}
                        className={cn(
                          "relative flex-shrink-0 flex min-h-11 min-w-[80px] flex-col items-center rounded-lg border p-3 transition-colors",
                          !hasFreeSlot && "opacity-40 cursor-not-allowed bg-muted",
                          hasFreeSlot && selectedDate?.toDateString() === date.toDateString()
                            ? "border-primary bg-primary/10 text-primary"
                            : hasFreeSlot && "border-border hover:border-primary/50"
                        )}
                      >
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {format(date, "EEE", { locale: es })}
                        </span>
                        <span className="text-xl font-bold">{format(date, "d")}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(date, "MMM", { locale: es })}
                        </span>
                        {!hasFreeSlot && (
                          <span className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-destructive">
                            Completo
                          </span>
                        )}
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
                    {isLoadingSlots ? (
                      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                        {[...Array(12)].map((_, i) => (
                          <div key={i} className="h-9 bg-muted/40 rounded-lg animate-pulse" />
                        ))}
                      </div>
                    ) : hasAnyTimeSlot ? (
                      <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                        {timeSlots.map((time) => {
                          const available = isSlotAvailable(time);
                          return (
                            <button
                              key={time}
                              disabled={!available}
                              onClick={() => setSelectedTime(time)}
                              className={cn(
                                "min-h-11 rounded-lg border p-2.5 text-center text-sm transition-colors",
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
                    ) : (
                      <div className="text-center py-10 px-4 rounded-xl border border-border bg-card/25">
                        <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                        <p className="font-semibold text-foreground/80 text-sm">
                          No quedan horarios este día para este servicio
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 mb-4">
                          Probá con otro día o elegí otro barbero.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedDate(null);
                            setSelectedTime(null);
                            setCurrentStep(3);
                            scrollToStepContent();
                          }}
                          className="rounded-full"
                        >
                          Cambiar barbero
                        </Button>
                      </div>
                    )}
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
                <Card className="overflow-hidden border border-border bg-card/50 backdrop-blur-sm">
                  <CardHeader className="bg-gradient-to-r from-card to-background border-b border-border">
                    <CardTitle className="text-lg">Resumen de tu turno</CardTitle>
                    <CardDescription className="text-xs">Verificá que todo esté correcto antes de confirmar</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 p-6">
                    <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                      <span className="text-muted-foreground">Sucursal</span>
                      <span className="font-medium text-foreground">{selectedBranch?.name}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                      <span className="text-muted-foreground">Servicio</span>
                      <span className="font-medium text-foreground">{selectedService?.name}</span>
                    </div>
                    {selectedStyle && (
                      <div className="flex justify-between py-2 border-b border-border/50 text-sm items-center">
                        <span className="text-muted-foreground">Referencia de Estilo</span>
                        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-2 py-1 rounded">
                          <span className="font-bold text-xs text-primary">{selectedStyle.title}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                      <span className="text-muted-foreground">Barbero</span>
                      <span className="font-medium text-foreground">{selectedBarber?.name}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                      <span className="text-muted-foreground">Fecha</span>
                      <span className="font-medium text-foreground">
                        {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                      <span className="text-muted-foreground">Hora</span>
                      <span className="font-medium text-foreground">
                        {selectedTime} - {selectedService && calculateEndTime(selectedTime!, selectedService.duration_minutes)}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50 text-sm">
                      <span className="text-muted-foreground">Duración</span>
                      <span className="font-medium text-foreground">{selectedService?.duration_minutes} minutos</span>
                    </div>
                    <div className="flex justify-between py-4 text-base">
                      <span className="font-bold text-foreground">Total a pagar en local</span>
                      <span className="font-bold text-primary text-lg">
                        {selectedService && formatPrice(selectedService.price)}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Toggle de Suscripción Recurrente */}
                {features.suscripciones && (
                  <div className="mt-6 p-5 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 backdrop-blur-md">
                    <div className="flex items-start gap-4 justify-between">
                      <div className="space-y-1">
                        <h3 className="font-bold text-sm md:text-base text-foreground flex items-center gap-2">
                          <Repeat className="h-5 w-5 text-primary animate-pulse" />
                          ¿Querés reservar este turno de forma fija semanal?
                        </h3>
                        <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
                          Activá una suscripción para asegurar automáticamente este horario ({selectedTime} todos los {selectedDate && format(selectedDate, "EEEE", { locale: es })}) con {selectedBarber?.name}. Podrás cancelarla en cualquier momento desde tu perfil.
                        </p>
                      </div>
                      <div className="flex items-center pt-1">
                        <input
                          type="checkbox"
                          id="recurring-toggle"
                          checked={isRecurring}
                          onChange={(e) => setIsRecurring(e.target.checked)}
                          className="w-10 h-6 bg-muted checked:bg-primary border-border rounded-full cursor-pointer appearance-none relative before:content-[''] before:absolute before:w-4 before:h-4 before:rounded-full before:bg-muted-foreground before:top-1 before:left-1 checked:before:left-5 checked:before:bg-primary-foreground before:transition-all duration-300"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Navegación */}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between mt-8 border-t border-border pt-6">
              <Button
                variant="outline"
                onClick={prevStep}
                disabled={currentStep === 0}
                className="gap-2 h-11 px-4 text-sm border-border text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Atrás
              </Button>

              {currentStep < STEPS.length - 1 ? (
                <Button onClick={nextStep} disabled={!canProceed()} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-5 text-sm rounded-full">
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold h-11 px-6 rounded-full shadow-lg shadow-primary/10 active:scale-95 transition-all"
                >
                  {isSubmitting ? "Confirmando…" : "Confirmar Reserva"}
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
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-foreground">Cargando...</div>}>
      <ReservarPageContent />
    </Suspense>
  );
}
