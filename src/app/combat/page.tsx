import { CombatTracker } from "@/components/combat/combat-tracker";

export default function CombatPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">Combat Tracker</h1>
      <CombatTracker />
    </div>
  );
}
