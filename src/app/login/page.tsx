"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getClientAuth, isFirebaseClientConfigured } from "@/lib/firebase-client";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { toast } from "sonner";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginForm) {
    if (!isFirebaseClientConfigured()) {
      toast.error(
        "Firebase is not configured on this deployment. Add NEXT_PUBLIC_FIREBASE_* env vars on Vercel and redeploy."
      );
      return;
    }

    setLoading(true);
    try {
      const userCred = await signInWithEmailAndPassword(
        getClientAuth(),
        values.email,
        values.password
      );
      const idToken = await userCred.user.getIdToken();
      await api.post("/api/auth/login", { idToken });
      router.push(next);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      toast.error(msg.replace("Firebase: ", "").replace(/\s*\(.*\)\.?$/, ""));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[360px] space-y-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold tracking-tight">SecondChance</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Proxy &amp; Number Management
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          {!isFirebaseClientConfigured() && (
            <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Firebase env vars are missing on this deployment. Add{" "}
              <code className="font-mono">NEXT_PUBLIC_FIREBASE_*</code> in Vercel
              and redeploy.
            </p>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Access is managed by your administrator.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
