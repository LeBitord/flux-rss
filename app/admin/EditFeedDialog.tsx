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
import type { Feed } from "@/lib/types";
import { updateFeed } from "./actions";

export function EditFeedDialog({ feed }: { feed: Feed }) {
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
            await updateFeed(formData);
            setOpen(false);
          }}
        >
          <input type="hidden" name="id" value={feed.id} />
          <DialogHeader>
            <DialogTitle>Modifier {feed.name}</DialogTitle>
            <DialogDescription>Nom, URL et filtre par mots-clés.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`edit-feed-name-${feed.id}`}>Nom</Label>
              <Input
                id={`edit-feed-name-${feed.id}`}
                name="name"
                defaultValue={feed.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-feed-url-${feed.id}`}>URL du flux</Label>
              <Input
                id={`edit-feed-url-${feed.id}`}
                name="url"
                defaultValue={feed.url}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-feed-keywords-${feed.id}`}>Mots-clés (facultatif)</Label>
              <Input
                id={`edit-feed-keywords-${feed.id}`}
                name="keywords"
                defaultValue={feed.keywords ?? ""}
                placeholder="intelligence artificielle, IA, GPU"
              />
              <p className="text-xs text-muted-foreground">
                Séparés par des virgules. Laisser vide pour tout recevoir.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-feed-stock-ticker-${feed.id}`}>
                Ticker boursier (facultatif)
              </Label>
              <Input
                id={`edit-feed-stock-ticker-${feed.id}`}
                name="stock_ticker"
                defaultValue={feed.stock_ticker ?? ""}
                placeholder="AI.PA"
              />
              <p className="text-xs text-muted-foreground">
                Symbole Alpha Vantage (ex. AI.PA pour Air Liquide à Paris).
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
