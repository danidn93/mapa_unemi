import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/integrations/supabase/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { TigrilloGuide } from "@/components/TigrilloGuide";
import { useToast } from "@/hooks/use-toast";
import { ForgotPasswordModal } from "@/components/modals/ForgotPasswordModal";
import { SignUpModal } from "@/components/modals/SignUpModal";
import { requestPushOnLogin } from "@/lib/push";
import loginBg from "@/assets/login-bg.jpg";

async function routeByRole(userId: string, nav: (p: string) => void) {
  try {
    const { data } = await db.rpc("get_user_effective_role", { _user_id: userId });
    const role = (data as string) ?? "public";
    if (["admin", "operator", "superadmin"].includes(role)) nav("/admin");
    else nav("/");
  } catch {
    nav("/");
  }
}

export default function Auth() {
  const nav = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        requestPushOnLogin().catch(() => {});
        routeByRole(data.session.user.id, nav);
      }
    });
  }, [nav]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Error", description: "Ingresa tu correo y contraseña", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (data.user) {
        requestPushOnLogin().catch(() => {});
        await routeByRole(data.user.id, nav);
      }
    } catch (err: any) {
      toast({
        title: "Error de autenticación",
        description: err.message || "Credenciales incorrectas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${loginBg})` }}
        aria-hidden="true"
      />
      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-background/85 via-background/70 to-primary/40 backdrop-blur-sm" />

      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <div className="mb-8 flex flex-col items-center text-center">
            <TigrilloGuide size={96} />
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">Mapa UNEMI</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sistema de Navegación del Campus Universitario
            </p>
          </div>

          <Card className="border-border/50 shadow-[var(--shadow-elegant)] backdrop-blur-md bg-card/95">
            <CardContent className="pt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo institucional</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@unemi.edu.ec"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11"
                    autoComplete="current-password"
                    minLength={6}
                    required
                  />
                </div>

                <Button type="submit" className="h-11 w-full" disabled={loading}>
                  {loading ? "Ingresando..." : "Iniciar Sesión"}
                </Button>

                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="block w-full text-center text-xs text-muted-foreground transition-colors hover:text-primary"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </form>

              <div className="mt-6 border-t border-border/60 pt-4 text-center">
                <p className="text-sm text-muted-foreground">¿No tienes cuenta?</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => setShowSignUp(true)}
                >
                  Crear cuenta
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <ForgotPasswordModal open={showForgotPassword} onClose={() => setShowForgotPassword(false)} />
      <SignUpModal open={showSignUp} onClose={() => setShowSignUp(false)} />
    </div>
  );
}
