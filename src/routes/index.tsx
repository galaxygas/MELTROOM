import { createFileRoute } from "@tanstack/react-router";
import { Meltroom } from "@/components/meltroom/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Meltroom />;
}
