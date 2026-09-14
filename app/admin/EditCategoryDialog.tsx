"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { Category } from "@/lib/types";
import { updateCategory } from "./actions";

export function EditCategoryDialog({ category }: { category: Category }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground shrink-0"
          />
        }
      >
        <Pencil className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await updateCategory(formData);
            setOpen(false);
          }}
        >
          <input type="hidden" name="id" value={category.id} />
          <DialogHeader>
            <DialogTitle>Modifier {category.name}</DialogTitle>
            <DialogDescription>Nom, webhook et couleur des notifications.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`edit-cat-name-${category.id}`}>Nom</Label>
              <Input
                id={`edit-cat-name-${category.id}`}
                name="name"
                defaultValue={category.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-cat-webhook-${category.id}`}>Webhook Discord</Label>
              <Input
                id={`edit-cat-webhook-${category.id}`}
                name="discord_webhook_url"
                defaultValue={category.discord_webhook_url}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-cat-color-${category.id}`}>Couleur des notifications</Label>
              <input
                id={`edit-cat-color-${category.id}`}
                name="color"
                type="color"
                defaultValue={category.color}
                className="h-8 w-12 rounded border border-border bg-transparent p-0.5"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-cat-relevance-${category.id}`}>
                Ce qui compte pour vous ici (facultatif)
              </Label>
              <Textarea
                id={`edit-cat-relevance-${category.id}`}
                name="relevance_context"
                defaultValue={category.relevance_context ?? ""}
                placeholder="Ex : je détiens cette action, je veux surtout les résultats et l'export"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Utilisé par le score de pertinence IA pour juger ce qui compte vraiment pour
                vous, pas juste l&apos;importance générique du sujet.
              </p>
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
