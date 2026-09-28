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
import { Trophy } from "lucide-react";
import { createTeam } from "./actions";

export function NewTeamDialog({ categoryId }: { categoryId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Trophy className="size-4" />
        Suivre une équipe
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            const result = await createTeam(formData);
            if (result.error) setError(result.error);
            else setOpen(false);
          }}
        >
          <input type="hidden" name="category_id" value={categoryId} />
          <DialogHeader>
            <DialogTitle>Nouvelle équipe</DialogTitle>
            <DialogDescription>
              Score posté le soir du match dans le salon de cette catégorie, plus un récap
              chaque lundi (dernier résultat et prochain match).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor={`team-query-${categoryId}`}>Nom de l&apos;équipe</Label>
            <Input
              id={`team-query-${categoryId}`}
              name="query"
              placeholder="Stade Toulousain"
              required
            />
            <p className="text-xs text-muted-foreground">
              Recherche sur TheSportsDB : le nom officiel donne le meilleur résultat.
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="submit">Ajouter</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
