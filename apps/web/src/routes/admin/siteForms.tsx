import { useId, useState, type ReactNode } from "react";
import {
  formatStorageBytes,
  normalisePublicUrl,
  SITE_NAME_MAX,
  type MailSecurity,
  type MailSettingsPublic,
  type PublicUrlCheckPublic,
  type SignupSettingsPublic,
  type SiteSettingsAdminPublic,
  type SpaceSettingsPublic,
} from "@teamflow/core";
import { errorMessage } from "../../lib/errorSink";
import { useUpdateSpaceSettingsMutation } from "../../queries/instance";
import {
  useCheckAddressMutation,
  useSendTestMailMutation,
  useUpdateMailSettingsMutation,
  useUpdateSignupSettingsMutation,
  useUpdateSiteSettingsMutation,
} from "../../queries/site";
import { CapField } from "./CapField";
import { bytesToGbText, capDraftFrom, capFromDraft, gbToBytes, type CapDraft } from "./capBytes";

/**
 * Forms shared by first-time setup (steps 2–4) and the admin page (Site & email, Flow defaults
 * & sign-up). A value set in .env shows read-only with "Set in .env" and is never sent.
 */

export function EnvBadge() {
  return (
    <span className="setting-env-badge" title="Set in .env, which wins over this page">
      Set in .env
    </span>
  );
}

function FormError({ message }: { message: string | null }) {
  return message ? (
    <p className="banner error" role="alert">
      {message}
    </p>
  ) : null;
}

/* ---------- site name and public address ---------- */

export function SiteForm({
  site,
  submitLabel,
  onSaved,
  secondary,
}: {
  site: SiteSettingsAdminPublic;
  submitLabel: string;
  onSaved?: () => void;
  /** Extra buttons on the left of the footer (Back). */
  secondary?: ReactNode;
}) {
  const nameId = useId();
  const urlId = useId();
  const save = useUpdateSiteSettingsMutation();
  const check = useCheckAddressMutation();
  const nameLocked = site.siteNameSource === "env";
  const urlLocked = site.publicUrlSource === "env";
  const [name, setName] = useState(site.siteName);
  const prefilled = site.publicUrlSource === "default";
  const [url, setUrl] = useState(
    // The browser's own address is what people use; the server only sees it behind a trusted proxy.
    prefilled
      ? (normalisePublicUrl(window.location.origin) ?? site.suggestedPublicUrl ?? "")
      : site.publicUrl,
  );
  const [checked, setChecked] = useState<PublicUrlCheckPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  const normalised = normalisePublicUrl(url);
  const nameValid = name.trim().length > 0 && name.trim().length <= SITE_NAME_MAX;
  const valid = (nameLocked || nameValid) && (urlLocked || normalised !== null);

  const runCheck = async () => {
    if (!normalised) return;
    setChecked(null);
    try {
      setChecked(await check.mutateAsync(normalised));
    } catch (err) {
      setError(errorMessage(err, "Could not check the address"));
    }
  };

  const submit = async () => {
    if (!valid) return;
    setError(null);
    try {
      await save.mutateAsync({
        ...(nameLocked ? {} : { siteName: name.trim() }),
        ...(urlLocked || !normalised ? {} : { publicUrl: normalised }),
      });
      onSaved?.();
    } catch (err) {
      setError(errorMessage(err, "Could not save"));
    }
  };

  return (
    <form
      className="settings-section site-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={nameId}>
          Site name {nameLocked ? <EnvBadge /> : null}
        </label>
        <input
          id={nameId}
          value={name}
          maxLength={SITE_NAME_MAX}
          readOnly={nameLocked}
          aria-invalid={(!nameLocked && !nameValid) || undefined}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="settings-field-hint">
          Shown on the login page, in the browser tab and in emails.
        </span>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={urlId}>
          Public address {urlLocked ? <EnvBadge /> : null}
          {!urlLocked && prefilled ? (
            <span className="setting-from-tag">from this page</span>
          ) : null}
        </label>
        <div className="site-url-row">
          <input
            id={urlId}
            value={urlLocked ? site.publicUrl : url}
            readOnly={urlLocked}
            inputMode="url"
            spellCheck={false}
            aria-invalid={(!urlLocked && normalised === null) || undefined}
            onChange={(e) => {
              setUrl(e.target.value);
              setChecked(null);
            }}
          />
          <button
            type="button"
            className="ghost"
            disabled={!normalised || check.isPending}
            onClick={() => void runCheck()}
          >
            {check.isPending ? "Checking…" : "Check"}
          </button>
        </div>
        {!urlLocked && normalised === null ? (
          <span className="settings-field-hint admin-bad" role="alert">
            Enter a full address starting with http:// or https://
          </span>
        ) : checked ? (
          <span
            className={`settings-field-hint ${checked.ok ? "admin-ok" : "admin-bad"}`}
            role="status"
          >
            {checked.ok
              ? `✓ Reachable (${checked.ms} ms).`
              : `✗ Not reachable from the server: ${checked.error ?? `HTTP ${checked.status}`}.`}
          </span>
        ) : (
          <span className="settings-field-hint">
            Invite links, password-reset emails and the Discord bot use this address. If people open
            Teamflow at another address (for example through a proxy), enter that one.
          </span>
        )}
      </div>
      <FormError message={error} />
      <div className="setup-actions">
        {secondary}
        <button type="submit" disabled={!valid || save.isPending}>
          {save.isPending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/* ---------- outgoing email ---------- */

const SECURITY_LABELS: Record<MailSecurity, string> = {
  starttls: "STARTTLS (587)",
  ssl: "SSL (465)",
  none: "None",
};
const SECURITY_PORTS: Record<MailSecurity, number> = { starttls: 587, ssl: 465, none: 25 };

export function MailForm({
  mail,
  submitLabel,
  onSaved,
  onSkip,
  secondary,
}: {
  mail: MailSettingsPublic;
  submitLabel: string;
  onSaved?: () => void;
  /** Setup only: "Skip for now". */
  onSkip?: () => void;
  secondary?: ReactNode;
}) {
  const hostId = useId();
  const portId = useId();
  const userId = useId();
  const passId = useId();
  const fromId = useId();
  const save = useUpdateMailSettingsMutation();
  const test = useSendTestMailMutation();
  const locked = mail.source === "env";
  const [host, setHost] = useState(mail.host ?? "");
  const [port, setPort] = useState(String(mail.port));
  const [security, setSecurity] = useState<MailSecurity>(mail.security);
  const [user, setUser] = useState(mail.user ?? "");
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState(mail.from ?? "");
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);

  const portValue = Number(port);
  const valid =
    host.trim().length > 0 && Number.isInteger(portValue) && portValue > 0 && portValue < 65536;

  const persist = async () => {
    await save.mutateAsync({
      host: host.trim(),
      port: portValue,
      security,
      user: user.trim() || null,
      // Blank keeps the saved password; there is no way to read it back.
      ...(password ? { password } : {}),
      from: from.trim() || null,
    });
    setPassword("");
  };

  const submit = async () => {
    if (locked) return onSaved?.();
    if (!valid) return;
    setError(null);
    try {
      await persist();
      onSaved?.();
    } catch (err) {
      setError(errorMessage(err, "Could not save"));
    }
  };

  const sendTest = async () => {
    setError(null);
    setTestResult(null);
    try {
      if (!locked) {
        if (!valid) return;
        await persist();
      }
      const result = await test.mutateAsync({});
      setTestOk(result.ok);
      setTestResult(
        result.ok
          ? `Sent a test to ${result.to}. Check that inbox (and its spam folder).`
          : `Sending failed: ${result.error}`,
      );
    } catch (err) {
      setError(errorMessage(err, "Could not send"));
    }
  };

  return (
    <form
      className="settings-section mail-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {locked ? (
        <p className="settings-copy">
          Email is set in .env (<code>SMTP_HOST</code> and friends), which wins over this page:{" "}
          <strong>{mail.host}</strong>:{mail.port}. Change it there and restart. <EnvBadge />
        </p>
      ) : (
        <>
          <div className="mail-form-row">
            <div className="settings-field">
              <label className="settings-field-label" htmlFor={hostId}>
                SMTP server
              </label>
              <input
                id={hostId}
                value={host}
                placeholder="smtp.example.com"
                spellCheck={false}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div className="settings-field mail-form-port">
              <label className="settings-field-label" htmlFor={portId}>
                Port
              </label>
              <input
                id={portId}
                inputMode="numeric"
                value={port}
                aria-invalid={!(portValue > 0 && portValue < 65536) || undefined}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>
          <div className="settings-field">
            <span className="settings-field-label">Security</span>
            <span className="admin-seg" role="group" aria-label="Security">
              {(Object.keys(SECURITY_LABELS) as MailSecurity[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={security === value ? "active" : undefined}
                  aria-pressed={security === value}
                  onClick={() => {
                    // Move the port along when it was the previous mode's usual one.
                    if (portValue === SECURITY_PORTS[security])
                      setPort(String(SECURITY_PORTS[value]));
                    setSecurity(value);
                  }}
                >
                  {SECURITY_LABELS[value]}
                </button>
              ))}
            </span>
          </div>
          <div className="mail-form-row">
            <div className="settings-field">
              <label className="settings-field-label" htmlFor={userId}>
                Username
              </label>
              <input
                id={userId}
                value={user}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setUser(e.target.value)}
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor={passId}>
                Password
              </label>
              <input
                id={passId}
                type="password"
                value={password}
                autoComplete="new-password"
                placeholder={mail.passwordSet ? "Saved (leave blank to keep)" : ""}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor={fromId}>
              Send as
            </label>
            <input
              id={fromId}
              value={from}
              placeholder="Teamflow <teamflow@example.org>"
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="settings-field-hint">
              Blank uses the site name at this server's address. The password is stored encrypted.
            </span>
          </div>
        </>
      )}
      {testResult ? (
        <p className={`settings-field-hint ${testOk ? "admin-ok" : "admin-bad"}`} role="status">
          {testResult}
        </p>
      ) : null}
      <FormError message={error} />
      <div className="setup-actions">
        {secondary}
        <button
          type="button"
          className="ghost"
          disabled={(!locked && !valid) || test.isPending || save.isPending}
          onClick={() => void sendTest()}
        >
          {test.isPending ? "Sending…" : "Send a test to me"}
        </button>
        {onSkip && !locked ? (
          <button type="button" className="ghost" onClick={onSkip}>
            Skip for now
          </button>
        ) : null}
        <button type="submit" disabled={(!locked && !valid) || save.isPending}>
          {save.isPending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

/* ---------- Flow defaults and who can sign up ---------- */

export function StorageSignupForm({
  settings,
  signup,
  disk,
  submitLabel,
  onSaved,
  secondary,
}: {
  settings: SpaceSettingsPublic;
  signup: SignupSettingsPublic;
  /** Free and total bytes on the upload disk, when known. */
  disk?: { freeBytes: number | null; totalBytes: number | null } | null;
  submitLabel: string;
  onSaved?: () => void;
  secondary?: ReactNode;
}) {
  const perUserId = useId();
  const floorId = useId();
  const saveSpaces = useUpdateSpaceSettingsMutation();
  const saveSignup = useUpdateSignupSettingsMutation();
  const [cap, setCap] = useState<CapDraft>(() => capDraftFrom(settings.freeSpaceCapBytes));
  const [perUser, setPerUser] = useState(String(settings.freeSpacesPerUser));
  const [floor, setFloor] = useState(
    settings.minFreeDiskBytes > 0 ? bytesToGbText(settings.minFreeDiskBytes) : "0",
  );
  const [inviteOnly, setInviteOnly] = useState(signup.inviteOnly);
  const [error, setError] = useState<string | null>(null);
  const signupLocked = signup.source === "env";

  const capBytes = capFromDraft(cap);
  const perUserValue = Number(perUser);
  const perUserValid = Number.isInteger(perUserValue) && perUserValue >= 0 && perUserValue <= 1000;
  const floorBytes = floor.trim() === "0" ? 0 : gbToBytes(floor);
  const valid = typeof capBytes === "number" && perUserValid && floorBytes !== null;
  const pending = saveSpaces.isPending || saveSignup.isPending;

  const submit = async () => {
    if (!valid || typeof capBytes !== "number" || floorBytes === null) return;
    setError(null);
    try {
      await saveSpaces.mutateAsync({
        freeSpaceCapBytes: capBytes,
        freeSpacesPerUser: perUserValue,
        minFreeDiskBytes: floorBytes,
      });
      if (!signupLocked && inviteOnly !== signup.inviteOnly) {
        await saveSignup.mutateAsync({ inviteOnly });
      }
      onSaved?.();
    } catch (err) {
      setError(errorMessage(err, "Could not save"));
    }
  };

  const freeBytes = disk?.freeBytes ?? null;
  const totalBytes = disk?.totalBytes ?? null;

  return (
    <form
      className="settings-section storage-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <CapField
        label="Upload cap per Flow"
        value={cap}
        onChange={setCap}
        allowNoLimit={false}
        hint="Each Flow someone makes for themselves starts with this. Admin Flows have no limit."
      />
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={perUserId}>
          Flows per person
        </label>
        <input
          id={perUserId}
          inputMode="numeric"
          value={perUser}
          aria-invalid={!perUserValid || undefined}
          onChange={(e) => setPerUser(e.target.value)}
        />
        <span className="settings-field-hint">
          How many free Flows each person may own. Their first one is never refused.
        </span>
      </div>
      <div className="settings-field">
        <label className="settings-field-label" htmlFor={floorId}>
          Stop uploads below (GB free)
        </label>
        <input
          id={floorId}
          inputMode="decimal"
          value={floor}
          aria-invalid={floorBytes === null || undefined}
          onChange={(e) => setFloor(e.target.value)}
        />
        <span className="settings-field-hint">
          Uploads pause for every Flow while free disk is under this. 0 turns it off.
          {freeBytes !== null
            ? ` This server: ${formatStorageBytes(freeBytes)} free${
                totalBytes ? ` of ${formatStorageBytes(totalBytes)}` : ""
              }.`
            : ""}
        </span>
      </div>
      <div className="settings-field">
        <span className="settings-field-label">
          Who can sign up {signupLocked ? <EnvBadge /> : null}
        </span>
        <span className="admin-seg" role="group" aria-label="Who can sign up">
          <button
            type="button"
            className={!inviteOnly ? "active" : undefined}
            aria-pressed={!inviteOnly}
            disabled={signupLocked}
            onClick={() => setInviteOnly(false)}
          >
            Anyone with the address
          </button>
          <button
            type="button"
            className={inviteOnly ? "active" : undefined}
            aria-pressed={inviteOnly}
            disabled={signupLocked}
            onClick={() => setInviteOnly(true)}
          >
            Only people with an invite
          </button>
        </span>
        <span className="settings-field-hint">
          Invite-only is safer for a server on the internet.
        </span>
      </div>
      <FormError message={error} />
      <div className="setup-actions">
        {secondary}
        <button type="submit" disabled={!valid || pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
