"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, Upload } from "lucide-react";
import { importOpml, type OpmlImportResult } from "./actions";

const SELECT_CLASS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function OpmlDialog({ categories }: { categories: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<OpmlImportResult | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setResult(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Upload className="size-4" />
        OPML
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importer / exporter (OPML)</DialogTitle>
          <DialogDescription>
            Format standard des lecteurs RSS (Feedly, Inoreader, NetNewsWire…). Les flux rangés
            dans un dossier du même nom qu&apos;une catégorie y sont placés, les autres vont dans
            la catégorie choisie. Les URLs déjà suivies sont ignorées.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4 py-2"
          action={async (formData) => setResult(await importOpml(formData))}
        >
          <div className="space-y-2">
            <Label htmlFor="opml-file">Fichier</Label>
            <Input id="opml-file" name="file" type="file" accept=".opml,.xml,text/xml" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="opml-category">Catégorie par défaut</Label>
            <select id="opml-category" name="category_id" className={SELECT_CLASS} required>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={categories.length === 0}>
            Importer
          </Button>
        </form>

        {result && (
          <div className="text-sm space-y-1">
            {result.error ? (
              <p className="text-destructive">{result.error}</p>
            ) : (
              <>
                <p>
                  {result.imported} flux ajouté{result.imported === 1 ? "" : "s"}
                  {result.alreadyThere ? ` · ${result.alreadyThere} déjà suivi(s)` : ""}
                </p>
                {result.rejected && result.rejected.length > 0 && (
                  <p className="text-muted-foreground text-xs">
                    Refusés (URL invalide ou privée) : {result.rejected.join(", ")}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href="/admin/opml" download />}
          >
            <Download className="size-4" />
            Exporter tous les flux
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
