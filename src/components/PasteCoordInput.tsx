import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClipboardPaste, Plus } from "lucide-react";
import { parseGoogleMapsCoord } from "@/lib/parseCoord";
import { toast } from "@/hooks/use-toast";

interface Props {
  /** Texto del botón. Por defecto "Añadir punto". */
  buttonLabel?: string;
  /** Se llama cuando el usuario añade unas coordenadas válidas. */
  onAdd: (lat: number, lng: number) => void;
  /** Si true, también ofrece un botón para leer del portapapeles (1 clic). */
  enablePasteButton?: boolean;
  placeholder?: string;
}

/**
 * Input para pegar coordenadas desde Google Maps.
 * En Google Maps: clic derecho sobre el punto → la primera opción copia
 * "lat, lng" al portapapeles. También acepta URLs completas y "lat lng".
 */
export function PasteCoordInput({
  buttonLabel = "Añadir punto",
  onAdd,
  enablePasteButton = true,
  placeholder = "-2.150900, -79.601100",
}: Props) {
  const [text, setText] = useState("");

  const handleAdd = (raw: string) => {
    const parsed = parseGoogleMapsCoord(raw);
    if (!parsed) {
      toast({
        title: "Coordenadas no válidas",
        description: "Pega un par lat,lng (ej: -2.150900, -79.601100) o una URL de Google Maps.",
        variant: "destructive",
      });
      return;
    }
    onAdd(parsed.lat, parsed.lng);
    setText("");
  };

  const handlePasteClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      handleAdd(t);
    } catch {
      toast({
        title: "No se pudo leer el portapapeles",
        description: "Pégalo manualmente en el campo.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(text); } }}
        className="text-xs"
      />
      {enablePasteButton && (
        <Button
          type="button"
          size="icon"
          variant="outline"
          onClick={handlePasteClipboard}
          title="Pegar desde el portapapeles"
        >
          <ClipboardPaste className="h-4 w-4" />
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        onClick={() => handleAdd(text)}
        disabled={!text.trim()}
        title={buttonLabel}
      >
        <Plus className="h-4 w-4 mr-1" /> {buttonLabel}
      </Button>
    </div>
  );
}
