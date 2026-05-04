import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { VerifyOtpModal } from "./VerifyOtpModal";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FACULTIES = [
  "Ciencias Sociales, Educación Comercial y Derecho",
  "Ciencias de la Ingeniería",
  "Ciencias de la Salud y Ambiente",
  "Ciencias de la Educación",
  "Posgrado",
];

type DocType = "cedula" | "pasaporte";
type UserType = "estudiante" | "docente" | "administrativo";

export function SignUpModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [form, setForm] = useState({
    doc_type: "cedula" as DocType,
    cedula: "",
    user_type: "estudiante" as UserType,
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    faculty: "",
    career: "",
    semester: "",
  });

  const update = (field: string, value: string) => setForm((p) => ({ ...p, [field]: value }));

  const validateDoc = () => {
    if (form.doc_type === "cedula") {
      if (!/^\d{10}$/.test(form.cedula)) return "La cédula debe tener 10 dígitos";
    } else if (form.cedula.length < 6 || form.cedula.length > 15) {
      return "Pasaporte inválido (6-15 caracteres)";
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!form.email || !form.first_name || !form.last_name || !form.cedula) {
      toast({ title: "Error", description: "Completa los campos obligatorios", variant: "destructive" });
      return;
    }
    const docErr = validateDoc();
    if (docErr) {
      toast({ title: "Error", description: docErr, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("signup_user", {
        body: {
          email: form.email,
          password: form.cedula,
          first_name: form.first_name,
          last_name: form.last_name,
          doc_type: form.doc_type,
          cedula: form.cedula,
          user_type: form.user_type,
          phone: form.phone || undefined,
          faculty: form.user_type === "estudiante" ? form.faculty || undefined : undefined,
          career: form.user_type === "estudiante" ? form.career || undefined : undefined,
          semester: form.user_type === "estudiante" ? form.semester || undefined : undefined,
        },
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast({ title: "Cuenta creada", description: "Te enviamos un código de verificación a tu correo." });
      setShowOtp(true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = () => {
    setShowOtp(false);
    onClose();
    setForm({
      doc_type: "cedula", cedula: "", user_type: "estudiante", email: "",
      first_name: "", last_name: "", phone: "", faculty: "", career: "", semester: "",
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear cuenta</DialogTitle>
            <DialogDescription>
              Tu contraseña inicial será tu número de documento. Recibirás un código por correo para activar tu cuenta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de usuario *</Label>
              <Select value={form.user_type} onValueChange={(v) => update("user_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="estudiante">Estudiante</SelectItem>
                  <SelectItem value="docente">Docente</SelectItem>
                  <SelectItem value="administrativo">Administrativo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de documento *</Label>
              <RadioGroup value={form.doc_type} onValueChange={(v) => update("doc_type", v)} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="cedula" id="doc-cedula" />
                  <Label htmlFor="doc-cedula" className="cursor-pointer">Cédula</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="pasaporte" id="doc-pasaporte" />
                  <Label htmlFor="doc-pasaporte" className="cursor-pointer">Pasaporte</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cedula">
                {form.doc_type === "cedula" ? "Cédula" : "Pasaporte"} * (será tu contraseña)
              </Label>
              <Input
                id="cedula"
                value={form.cedula}
                onChange={(e) => update("cedula", e.target.value)}
                maxLength={form.doc_type === "cedula" ? 10 : 15}
                placeholder={form.doc_type === "cedula" ? "0102030405" : "AB123456"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">Nombres *</Label>
                <Input id="first_name" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Apellidos *</Label>
                <Input id="last_name" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-email">Correo institucional *</Label>
              <Input
                id="signup-email"
                type="email"
                placeholder="usuario@unemi.edu.ec"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
            </div>

            {form.user_type === "estudiante" && (
              <>
                <div className="space-y-2">
                  <Label>Facultad</Label>
                  <Select value={form.faculty} onValueChange={(v) => update("faculty", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecciona una facultad" /></SelectTrigger>
                    <SelectContent>
                      {FACULTIES.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="career">Carrera</Label>
                    <Input id="career" value={form.career} onChange={(e) => update("career", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="semester">Semestre</Label>
                    <Input
                      id="semester"
                      value={form.semester}
                      onChange={(e) => update("semester", e.target.value)}
                      placeholder="6to"
                    />
                  </div>
                </div>
              </>
            )}

            <Button className="w-full" onClick={handleSubmit} disabled={loading}>
              {loading ? "Registrando..." : "Crear cuenta y enviar código"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <VerifyOtpModal
        open={showOtp}
        email={form.email}
        onClose={() => setShowOtp(false)}
        onVerified={handleVerified}
      />
    </>
  );
}
