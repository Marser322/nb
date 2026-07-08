"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Scissors, Sparkles, Calendar, MapPin, DollarSign, ArrowRight, Wallet, Settings, Package, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePathname } from "next/navigation";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type ServiceItem = {
  id: string;
  name: string;
  price: number;
  duration: number;
  desc: string;
};

type BranchItem = {
  id: number;
  name: string;
  address: string;
  phone: string;
  hours: string;
};

type StyleItem = {
  id: string;
  name: string;
  serviceId: string;
  tags: string[];
};

type ProductItem = {
  name: string;
  price: number;
  desc: string;
};

type MessageData =
  | { type: "services"; items?: ServiceItem[] }
  | { type: "branches"; items?: BranchItem[] }
  | { type: "styles"; items?: StyleItem[] }
  | { type: "products"; items?: ProductItem[] }
  | { type: "action"; label?: string; url?: string };

type ChatResponse = {
  content: string;
  data?: MessageData;
};

interface Message {
  role: "user" | "assistant";
  content: string;
  data?: MessageData;
}

interface AiAssistantProps {
  mode?: 'client' | 'admin';
}

export function AiAssistant({ mode: propMode }: AiAssistantProps) {
  const pathname = usePathname();
  const { features } = useFeatures();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Determine mode and visibility
  const isAdminRoute = pathname.startsWith('/admin') && !pathname.startsWith('/admin-login');
  const isClientRoute = pathname === '/' || 
    pathname.startsWith('/reservar') || 
    pathname.startsWith('/tienda') || 
    pathname.startsWith('/lookbook') || 
    pathname.startsWith('/contacto') || 
    pathname.startsWith('/checkout') || 
    pathname.startsWith('/mi-cuenta');

  const resolvedMode = propMode || (isAdminRoute ? 'admin' : 'client');
  const shouldRender = propMode ? true : (isAdminRoute || isClientRoute);

  // Dynamic session key and greetings
  const sessionKey = resolvedMode === 'admin' ? "nb-chat-messages-admin" : "nb-chat-messages-client";
  const clientGreeting = "¡Hola! Soy tu **Asesor de Estilo** de New Brothers. Estoy aquí para recomendarte cortes, darte información de servicios, precios, sucursales y ayudarte a reservar tu turno. ¿En qué te puedo asesorar hoy?";
  const adminGreeting = "¡Hola, Administrador! Soy tu Coach de Gestión de New Brothers. Estoy aquí para guiarte en el uso del CRM, resolver tus dudas operativas (caja, liquidaciones, stock, clientes) y ayudarte a optimizar el negocio. ¿En qué módulo puedo asistirte hoy?";
  const defaultGreeting = resolvedMode === 'admin' ? adminGreeting : clientGreeting;

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: defaultGreeting,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollMessagesToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "nearest" });
  }, []);

  // Detectar sesión iniciada (solo relevante en modo cliente, para el quick reply "Mi próximo turno")
  useEffect(() => {
    if (resolvedMode === 'admin') return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setIsLoggedIn(!!user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, [resolvedMode]);

  // Dynamic quick actions
  const getQuickActions = () => {
    if (resolvedMode === 'admin') {
      return [
        { label: "Cómo cobro una cita", icon: DollarSign },
        { label: "Cómo liquido a un barbero", icon: Wallet },
        { label: "Cómo controlo el stock", icon: Package },
        { label: "Gestionar configuraciones", icon: Settings },
      ];
    } else {
      const actions = [
        { label: "Recomendame un corte", icon: Scissors },
        { label: "Ver Precios", icon: DollarSign },
        { label: "Sucursales", icon: MapPin },
      ];
      if (features.reservas_online) {
        actions.push({ label: "¿Hay lugar mañana?", icon: Calendar });
        actions.push({ label: "Reservar Turno", icon: Calendar });
      }
      if (isLoggedIn) {
        actions.push({ label: "Mi próximo turno", icon: Clock });
      }
      return actions;
    }
  };

  const quickActions = getQuickActions();

  // Load chat messages from sessionStorage when mode/sessionKey changes
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(sessionKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
      // Fallback to default greeting
      setMessages([
        {
          role: "assistant",
          content: defaultGreeting,
        },
      ]);
    } catch (e) {
      console.error("Error loading chat messages from sessionStorage:", e);
    }
  }, [sessionKey, defaultGreeting]);

  // Save chat messages to sessionStorage on update
  useEffect(() => {
    const isInitialGreeting = messages.length === 1 && messages[0].content === defaultGreeting;
    if (messages.length > 1 || (messages.length === 1 && !isInitialGreeting)) {
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify(messages));
      } catch (e) {
        console.error("Error saving chat messages to sessionStorage:", e);
      }
    }
  }, [messages, sessionKey, defaultGreeting]);

  useEffect(() => {
    scrollMessagesToEnd();
  }, [messages, isOpen, scrollMessagesToEnd]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: resolvedMode,
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch");

      const data = (await response.json()) as ChatResponse;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.content,
          data: data.data,
        },
      ]);
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Disculpame, tuvimos un pequeño inconveniente técnico al conectar con mi barbería mental. Por favor, reintentá tu pregunta.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!shouldRender) return null;

  return (
    <>
      {/* Floating Action Button - Positioned bottom-left to avoid colliding with HelpFab (bottom-right) */}
      <div
        className="fixed left-4 z-50 sm:left-6"
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          onClick={() => setIsOpen(!isOpen)}
          size="icon"
          aria-label={isOpen ? "Cerrar asistente" : "Abrir asistente"}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black shadow-xl shadow-amber-500/20 transition-all hover:scale-110 active:scale-95"
        >
          {isOpen ? <X className="h-6 w-6 animate-in spin-in duration-300" aria-hidden="true" /> : <MessageSquare className="h-6 w-6 animate-in zoom-in duration-300" aria-hidden="true" />}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 items-center justify-center text-[10px] font-bold text-black">
              {resolvedMode === 'admin' ? 'CRM' : 'AI'}
            </span>
          </span>
        </Button>
      </div>

      {/* Chat Drawer/Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="fixed left-3 right-3 sm:left-6 sm:right-auto z-50 w-auto sm:w-[400px] h-[70dvh] max-h-[calc(100dvh-8rem)] sm:max-h-[600px] rounded-3xl border border-border bg-card/95 backdrop-blur-2xl shadow-2xl overflow-hidden overscroll-contain flex flex-col"
            style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}
          >
            {/* Header */}
            <div className="p-4 border-b border-border bg-gradient-to-r from-card to-background flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">
                    {resolvedMode === 'admin' ? "Coach de Gestión New Brothers" : "Asesor de Estilo New Brothers"}
                  </h3>
                  <span className="text-[10px] text-primary font-mono tracking-widest uppercase">
                    {resolvedMode === 'admin' ? "Soporte CRM" : "Inteligencia Artificial"}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar asistente"
                className="h-10 w-10 md:h-8 md:w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Quick Actions / Suggestions */}
            <div className="px-4 py-3 border-b border-border/50 bg-muted/30 flex gap-2 overflow-x-auto overscroll-contain scrollbar-none shrink-0">
              {quickActions.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  onClick={() => handleSendMessage(action.label)}
                  className="rounded-full h-10 md:h-8 px-3 text-xs bg-card border-border text-muted-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all flex items-center gap-1.5 shrink-0"
                >
                  <action.icon className="h-3 w-3" aria-hidden="true" />
                  {action.label}
                </Button>
              ))}
            </div>

            {/* Message History */}
            <div className="flex-grow overflow-y-auto overscroll-contain p-4 space-y-4 min-h-0">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground font-medium rounded-tr-none shadow-lg shadow-primary/10"
                        : "bg-muted border border-border text-foreground rounded-tl-none"
                    }`}
                  >
                    {/* Render message text with simple markdown-like bold parsing */}
                    <p className="whitespace-pre-line text-sm">
                      {msg.content.split("**").map((part, idx) =>
                        idx % 2 === 1 ? <strong key={idx} className="font-bold text-foreground">{part}</strong> : part
                      )}
                    </p>

                    {/* Rich UI Components based on response payload */}
                    {msg.data && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        {/* Services List Card */}
                        {msg.data.type === "services" && msg.data.items && (
                          <div className="space-y-1.5">
                            {msg.data.items.map((service) => (
                              <Link
                                key={service.id}
                                href={`/reservar?serviceId=${service.id}`}
                                className="flex justify-between items-center bg-card p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-all text-xs group"
                              >
                                <div>
                                  <p className="font-bold text-foreground group-hover:text-primary transition-colors">{service.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{service.duration} min</p>
                                </div>
                                <div className="flex items-center gap-1.5 font-mono">
                                  <span className="font-bold text-foreground">${service.price}</span>
                                  <ArrowRight className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}

                        {/* Styles Lookbook Suggestions Card */}
                        {msg.data.type === "styles" && msg.data.items && (
                          <div className="grid grid-cols-2 gap-2">
                            {msg.data.items.map((style) => (
                              <Link
                                key={style.id}
                                href={`/reservar?styleId=${style.id}&serviceId=${style.serviceId}`}
                                className="bg-card p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-all text-left text-xs block group"
                              >
                                <p className="font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">{style.name}</p>
                                <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                                  Reservar <ArrowRight className="h-2.5 w-2.5 group-hover:translate-x-1 transition-transform" />
                                </p>
                              </Link>
                            ))}
                          </div>
                        )}

                        {/* Products Card */}
                        {msg.data.type === "products" && msg.data.items && (
                          <div className="space-y-1.5">
                            {msg.data.items.map((prod, idx) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center bg-card p-2 rounded-lg border border-border text-xs"
                              >
                                <div>
                                  <p className="font-bold text-foreground">{prod.name}</p>
                                  <p className="text-[10px] text-muted-foreground line-clamp-1">{prod.desc}</p>
                                </div>
                                <span className="font-mono font-bold text-primary shrink-0 ml-2">${prod.price}</span>
                              </div>
                            ))}
                            <Button asChild size="sm" className="w-full text-xs h-8 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground mt-1">
                              <Link href="/tienda">Ver Tienda Completa</Link>
                            </Button>
                          </div>
                        )}

                        {/* General Actions (Redirect to booking page, etc.) */}
                        {msg.data.type === "action" && msg.data.label && msg.data.url && (
                          <Button asChild className="w-full text-xs h-9 rounded-lg bg-primary hover:bg-primary/95 text-primary-foreground">
                            <Link href={msg.data.url}>
                              {msg.data.label}
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted border border-border rounded-2xl rounded-tl-none p-3.5 text-sm text-muted-foreground flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce" />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce delay-150" />
                      <span className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce delay-300" />
                    </span>
                    <span>
                      {resolvedMode === 'admin' ? "Analizando CRM…" : "Analizando estilo…"}
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(input);
              }}
              className="p-4 border-t border-border bg-card flex gap-2 items-center shrink-0"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => window.setTimeout(() => scrollMessagesToEnd("auto"), 250)}
                placeholder={resolvedMode === 'admin' ? "Preguntame cómo cobrar, liquidar, stock…" : "Preguntame sobre cortes, precios o reservá…"}
                disabled={isLoading}
                autoComplete="off"
                className="bg-background border-border text-foreground rounded-full focus-visible:ring-primary h-11 px-4 flex-grow placeholder:text-muted-foreground text-base md:text-sm"
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                size="icon"
                aria-label="Enviar mensaje"
                className="h-11 w-11 md:h-10 md:w-10 rounded-full bg-primary hover:bg-primary/95 text-primary-foreground shrink-0 transition-transform active:scale-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
