import { expect, test } from "@playwright/test";

const accounts = {
  admin: { email: "admin@gestion.local", password: "admin123" },
  proprietaire: { email: "proprietaire@gestion.local", password: "owner123" },
  locataire: { email: "locataire@gestion.local", password: "tenant123" },
};

async function login(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test("admin voit les modules de back-office", async ({ page }) => {
  await login(page, accounts.admin.email, accounts.admin.password);

  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("link", { name: "Biens" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Locataires" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contrats" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Paiements" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mon espace" })).toHaveCount(0);
});

test("proprietaire arrive sur Mon patrimoine et voit son module dedie", async ({ page }) => {
  await login(page, accounts.proprietaire.email, accounts.proprietaire.password);

  await expect(page).toHaveURL(/mon-patrimoine/);
  await expect(page.getByRole("link", { name: "Mon patrimoine" })).toBeVisible();
  await expect(page.getByText("Espace propriétaire")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mon espace" })).toHaveCount(0);
});

test("locataire arrive sur Mon espace et ne peut pas ouvrir le dashboard", async ({ page }) => {
  await login(page, accounts.locataire.email, accounts.locataire.password);

  await expect(page).toHaveURL(/mon-espace/);
  await expect(page.getByRole("link", { name: "Mon espace" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Biens" })).toHaveCount(0);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/acces-refuse/);
  await expect(page.getByText("Ce module n'est pas disponible pour votre rôle")).toBeVisible();
});