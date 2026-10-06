import { redirect } from "next/navigation";

/** Old address of the control events section. */
export default function ExamsPage() {
  redirect("/tasks?f=control");
}
