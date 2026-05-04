import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  email: string;
  onClose: () => void;
  onVerified: () => void;
}

export function VerifyOtpModal({ open, email, onClose, onVerified }: Props) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("verify_signup_otp", {
        body: { email, code },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast({ title: "Cuenta verificada", description: "Ya puedes iniciar sesión." });
      onVerified();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verifica tu cuenta</DialogTitle>
          <DialogDescription>Ingresa el código de 6 dígitos que enviamos a <b>{email}</b>.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="otp-verify">Código</Label>
            <Input
              id="otp-verify"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              className="text-center text-2xl tracking-[0.5em] font-bold"
              placeholder="000000"
            />
          </div>
          <Button className="w-full" onClick={submit} disabled={code.length !== 6 || loading}>
            {loading ? "Verificando..." : "Verificar código"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
