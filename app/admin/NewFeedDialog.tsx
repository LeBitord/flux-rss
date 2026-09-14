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
import { Plus } from "lucide-react";
import { createFeed } from "./actions";

export function NewFeedDialog({ categoryId }: { categoryId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="size-4" />
        Ajouter un flux
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createFeed(formData);
            setOpen(false);
          }}
        >
          <input type="hidden" name="category_id" value={categoryId} />
          <DialogHeader>
            <DialogTitle>Nouveau flux RSS</DialogTitle>
            <DialogDescription>Ajouté à cette catégorie.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="feed-name">Nom</Label>
              <Input id="feed-name" name="name" placeholder="TechCrunch" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feed-url">URL du flux</Label>
              <Input
                id="feed-url"
                name="url"
                placeholder="https://techcrunch.com/feed/"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feed-keywords">Mots-clés (facultatif)</Label>
              <Input
                id="feed-keywords"
                name="keywords"
                placeholder="intelligence artificielle, IA, GPU"
              />
              <p className="text-xs text-muted-foreground">
                Séparés par des virgules. Seuls les articles contenant au moins un de ces mots
                (titre ou résumé) seront notifiés. Laisser vide pour tout recevoir.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feed-stock-ticker">Ticker boursier (facultatif)</Label>
              <Input id="feed-stock-ticker" name="stock_ticker" placeholder="AI.PA" />
              <p className="text-xs text-muted-foreground">
                Symbole Alpha Vantage (ex. AI.PA pour Air Liquide à Paris). Ajoute le cours du
                jour au digest de cette catégorie.
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
