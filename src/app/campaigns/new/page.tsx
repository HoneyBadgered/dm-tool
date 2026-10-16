import { createCampaignAction } from "../actions";
import { CampaignForm } from "../campaign-form";

export default function NewCampaignPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-xl font-semibold">New campaign</h1>
      <CampaignForm
        action={createCampaignAction}
        submitLabel="Create"
        cancelHref="/campaigns"
      />
    </div>
  );
}
