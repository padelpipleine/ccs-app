import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name").max(80),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  gender: z.enum(["female", "male", "other"]),
  handedness: z.enum(["right", "left"]).optional().or(z.literal("")),
  preferredSide: z.enum(["left", "right", "either"]).optional().or(z.literal("")),
  playStyle: z.enum(["defensive", "attacking", "all_round", "social"]).optional().or(z.literal("")),
  bio: z.string().trim().max(300).optional().or(z.literal("")),
  instagram: z.string().trim().max(60).optional().or(z.literal("")),
  avatarUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  showInDirectory: z.enum(["on"]).optional(),
  selfLevel: z.enum(["beginner", "improver", "intermediate", "advanced", "competition"]).optional().or(z.literal("")),
  sessionPref: z.enum(["ladies", "mixed", "both"]).optional().or(z.literal("")),
  ambassador: z.enum(["yes", "maybe", "no"]).optional().or(z.literal("")),
  photoConsent: z.enum(["yes", "no"]).optional().or(z.literal("")),
  onboardingNotes: z.string().trim().max(1000).optional().or(z.literal("")),
});

/** Maps a validated profile form to the columns it updates. Group follows gender and session preference. */
export function profileToUpdate(d: z.infer<typeof profileSchema>, currentMemberType: "mixed" | "female") {
  const sessionPref = d.sessionPref || null;
  const memberType: "mixed" | "female" = d.gender === "male" ? "mixed" : sessionPref === "ladies" ? "female" : sessionPref ? "mixed" : currentMemberType;
  return {
    name: d.name,
    phone: d.phone || null,
    gender: d.gender,
    memberType,
    handedness: d.handedness || null,
    preferredSide: d.preferredSide || null,
    playStyle: d.playStyle || null,
    bio: d.bio || null,
    instagram: d.instagram || null,
    avatarUrl: d.avatarUrl || null,
    showInDirectory: d.showInDirectory === "on",
    selfLevel: d.selfLevel || null,
    sessionPref,
    ambassador: d.ambassador || null,
    photoConsent: d.photoConsent || null,
    onboardingNotes: d.onboardingNotes || null,
  };
}

export function formToObject(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Please check the form.";
}

export const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
export const dateRe = /^\d{4}-\d{2}-\d{2}$/;
