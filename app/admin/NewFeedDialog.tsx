"use client";

import { useState, useTransition } from "react";
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
import { Plus, Search } from "lucide-react";
import { createFeed, inspectFeed, type FeedInspection } from "./actions";

export function NewFeedDialog({ categoryId }: { categoryId: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [inspection, setInspection] = useState<FeedInspection | null>(null);
  const [inspecting, startInspect] = useTransition();

  function reset() {
    setUrl("");
    setName("");
    setInspection(null);
  }

  function inspect() {
    if (!url.trim()) return;
    startInspect(async () => {
      const result = await inspectFeed(url, categoryId);
      setInspection(result);
      if (result.ok) {
        setUrl(result.feedUrl);
        if (!name.trim() && result.title) setName(result.title);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Plus className="size-4" />
        Ajouter un flux
      </DialogTrigger>
      <DialogContent>
        <form
          action={async (formData) => {
            await createFeed(formData);
            setOpen(false);
            reset();
          }}
        >
          <input type="hidden" name="category_id" value={categoryId} />
          <DialogHeader>
            <DialogTitle>Nouveau flux RSS</DialogTitle>
            <DialogDescription>
              Colle l&apos;adresse du flux, ou simplement celle du site puis « Analyser » pour
              trouver son flux et voir ce qu&apos;il apporterait.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={`feed-url-${categoryId}`}>URL du flux ou du site</Label>
              <div className="flex gap-2">
                <Input
                  id={`feed-url-${categoryId}`}
                  name="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://techcrunch.com"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={inspect}
                  disabled={inspecting || !url.trim()}
                >
                  <Search className="size-4" />
                  {inspecting ? "Analyse…" : "Analyser"}
                </Button>
              </div>
            </div>

            {inspection && !inspection.ok && (
              <p className="text-xs text-destructive">{inspection.error}</p>
            )}

            {inspection?.ok && (
              <div className="rounded-lg border p-3 space-y-2 text-xs">
                <p className="text-muted-foreground">
                  {inspection.items.length} derniers articles
                  {inspection.averageScore !== null &&
                    ` · pertinence moyenne ${inspection.averageScore.toFixed(1)}/10 pour cette catégorie`}
                </p>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {inspection.items.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="tabular-nums text-muted-foreground w-8 shrink-0">
                        {item.score}/10
                      </span>
                      <span className="truncate">{item.title}</span>
                    </li>
                  ))}
                </ul>
                {inspection.alternatives.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Autres flux proposés par ce site :</p>
                    {inspection.alternatives.map((alt) => (
                      <button
                        key={alt}
                        type="button"
                        className="block truncate max-w-full text-left underline underline-offset-2 hover:text-foreground text-muted-foreground"
                        onClick={() => {
                          setUrl(alt);
                          setInspection(null);
                        }}
                      >
                        {alt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor={`feed-name-${categoryId}`}>Nom</Label>
              <Input
                id={`feed-name-${categoryId}`}
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="TechCrunch"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`feed-keywords-${categoryId}`}>Mots-clés (facultatif)</Label>
              <Input
                id={`feed-keywords-${categoryId}`}
                name="keywords"
                placeholder="intelligence artificielle, IA, GPU"
              />
              <p className="text-xs text-muted-foreground">
                Séparés par des virgules. Seuls les articles contenant au moins un de ces mots
                (titre ou résumé) seront notifiés. Laisser vide pour tout recevoir.
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
