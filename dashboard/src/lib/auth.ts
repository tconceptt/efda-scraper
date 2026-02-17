"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const VALID_USERNAME = "rufica";
const VALID_PASSWORD = "EFDA-P@ssw0rd";
const COOKIE_NAME = "efda_session";

export async function login(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (username !== VALID_USERNAME || password !== VALID_PASSWORD) {
    return { error: "Invalid username or password" };
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });

  redirect("/");
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}
