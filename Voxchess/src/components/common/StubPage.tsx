import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function StubPage({
  icon: Icon, title, description,
}: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="p-8">
      <Card className="mx-auto max-w-xl bg-card/60 backdrop-blur border-border/50 p-10 text-center">
        <Icon className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <Badge variant="outline" className="mt-5">Coming next</Badge>
      </Card>
    </div>
  );
}