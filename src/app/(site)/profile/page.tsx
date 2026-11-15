import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Profile" };

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(60),
  last_name: z.string().trim().min(1, "Last name is required").max(60),
  phone: z.string().trim().max(30),
  hometown: z.string().trim().max(100),
  handicap: z.union([z.literal(""), z.coerce.number().min(-10).max(54)]),
  email_updates: z.boolean(),
});

async function saveProfile(formData: FormData) {
  "use server";
  const user = await requireUser();
  const parsed = schema.safeParse({
    first_name: formData.get("first_name") ?? "",
    last_name: formData.get("last_name") ?? "",
    phone: formData.get("phone") ?? "",
    hometown: formData.get("hometown") ?? "",
    handicap: formData.get("handicap") ?? "",
    email_updates: formData.get("email_updates") === "on",
  });
  if (!parsed.success) {
    redirect("/profile?error=" + encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form."));
  }
  const p = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: p.first_name,
      last_name: p.last_name,
      phone: p.phone || null,
      hometown: p.hometown || null,
      handicap: p.handicap === "" ? null : Math.round(p.handicap * 10) / 10,
      email_updates: p.email_updates,
    })
    .eq("id", user.id);
  if (error) redirect("/profile?error=" + encodeURIComponent("Couldn’t save your profile."));
  revalidatePath("/", "layout");
  redirect("/profile?msg=" + encodeURIComponent("Saved."));
}

type MyProfile = {
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  hometown: string | null;
  handicap: number | null;
  email_updates: boolean;
};

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  await requireUser();
  const { error, msg, welcome } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_profile");
  const me = data as MyProfile | null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="h1">Your profile</h1>
      {welcome && <Notice message="Password saved — welcome! Fill in your name and hometown so the crew knows who you are." />}
      <Notice error={error} message={msg} />
      <form action={saveProfile} className="card space-y-4">
        <p className="text-sm text-muted">Signed in as {me?.email}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="first_name" className="label">First name</label>
            <input id="first_name" name="first_name" defaultValue={me?.first_name ?? ""} required maxLength={60} className="field" autoComplete="given-name" />
          </div>
          <div>
            <label htmlFor="last_name" className="label">Last name</label>
            <input id="last_name" name="last_name" defaultValue={me?.last_name ?? ""} required maxLength={60} className="field" autoComplete="family-name" />
          </div>
        </div>
        <div>
          <label htmlFor="hometown" className="label">Hometown (city, state)</label>
          <input id="hometown" name="hometown" defaultValue={me?.hometown ?? ""} maxLength={100} className="field" placeholder="Irvine, CA" />
          <p className="mt-1 text-xs text-muted">Members can see this. Never enter a street address.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="handicap" className="label">Handicap (optional)</label>
            <input id="handicap" name="handicap" inputMode="decimal" defaultValue={me?.handicap ?? ""} className="field" placeholder="12.4" />
          </div>
          <div>
            <label htmlFor="phone" className="label">Phone (only the organizer sees this)</label>
            <input id="phone" name="phone" type="tel" defaultValue={me?.phone ?? ""} maxLength={30} className="field" autoComplete="tel" />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="email_updates" defaultChecked={me?.email_updates ?? true} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
          <span>Email me trip updates and announcements</span>
        </label>
        <SubmitButton>Save profile</SubmitButton>
      </form>
    </div>
  );
}
