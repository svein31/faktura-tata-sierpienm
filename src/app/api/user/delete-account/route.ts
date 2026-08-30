import { clearSessionCookieValue, getSessionUser, verifyPassword } from "@/lib/auth";
import { ApiError, handleApiError, json, readJson, str } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/user/delete-account (lub DELETE)
 *
 * Bezpowrotne usunięcie konta użytkownika i powiązanych danych.
 * Wymaga podania aktualnego hasła oraz wpisania słowa potwierdzającego "USUŃ".
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      throw new ApiError(401, "Nie jesteś zalogowany.", "UNAUTHENTICATED");
    }

    const body = await readJson(req);
    const password = str(body.password);
    const confirmationText = str(body.confirmation).trim();

    if (confirmationText !== "USUŃ") {
      throw new ApiError(400, 'Aby potwierdzić usunięcie konta, wpisz dokładnie słowo "USUŃ".');
    }

    if (!password) {
      throw new ApiError(400, "W celu autoryzacji usunięcia konta podaj swoje hasło.");
    }

    // 1. Weryfikacja hasła
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      throw new ApiError(400, "Podane hasło jest nieprawidłowe.");
    }

    // 2. Kaskadowe usunięcie użytkownika i jego danych
    await prisma.user.delete({
      where: { id: user.id },
    });

    const res = json({
      success: true,
      message: "Twoje konto oraz wszystkie powiązane dane zostały bezpowrotnie usunięte.",
    });

    // 3. Wyczyszczenie ciasteczka sesyjnego
    res.headers.append("Set-Cookie", clearSessionCookieValue());

    return res;
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: Request) {
  return POST(req);
}
