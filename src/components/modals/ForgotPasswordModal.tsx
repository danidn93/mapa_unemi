import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ForgotPasswordModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "otp" | "newPassword">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setStep("email"); setEmail(""); setOtp(""); setNewPassword(""); setConfirmPassword("");
    onClose();
  };

  const handleSendOTP = async () => {
    if (!email) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("send_password_reset_otp", { body: { email } });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast({ title: "Código enviado", description: "Revisa tu correo electrónico." });
      setStep("otp");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "No se pudo enviar el código", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "Mínimo 6 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset_password", {
        body: { email, code: otp, new_password: newPassword },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast({ title: "Contraseña actualizada", description: "Ya puedes iniciar sesión." });
      handleClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Código inválido o expirado", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recuperar contraseña</DialogTitle>
          <DialogDescription>
            {step === "email" && "Ingresa tu correo institucional para recibir un código."}
            {step === "otp" && "Ingresa el código de 6 dígitos enviado a tu correo."}
            {step === "newPassword" && "Define tu nueva contraseña."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === "email" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Correo electrónico</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  placeholder="usuario@unemi.edu.ec"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={handleSendOTP} disabled={loading}>
                {loading ? "Enviando..." : "Enviar código"}
              </Button>
            </>
          )}

          {step === "otp" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="otp-reset">Código de verificación</Label>
                <Input
                  id="otp-reset"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-bold"
                />
              </div>
              <Button className="w-full" disabled={otp.length !== 6} onClick={() => setStep("newPassword")}>
                Continuar
              </Button>
            </>
          )}

          {step === "newPassword" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-pwd">Nueva contraseña</Label>
                <Input id="new-pwd" type="password" value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pwd">Confirmar contraseña</Label>
                <Input id="confirm-pwd" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} />
              </div>
              <Button className="w-full" onClick={handleReset} disabled={loading}>
                {loading ? "Actualizando..." : "Cambiar contraseña"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
