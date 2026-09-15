import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { Category, Feed, StockPosition } from "@/lib/types";
import { deleteCategory, deleteFeed, deletePosition } from "./actions";
import { FeedActiveToggle } from "./FeedActiveToggle";
import { NewFeedDialog } from "./NewFeedDialog";
import { EditCategoryDialog } from "./EditCategoryDialog";
import { EditFeedDialog } from "./EditFeedDialog";
import { NewPositionDialog } from "./NewPositionDialog";
import { EditPositionDialog } from "./EditPositionDialog";

export function CategoryCard({
  category,
  feeds,
  positions,
}: {
  category: Category;
  feeds: Feed[];
  positions: StockPosition[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: category.color }}
              aria-hidden
            />
            <CardTitle className="text-base">{category.name}</CardTitle>
            <Badge variant="secondary">
              {feeds.length} flux
            </Badge>
          </div>
          <CardDescription className="font-mono text-xs truncate max-w-sm">
            {category.discord_webhook_url}
          </CardDescription>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <EditCategoryDialog category={category} />

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                />
              }
            >
              <Trash2 className="size-4" />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer la catégorie {category.name} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Les {feeds.length} flux associés seront supprimés avec elle. Cette action est
                  irréversible.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <form action={deleteCategory}>
                  <input type="hidden" name="id" value={category.id} />
                  <AlertDialogAction type="submit" variant="destructive">
                    Supprimer
                  </AlertDialogAction>
                </form>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>

      <CardContent>
        {feeds.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Aucun flux dans cette catégorie.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Mots-clés</TableHead>
                <TableHead className="w-16">Actif</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {feeds.map((feed) => (
                <TableRow key={feed.id}>
                  <TableCell className="font-medium">{feed.name}</TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-56">
                    {feed.url}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-40 truncate">
                    {feed.keywords || <span className="italic">tout</span>}
                  </TableCell>
                  <TableCell>
                    <FeedActiveToggle id={feed.id} active={feed.active} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <EditFeedDialog feed={feed} />
                      <form action={deleteFeed}>
                        <input type="hidden" name="id" value={feed.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {positions.length > 0 && (
          <>
            <Separator className="my-4" />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Position</TableHead>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position) => (
                  <TableRow key={position.id}>
                    <TableCell className="font-medium">{position.label}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {position.ticker}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <EditPositionDialog position={position} />
                        <form action={deletePosition}>
                          <input type="hidden" name="id" value={position.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>

      <CardFooter className="flex items-center gap-2">
        <NewFeedDialog categoryId={category.id} />
        <NewPositionDialog categoryId={category.id} />
      </CardFooter>
    </Card>
  );
}
