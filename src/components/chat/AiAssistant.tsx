"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Scissors, Sparkles, Calendar, MapPin, DollarSign, ArrowRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import Image from "next/image";

interface Message {
  role: "user" | "assistant";
  content: string;
  data?: {
    type: "services" | "branches" | "styles" | "products" | "action";
    items?: any[];
    label?: string;
    url?: string;
  };
}

const QUICK_ACTIONS = [
  { label: "Recomendame un corte", icon: Scissors },
  { label: "Ver Precios", icon: DollarSign },
  { label: "Sucursales", icon: MapPin },
  { label: "Reservar Turno", icon: Calendar },
];

export function AiAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "¡Hola! Soy tu **Asesor de Estilo** de New Brothers. Estoy aquí para recomendarte cortes, darte información de servicios, precios, sucursales y ayudarte a reservar tu turno. ¿En qué te puedo asesorar hoy?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

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
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch");

      const data = await response.json();
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

  return (
    <>
      {/* Floating Action Button - Positioned bottom-left to avoid colliding with HelpFab (bottom-right) */}
      <div className="fixed bottom-6 left-6 z-50">
        <Button
          onClick={() => setIsOpen(!isOpen)}
          size="icon"
          className="h-14 w-14 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black shadow-xl shadow-amber-500/20 transition-all hover:scale-110 active:scale-95"
        >
          {isOpen ? <X className="h-6 w-6 animate-in spin-in duration-300" /> : <MessageSquare className="h-6 w-6 animate-in zoom-in duration-300" />}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 items-center justify-center text-[10px] font-bold text-black">AI</span>
          </span>
        </Button>
      </div>

      {/* Chat Drawer/Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: -50, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -50, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-24 left-6 z-50 w-[90vw] sm:w-[400px] h-[70vh] max-h-[600px] rounded-3xl border border-white/10 bg-zinc-950/90 backdrop-blur-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-zinc-900 to-zinc-950 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Asesor de Estilo New Brothers</h3>
                  <span className="text-[10px] text-amber-500 font-mono tracking-widest uppercase">Inteligencia Artificial</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-full text-zinc-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Quick Actions / Suggestions */}
            <div className="px-4 py-3 border-b border-white/5 bg-zinc-900/30 flex gap-2 overflow-x-auto scrollbar-none shrink-0">
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  onClick={() => handleSendMessage(action.label)}
                  className="rounded-full h-8 px-3 text-xs bg-white/5 border-white/10 text-zinc-300 hover:bg-amber-500 hover:border-amber-500 hover:text-black transition-all flex items-center gap-1.5 shrink-0"
                >
                  <action.icon className="h-3 w-3" />
                  {action.label}
                </Button>
              ))}
            </div>

            {/* Message History */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-amber-500 text-black font-medium rounded-tr-none shadow-lg shadow-amber-500/10"
                        : "bg-white/5 border border-white/10 text-zinc-200 rounded-tl-none"
                    }`}
                  >
                    {/* Render message text with simple markdown-like bold parsing */}
                    <p className="whitespace-pre-line">
                      {msg.content.split("**").map((part, idx) =>
                        idx % 2 === 1 ? <strong key={idx} className="font-bold text-white">{part}</strong> : part
                      )}
                    </p>

                    {/* Rich UI Components based on response payload */}
                    {msg.data && (
                      <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                        {/* Services List Card */}
                        {msg.data.type === "services" && msg.data.items && (
                          <div className="space-y-1.5">
                            {msg.data.items.map((service: any) => (
                              <Link
                                key={service.id}
                                href={`/reservar?serviceId=${service.id}`}
                                className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5 hover:border-amber-500/50 hover:bg-white/10 transition-all text-xs group"
                              >
                                <div>
                                  <p className="font-bold text-white group-hover:text-amber-400 transition-colors">{service.name}</p>
                                  <p className="text-[10px] text-zinc-400">{service.duration} min</p>
                                </div>
                                <div className="flex items-center gap-1.5 font-mono">
                                  <span className="font-bold text-white">${service.price}</span>
                                  <ArrowRight className="h-3 w-3 text-amber-500 opacity-0 group-hover:opacity-100 transition-all" />
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}

                        {/* Styles Lookbook Suggestions Card */}
                        {msg.data.type === "styles" && msg.data.items && (
                          <div className="grid grid-cols-2 gap-2">
                            {msg.data.items.map((style: any) => (
                              <Link
                                key={style.id}
                                href={`/reservar?styleId=${style.id}&serviceId=${style.serviceId}`}
                                className="bg-white/5 p-2 rounded-lg border border-white/5 hover:border-amber-500/50 hover:bg-white/10 transition-all text-left text-xs block group"
                              >
                                <p className="font-bold text-white line-clamp-1 group-hover:text-amber-400 transition-colors">{style.name}</p>
                                <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                                  Reservar <ArrowRight className="h-2.5 w-2.5 group-hover:translate-x-1 transition-transform" />
                                </p>
                              </Link>
                            ))}
                          </div>
                        )}

                        {/* Products Card */}
                        {msg.data.type === "products" && msg.data.items && (
                          <div className="space-y-1.5">
                            {msg.data.items.map((prod: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex justify-between items-center bg-white/5 p-2 rounded-lg border border-white/5 text-xs"
                              >
                                <div>
                                  <p className="font-bold text-white">{prod.name}</p>
                                  <p className="text-[10px] text-zinc-400 line-clamp-1">{prod.desc}</p>
                                </div>
                                <span className="font-mono font-bold text-amber-400 shrink-0 ml-2">${prod.price}</span>
                              </div>
                            ))}
                            <Button asChild size="sm" className="w-full text-xs h-8 rounded-lg bg-amber-500 hover:bg-amber-600 text-black mt-1">
                              <Link href="/tienda">Ver Tienda Completa</Link>
                            </Button>
                          </div>
                        )}

                        {/* General Actions (Redirect to booking page, etc.) */}
                        {msg.data.type === "action" && msg.data.label && msg.data.url && (
                          <Button asChild className="w-full text-xs h-9 rounded-lg bg-amber-500 hover:bg-amber-600 text-black">
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
                  <div className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-none p-3.5 text-sm text-zinc-400 flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce" />
                      <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce delay-150" />
                      <span className="h-2 w-2 rounded-full bg-zinc-500 animate-bounce delay-300" />
                    </span>
                    <span>Analizando estilo...</span>
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
              className="p-4 border-t border-white/10 bg-zinc-950 flex gap-2 items-center shrink-0"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Preguntame sobre cortes, precios o reservá..."
                disabled={isLoading}
                className="bg-white/5 border-white/10 text-white rounded-full focus-visible:ring-amber-500 h-10 px-4 flex-grow placeholder:text-zinc-500"
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                size="icon"
                className="h-10 w-10 rounded-full bg-amber-500 hover:bg-amber-600 text-black shrink-0 transition-transform active:scale-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
