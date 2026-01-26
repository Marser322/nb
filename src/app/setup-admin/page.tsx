"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";

export default function SetupAdminPage() {
    const [status, setStatus] = useState("Idle");
    const supabase = createClient();

    const createAdmin = async () => {
        setStatus("Creating user...");
        const email = "admin@nbbarber.com";
        const password = "admin123";

        // 1. Sign Up
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            setStatus("Error signing up: " + error.message);
            // If user already exists, try to sign in
            if (error.message.includes("User already registered") || error.code === "user_already_exists") {
                setStatus("User exists. Signing in...");
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                if (signInError) {
                    setStatus("Error signing in: " + signInError.message);
                } else {
                    setStatus("Done: User signed in.");
                }
            }
        } else {
            setStatus("User created. Checking session...");
            if (data.session) {
                setStatus("Done: User created and signed in.");
            } else {
                setStatus("Done: User created (Check email for confirmation if required).");
            }
        }
    };

    return (
        <div style={{ padding: 50 }}>
            <h1>Setup Admin User</h1>
            <p>Status: <span id="status">{status}</span></p>
            <button id="create-btn" onClick={createAdmin} style={{ padding: "10px 20px", fontSize: 20 }}>
                Create Admin
            </button>
        </div>
    );
}
