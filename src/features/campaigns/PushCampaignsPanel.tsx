import { BellRing, Send, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Pagination } from "../../components/ui/DataTable";
import { ConfirmDialog } from "../../components/ui/Dialog";
import {
  Callout,
  EmptyState,
  ErrorState,
  Skeleton,
} from "../../components/ui/feedback";
import {
  Checkbox,
  Field,
  Input,
  Segmented,
  Select,
  Textarea,
} from "../../components/ui/forms";
import { RelativeTime } from "../../components/ui/misc";
import { useAuth } from "../../lib/auth-context";
import { formatDateTime, formatNumber } from "../../lib/format";
import {
  actions,
  useAdminMutation,
  useAudienceSize,
  useCampaigns,
} from "../../lib/queries";
import { DEFAULT_PAGE_SIZE } from "../../lib/search";
import type {
  CampaignAudience,
  CampaignStatus,
  PushCampaign,
} from "../../lib/types";
import {
  appPathOf,
  audienceText,
  fromLocalInput,
  toLocalInput,
} from "./campaign-format";

const STATUS: Record<CampaignStatus, { label: string; tone: BadgeTone }> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  SENDING: { label: "Sending", tone: "warning" },
  SENT: { label: "Sent", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
};

const TITLE_LIMIT = 65;
const BODY_LIMIT = 240;

/** Pushes to many people at once: write one, see whom it reaches, send it now or later. */
export function PushCampaignsPanel() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<PushCampaign | null>(null);
  const campaigns = useCampaigns(page);
  const cancel = useAdminMutation(
    (campaignId: string) => actions.cancelCampaign(campaignId),
    {
      success: "Campaign cancelled.",
    },
  );
  const [deleting, setDeleting] = useState<PushCampaign | null>(null);
  const remove = useAdminMutation(
    (campaignId: string) => actions.deleteCampaign(campaignId),
    {
      success: "Campaign deleted.",
    },
  );
  const rows = campaigns.data?.items ?? [];

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[26rem_minmax(0,1fr)]">
      {auth.can("MANAGE_CAMPAIGNS") ? (
        <ComposeCard />
      ) : (
        <Callout title="View only">
          You can see campaigns; sending them needs Campaigns: Manage.
        </Callout>
      )}
      <Card
        title="Sent and scheduled"
        description="Opened: people who tapped the push and opened the app."
        flush
      >
        {campaigns.isPending && <ListSkeleton />}
        {campaigns.isError && !campaigns.data && (
          <ErrorState
            error={campaigns.error}
            onRetry={() => void campaigns.refetch()}
          />
        )}
        {campaigns.data && rows.length === 0 && (
          <EmptyState
            icon={<BellRing />}
            title="No campaigns yet"
            description="Pushes you send to many people show here."
          />
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-zinc-100">
            {rows.map((row) => (
              <li key={row.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-60">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS[row.status].tone}>
                        {STATUS[row.status].label}
                      </Badge>
                      <p className="truncate text-sm font-medium text-zinc-900">
                        {row.title}
                      </p>
                    </div>
                    <p className="mt-1 text-[13px] break-words text-zinc-600">
                      {row.body}
                    </p>
                    <p className="mt-1.5 text-xs text-zinc-500">
                      {audienceText(row.audience)}
                      {row.openPath
                        ? ` · opens ${row.openPath.startsWith("/live") ? "a live" : "a profile"}`
                        : ""}
                      {row.createdBy ? ` · by @${row.createdBy.username}` : ""}
                    </p>
                    {row.failureReason && (
                      <p className="mt-1 text-xs text-red-600">
                        {row.failureReason}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-zinc-500 tabular-nums">
                    {row.status === "SENT" ? (
                      <>
                        <p className="text-sm font-medium text-zinc-900">
                          {row.openRate === null ? "—" : `${row.openRate}%`}{" "}
                          opened
                        </p>
                        <p>
                          {formatNumber(row.openCount)} of{" "}
                          {formatNumber(row.recipientCount)}
                        </p>
                        <p title={formatDateTime(row.sentAt)}>
                          <RelativeTime value={row.sentAt} />
                        </p>
                      </>
                    ) : (
                      <p>
                        {row.status === "SCHEDULED"
                          ? `Goes out ${formatDateTime(row.scheduledAt)}`
                          : formatDateTime(row.scheduledAt)}
                      </p>
                    )}
                    {row.status === "SCHEDULED" &&
                      auth.can("MANAGE_CAMPAIGNS") && (
                        <Button
                          size="sm"
                          variant="danger-ghost"
                          icon={<X />}
                          className="mt-1.5"
                          onClick={() => setCancelling(row)}
                        >
                          Cancel
                        </Button>
                      )}
                    {row.status !== "SENDING" &&
                      auth.can("MANAGE_CAMPAIGNS") && (
                        <Button
                          size="sm"
                          variant="danger-ghost"
                          icon={<Trash2 />}
                          aria-label="Delete campaign"
                          className="mt-1.5 ml-1"
                          onClick={() => setDeleting(row)}
                        />
                      )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {campaigns.data && campaigns.data.total > DEFAULT_PAGE_SIZE && (
          <Pagination
            page={page}
            pageSize={DEFAULT_PAGE_SIZE}
            total={campaigns.data.total}
            onPageChange={setPage}
          />
        )}
      </Card>
      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel this campaign?"
        description="Nobody gets it. It stays in the list as cancelled."
        confirmLabel="Cancel campaign"
        tone="danger"
        onConfirm={() =>
          cancelling ? cancel.mutateAsync(cancelling.id) : Promise.resolve()
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this campaign?"
        description={
          deleting?.status === "SCHEDULED"
            ? "It is removed from the list and never goes out."
            : "It is removed from the list, with its open count. Pushes already delivered stay on people's phones."
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() =>
          deleting ? remove.mutateAsync(deleting.id) : Promise.resolve()
        }
      />
    </div>
  );
}

function ComposeCard() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [opens, setOpens] = useState("");
  const [platform, setPlatform] = useState<"" | "ANDROID" | "IOS">("");
  const [versions, setVersions] = useState("");
  const [hostsOnly, setHostsOnly] = useState(false);
  const [activity, setActivity] = useState<"any" | "active" | "inactive">(
    "any",
  );
  const [days, setDays] = useState("14");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState(() =>
    toLocalInput(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [confirming, setConfirming] = useState(false);
  // Checked on send: the time may have passed while the form was open.
  const [timePassed, setTimePassed] = useState(false);

  const dayCount = Number(days);
  const daysProblem =
    activity !== "any" &&
    !(Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 365);
  const versionList = versions
    .split(",")
    .map((each) => each.trim())
    .filter(Boolean);
  const versionsProblem = versionList.some(
    (each) => !/^\d{1,4}(\.\d{1,4}){0,3}$/.test(each),
  );
  const openPath = opens.trim() ? appPathOf(opens) : null;
  const opensProblem = opens.trim() !== "" && openPath === null;
  const scheduledAt = when === "later" ? fromLocalInput(at) : null;
  const whenProblem = when === "later" && (!scheduledAt || timePassed);

  const audience: CampaignAudience = {
    ...(platform ? { platform } : {}),
    ...(versionList.length && !versionsProblem
      ? { appVersions: versionList }
      : {}),
    ...(hostsOnly ? { hostsOnly: true } : {}),
    ...(activity === "active" && !daysProblem
      ? { activeWithinDays: dayCount }
      : {}),
    ...(activity === "inactive" && !daysProblem
      ? { inactiveForDays: dayCount }
      : {}),
  };
  const size = useAudienceSize(audience, !daysProblem && !versionsProblem);
  const reach = size.data?.count;
  const ready =
    title.trim() !== "" &&
    body.trim() !== "" &&
    !daysProblem &&
    !versionsProblem &&
    !opensProblem &&
    !whenProblem;
  const send = useAdminMutation(
    () =>
      actions.createCampaign({
        title: title.trim(),
        body: body.trim(),
        ...(openPath ? { openPath } : {}),
        audience,
        ...(scheduledAt ? { scheduledAt } : {}),
      }),
    {
      success:
        when === "now" ? "Campaign is going out." : "Campaign scheduled.",
    },
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now()) {
      setTimePassed(true);
      return;
    }
    if (ready) setConfirming(true);
  }

  function reset() {
    setTitle("");
    setBody("");
    setOpens("");
  }

  return (
    <Card
      title="New push campaign"
      description="Goes to phones as a notification. Use it sparingly: too many and people turn them off."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" hint={`${title.length}/${TITLE_LIMIT}`} required>
          <Input
            value={title}
            maxLength={TITLE_LIMIT}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Message" hint={`${body.length}/${BODY_LIMIT}`} required>
          <Textarea
            value={body}
            maxLength={BODY_LIMIT}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <Field
          label="Opens"
          hint="A live or profile link from the app's Share - or empty for the app itself."
          error={opensProblem ? "Paste a link to a live or a profile." : null}
        >
          <Input
            value={opens}
            placeholder="https://…/live/…"
            onChange={(event) => setOpens(event.target.value)}
          />
        </Field>

        <fieldset className="space-y-3 rounded-md border border-zinc-200 p-4">
          <legend className="px-1 text-[13px] font-medium text-zinc-800">
            Who gets it
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phones">
              <Select
                value={platform}
                onChange={(event) =>
                  setPlatform(event.target.value as typeof platform)
                }
              >
                <option value="">Android and iPhone</option>
                <option value="ANDROID">Android only</option>
                <option value="IOS">iPhone only</option>
              </Select>
            </Field>
            <Field
              label="App versions"
              hint="e.g. 1.0.3, 1.0.4 - empty for any"
              error={
                versionsProblem
                  ? "Versions like 1.0.3, separated by commas."
                  : null
              }
            >
              <Input
                value={versions}
                onChange={(event) => setVersions(event.target.value)}
              />
            </Field>
          </div>
          <Checkbox
            label="Only hosts"
            description="People who went live in the last 30 days."
            checked={hostsOnly}
            onChange={(event) => setHostsOnly(event.target.checked)}
          />
          <Segmented<"any" | "active" | "inactive">
            label="Activity"
            value={activity}
            onChange={setActivity}
            options={[
              { value: "any", label: "Anyone" },
              { value: "active", label: "Active lately" },
              { value: "inactive", label: "Away a while" },
            ]}
          />
          {activity !== "any" && (
            <Field
              label={
                activity === "active"
                  ? "Used the app in the last (days)"
                  : "Haven't used it for (days)"
              }
              error={daysProblem ? "A whole number of days, 1 to 365." : null}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                className="w-28"
              />
            </Field>
          )}
          <p className="text-[13px] text-zinc-700" aria-live="polite">
            Reaches{" "}
            <span className="font-semibold tabular-nums">
              {size.isPending
                ? "…"
                : reach === undefined
                  ? "—"
                  : formatNumber(reach)}
            </span>{" "}
            {reach === 1 ? "person" : "people"} right now - those who turned off
            announcements excluded.
          </p>
        </fieldset>

        <Segmented<"now" | "later">
          label="When"
          value={when}
          onChange={setWhen}
          options={[
            { value: "now", label: "Send now" },
            { value: "later", label: "Schedule" },
          ]}
        />
        {when === "later" && (
          <Field
            label="Goes out at"
            hint="Your time zone."
            error={whenProblem ? "Pick a time from now on." : null}
          >
            <Input
              type="datetime-local"
              value={at}
              onChange={(event) => {
                setAt(event.target.value);
                setTimePassed(false);
              }}
            />
          </Field>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            variant="primary"
            icon={<Send />}
            disabled={!ready || reach === 0}
          >
            {when === "now" ? "Send…" : "Schedule…"}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={
          when === "now"
            ? `Send to ${formatNumber(reach ?? 0)} people now?`
            : "Schedule this campaign?"
        }
        description={
          when === "now"
            ? "It can't be taken back once it's out."
            : `It goes out ${formatDateTime(scheduledAt)} to whoever matches then. You can cancel it until it does.`
        }
        confirmLabel={when === "now" ? "Send now" : "Schedule"}
        onConfirm={() => send.mutateAsync(undefined).then(reset)}
      >
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <p className="mt-0.5 text-[13px] text-zinc-600">{body}</p>
        </div>
      </ConfirmDialog>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-5">
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
