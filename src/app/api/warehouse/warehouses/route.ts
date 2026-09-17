import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ApiError, bool, cleanStr, handleApiError, json, readJson } from "@/lib/api";
import { assertCanManageStock } from "@/lib/warehouse/guard";
import { warehouseToDto } from "@/lib/warehouse/dto";
import { listWarehouseRecords } from "@/lib/warehouse/warehouses";
import { recordAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

/** Adres magazynu z body (pole opcjonalne). */
function addressFromBody(v: unknown): { street: string; city: string; postal: string; country: string } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const a = v as Record<string, unknown>;
  const address = {
    street: cleanStr(a.street, 200, "adres.ulica"),
    city: cleanStr(a.city, 120, "adres.miasto"),
    postal: cleanStr(a.postal, 20, "adres.kod pocztowy"),
    country: cleanStr(a.country, 60, "adres.kraj") || "PL",
  };
  const filled = address.street || address.city || address.postal;
  return filled ? address : null;
}

/**
 * GET /api/warehouse/warehouses — lista magazynów użytkownika.
 * Pierwszy magazyn („Magazyn główny”, kod MAG) tworzony jest automatycznie.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });

    const warehouses = await listWarehouseRecords(user.id);
    return json({ warehouses: warehouses.map(warehouseToDto) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** POST /api/warehouse/warehouses — nowy magazyn. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Nieautoryzowany.", code: "UNAUTHENTICATED" }, { status: 401 });
    assertCanManageStock(user);

    const body = await readJson(req);
    const name = cleanStr(body.name, 120, "nazwa");
    if (!name) throw new ApiError(400, "Podaj nazwę magazynu.", "NAME_REQUIRED");

    const code = (cleanStr(body.code, 20, "kod") || "MAG").toUpperCase();
    const notes = cleanStr(body.notes, 500, "uwagi") || null;
    const address = addressFromBody(body.address);
    const isDefault = bool(body.isDefault);

    const duplicate = await prisma.warehouse.findFirst({
      where: { userId: user.id, code },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError(409, `Magazyn o kodzie ${code} już istnieje.`, "WAREHOUSE_CODE_TAKEN");
    }

    const existingCount = await prisma.warehouse.count({ where: { userId: user.id } });
    const shouldBeDefault = isDefault || existingCount === 0;

    if (shouldBeDefault) {
      await prisma.warehouse.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const warehouse = await prisma.warehouse.create({
      data: {
        userId: user.id,
        name,
        code,
        notes,
        address: address ?? undefined,
        isDefault: shouldBeDefault,
        isActive: body.isActive === undefined ? true : bool(body.isActive),
      },
    });

    await recordAuditLog({
      userId: user.id,
      userName: user.name ?? null,
      userEmail: user.email,
      action: "warehouse.created",
      entityType: "warehouse",
      entityId: warehouse.id,
      description: `Utworzono magazyn ${warehouse.code} — ${warehouse.name}`,
    }).catch(() => undefined);

    return json({ warehouse: warehouseToDto(warehouse) }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
