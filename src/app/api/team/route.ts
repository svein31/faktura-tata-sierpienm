import * as crypto from "crypto";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { handleApiError, json, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const invitations = await prisma.teamInvitation.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return json({ invitations });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const body = await readJson(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "accountant";

    if (!email || !email.includes("@")) {
      return json({ error: "Podaj prawidłowy adres e-mail." }, { status: 400 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 14 * 86400000); // 14 dni

    const invitation = await prisma.teamInvitation.create({
      data: {
        userId: user.id,
        email,
        role,
        token,
        expiresAt,
        status: "pending",
      },
    });

    return json({
      invitation,
      inviteUrl: `/invite/${token}`,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return json({ error: "Brak ID zaproszenia." }, { status: 400 });
    }

    await prisma.teamInvitation.deleteMany({
      where: { id, userId: user.id },
    });

    return json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
