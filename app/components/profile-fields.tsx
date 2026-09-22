import { Field } from "./ui";
import type { User } from "~/db/schema";

export function ProfileFields({ user }: { user: Partial<User> }) {
  return (
    <>
      <Field label="Full name">
        <input name="name" required defaultValue={user.name ?? ""} className="input" autoComplete="name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Gender" hint="Men play in the mixed group.">
          <select name="gender" required defaultValue={user.gender ?? ""} className="select">
            <option value="" disabled>
              Select…
            </option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Phone / WhatsApp">
          <input name="phone" defaultValue={user.phone ?? ""} className="input" autoComplete="tel" inputMode="tel" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hand">
          <select name="handedness" defaultValue={user.handedness ?? ""} className="select">
            <option value="">—</option>
            <option value="right">Right-handed</option>
            <option value="left">Left-handed</option>
          </select>
        </Field>
        <Field label="Preferred side">
          <select name="preferredSide" defaultValue={user.preferredSide ?? ""} className="select">
            <option value="">—</option>
            <option value="left">Left (backhand side)</option>
            <option value="right">Right (drive side)</option>
            <option value="either">Either</option>
          </select>
        </Field>
      </div>
      <Field label="Type of player">
        <select name="playStyle" defaultValue={user.playStyle ?? ""} className="select">
          <option value="">—</option>
          <option value="all_round">All-rounder</option>
          <option value="attacking">Attacking · loves the net</option>
          <option value="defensive">Defensive · patient lobs</option>
          <option value="social">Here for the social · rallies and laughs</option>
        </select>
      </Field>
      <Field label="A line about you" hint="Optional. Shown on your profile.">
        <textarea name="bio" rows={2} maxLength={300} defaultValue={user.bio ?? ""} className="textarea" placeholder="Moved to Palma last year, play twice a week, always up for a drink after." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Instagram">
          <input name="instagram" defaultValue={user.instagram ?? ""} className="input" placeholder="@handle" />
        </Field>
        <Field label="Photo URL" hint="Link to a photo, optional.">
          <input name="avatarUrl" type="url" defaultValue={user.avatarUrl ?? ""} className="input" placeholder="https://…" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink-70">
        <input type="checkbox" name="showInDirectory" defaultChecked={user.showInDirectory ?? true} className="h-4 w-4 accent-indigo" />
        Show me in the member directory so others can find a partner
      </label>
    </>
  );
}
