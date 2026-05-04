import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { TigrilloGuide } from "@/components/TigrilloGuide";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const nav = useNavigate();
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Supabase coloca los tokens de recovery en el hash (#access_token=...&type=recovery).
  // El cliente los procesa automáticamente y emite "PASSWORD_RECOVERY".
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Por si ya hay sesión activa al entrar
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast({ title: "Contraseña muy corta", description: "Mínimo 6 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "No coinciden", description: "Las contraseñas no son iguales.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "Contraseña actualizada", description: "Inicia sesión con tu nueva contraseña." });
      await supabase.auth.signOut();
      nav("/auth");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-[var(--gradient-hero)] p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <TigrilloGuide size={88} />
          <h1 className="mt-3 text-2xl font-bold">Restablecer contraseña</h1>
          <p className="text-sm text-muted-foreground">Define una nueva contraseña para tu cuenta.</p>
        </div>
        <Card className="shadow-[var(--shadow-elegant)]">
          <CardContent className="pt-6">
            {!ready ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Validando enlace de recuperación…
                </p>
                <p className="text-xs text-muted-foreground">
                  Si llegaste aquí sin un enlace válido, vuelve a solicitar la recuperación.
                </p>
                <Button variant="outline" className="w-full" onClick={() => nav("/auth")}>
                  Volver a iniciar sesión
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nueva contraseña</Label>
                  <Input
                    id="new-password" type="password" required minLength={6}
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres" autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                  <Input
                    id="confirm-password" type="password" required minLength={6}
                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repite la contraseña" autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={loading}>
                  {loading ? "Guardando…" : "Actualizar contraseña"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
