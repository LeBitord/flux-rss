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
import { Plus } from "lucide-react";
import { createCategory } from "./actions";

export function NewCategoryDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        Nouvelle catégorie
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createCategory(formData);
            setOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Nouvelle catégorie</DialogTitle>
            <DialogDescription>
              Un domaine de veille avec son propre webhook Discord.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Nom</Label>
              <Input id="cat-name" name="name" placeholder="finance" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-webhook">Webhook Discord</Label>
              <Input
                id="cat-webhook"
                name="discord_webhook_url"
                placeholder="https://discord.com/api/webhooks/..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-color">Couleur des notifications</Label>
              <div className="flex items-center gap-2">
                <input
                  id="cat-color"
                  name="color"
                  type="color"
                  defaultValue="#5865F2"
                  className="h-8 w-12 rounded border border-border bg-transparent p-0.5"
                />
                <span className="text-xs text-muted-foreground">
                  Couleur de la barre latérale des messages Discord.
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-relevance">Ce qui compte pour vous ici (facultatif)</Label>
              <Textarea
                id="cat-relevance"
                name="relevance_context"
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
            <Button type="submit">Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
