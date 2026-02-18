"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const DEFAULT_USERNAME = "rufica";
const DEFAULT_PASSWORD = "admin";
const COOKIE_NAME = "efda_session";
const PASSWORD_FILE = join(process.cwd(), ".password.json");

async function getStoredPassword(): Promise<string> {
  try {
    const data = await readFile(PASSWORD_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return parsed.password || DEFAULT_PASSWORD;
  } catch {
    return DEFAULT_PASSWORD;
  }
}

export async function login(
  _prevState: { error: string } | null,
  formData: FormData
) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const storedPassword = await getStoredPassword();

  if (username !== DEFAULT_USERNAME || password !== storedPassword) {
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

export async function changePassword(
  _prevState: { error?: string; success?: string } | null,
  formData: FormData
) {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  const storedPassword = await getStoredPassword();

  if (currentPassword !== storedPassword) {
    return { error: "Current password is incorrect" };
  }

  if (!newPassword || newPassword.length < 4) {
    return { error: "New password must be at least 4 characters" };
  }

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match" };
  }

  try {
    await writeFile(PASSWORD_FILE, JSON.stringify({ password: newPassword }));
    return { success: "Password changed successfully" };
  } catch {
    return { error: "Failed to save new password" };
  }
}
