"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Receipt, Trash2 } from "lucide-react";
import type { StockPosition, PositionTransactionRow, PositionDividendRow } from "@/lib/types";
import { addTransaction, deleteDividend, deleteTransaction } from "./actions";

type HistoryEntry =
  | { kind: "tx"; date: string; row: PositionTransactionRow }
  | { kind: "dividend"; date: string; row: PositionDividendRow };

export function TransactionDialog({
  position,
  transactions,
  dividends,
}: {
  position: StockPosition;
  transactions: PositionTransactionRow[];
  dividends: PositionDividendRow[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("buy");
  const today = new Date().toISOString().slice(0, 10);
  const isDividend = type === "dividend";
  const sorted: HistoryEntry[] = [
    ...transactions.map((row) => ({ kind: "tx" as const, date: row.transaction_date, row })),
    ...dividends.map((row) => ({ kind: "dividend" as const, date: row.payment_date, row })),
  ].sort((a, b) => b.date.localeCompare(a.date));

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
        <Receipt className="size-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transactions — {position.label}</DialogTitle>
          <DialogDescription>
            Parts et PRU moyen se recalculent automatiquement à partir de l&apos;historique.
            Pour un dividende : parts détenues × dividende par part.
          </DialogDescription>
        </DialogHeader>

        <form action={addTransaction} className="space-y-4 py-2">
          <input type="hidden" name="position_id" value={position.id} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor={`tx-type-${position.id}`}>Type</Label>
              <select
                id={`tx-type-${position.id}`}
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                <option value="buy">Achat</option>
                <option value="sell">Vente</option>
                <option value="dividend">Dividende</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`tx-date-${position.id}`}>Date</Label>
              <Input
                id={`tx-date-${position.id}`}
                name="transaction_date"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`tx-shares-${position.id}`}>Parts</Label>
              <Input
                id={`tx-shares-${position.id}`}
                name="shares"
                type="number"
                min="0"
                step="any"
                placeholder="5"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`tx-price-${position.id}`}>
                {isDividend ? "Dividende / part" : "Prix / part"}
              </Label>
              <Input
                id={`tx-price-${position.id}`}
                name="price_per_share"
                type="number"
                min="0"
                step="any"
                placeholder={isDividend ? "2.50" : "150.00"}
                required
              />
            </div>
          </div>
          <Button type="submit" size="sm">
            Ajouter
          </Button>
        </form>

        {sorted.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5 max-h-48 overflow-y-auto py-1">
              {sorted.map((entry) => (
                <div key={entry.row.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {entry.kind === "dividend"
                      ? `Dividende ${entry.row.amount.toFixed(2)} €`
                      : `${entry.row.shares > 0 ? "Achat" : "Vente"} ${Math.abs(entry.row.shares)} @ ${entry.row.price_per_share.toFixed(2)} €`}{" "}
                    — {entry.date}
                  </span>
                  <form action={entry.kind === "dividend" ? deleteDividend : deleteTransaction}>
                    <input type="hidden" name="id" value={entry.row.id} />
                    <input type="hidden" name="position_id" value={position.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
