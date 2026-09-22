import { Field } from "./ui";
import { PhotoPicker } from "./photo-picker";
import type { User } from "~/db/schema";

export function ProfileFields({ user, onboarding = false }: { user: Partial<User>; onboarding?: boolean }) {
  return (
    <>
      <PhotoPicker name="avatarUrl" initialUrl={user.avatarUrl ?? null} displayName={user.name ?? ""} />
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Your level, roughly" hint="The coach sets your real padel level on level day.">
          <select name="selfLevel" defaultValue={user.selfLevel ?? ""} className="select">
            <option value="">—</option>
            <option value="beginner">Beginner</option>
            <option value="improver">Improver</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
            <option value="competition">Competition</option>
          </select>
        </Field>
        <Field label="Which sessions?" hint="Men play in the mixed sessions.">
          <select name="sessionPref" defaultValue={user.sessionPref ?? ""} className="select">
            <option value="">—</option>
            <option value="ladies">Ladies</option>
            <option value="mixed">Mixed</option>
            <option value="both">Both</option>
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
      <Field label="Instagram">
        <input name="instagram" defaultValue={user.instagram ?? ""} className="input" placeholder="@handle" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fancy leading the club somewhere?" hint="We're growing city by city, run by local ambassadors.">
          <select name="ambassador" defaultValue={user.ambassador ?? ""} className="select">
            <option value="">—</option>
            <option value="yes">Yes, tell me more</option>
            <option value="maybe">Maybe</option>
            <option value="no">Not for me</option>
          </select>
        </Field>
        <Field label="Photos & videos" hint="We shoot content at sessions and events.">
          <select name="photoConsent" defaultValue={user.photoConsent ?? ""} className="select">
            <option value="">—</option>
            <option value="yes">Fine to feature me</option>
            <option value="no">Rather not</option>
          </select>
        </Field>
      </div>
      {onboarding && (
        <Field label="Anything else?" hint="Injuries, who you like playing with, days that work…">
          <textarea name="onboardingNotes" rows={2} maxLength={1000} defaultValue={user.onboardingNotes ?? ""} className="textarea" />
        </Field>
      )}
      <label className="flex items-center gap-2 text-sm text-ink-70">
        <input type="checkbox" name="showInDirectory" defaultChecked={user.showInDirectory ?? true} className="h-4 w-4 accent-indigo" />
        Show me in the member directory so others can find a partner
      </label>
    </>
  );
}
