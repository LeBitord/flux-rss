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
import { LineChart } from "lucide-react";
import { createPosition } from "./actions";

export function NewPositionDialog({ categoryId }: { categoryId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <LineChart className="size-4" />
        Suivre une action / ETF
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createPosition(formData);
            setOpen(false);
          }}
        >
          <input type="hidden" name="category_id" value={categoryId} />
          <DialogHeader>
            <DialogTitle>Nouvelle position</DialogTitle>
            <DialogDescription>
              Cours ajouté au digest quotidien de cette catégorie, et disponible via /cours.
              Ajoute ensuite tes achats via le bouton dédié pour suivre parts et PRU.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="position-label">Libellé</Label>
              <Input id="position-label" name="label" placeholder="Air Liquide" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="position-ticker">Ticker</Label>
              <Input id="position-ticker" name="ticker" placeholder="AI.PA" required />
              <p className="text-xs text-muted-foreground">
                Symbole Alpha Vantage (ex. AI.PA pour Air Liquide, DCAM.PAR pour un ETF Euronext
                Paris).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit">Ajouter</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
