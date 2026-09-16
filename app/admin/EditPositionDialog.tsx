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
import { Pencil } from "lucide-react";
import type { StockPosition } from "@/lib/types";
import { updatePosition } from "./actions";

export function EditPositionDialog({ position }: { position: StockPosition }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await updatePosition(formData);
            setOpen(false);
          }}
        >
          <input type="hidden" name="id" value={position.id} />
          <DialogHeader>
            <DialogTitle>Modifier {position.label}</DialogTitle>
            <DialogDescription>Libellé et ticker.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`edit-position-label-${position.id}`}>Libellé</Label>
              <Input
                id={`edit-position-label-${position.id}`}
                name="label"
                defaultValue={position.label}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-position-ticker-${position.id}`}>Ticker</Label>
              <Input
                id={`edit-position-ticker-${position.id}`}
                name="ticker"
                defaultValue={position.ticker}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-position-shares-${position.id}`}>
                Nombre de parts (facultatif)
              </Label>
              <Input
                id={`edit-position-shares-${position.id}`}
                name="shares"
                type="number"
                min="0"
                step="any"
                defaultValue={position.shares ?? ""}
                placeholder="10"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit">Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
