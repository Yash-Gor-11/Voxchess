import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { StubPage } from "@/components/common/StubPage";

export const Route = createFileRoute("/_app/play/pvp")({
  head: () => ({ meta: [{ title: "PvP — VoxChess" }] }),
  component: () => (
    <StubPage icon={Users} title="Play a friend" description="Create a room or join with a 6-character code." />
  ),
});