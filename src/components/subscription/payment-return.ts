type VerifiedAccess = { isPro: boolean; accessSource: string | null };

export function paymentReturnMessage(
  billing: string | null,
  subscription: VerifiedAccess | null | undefined,
  verificationExhausted: boolean,
): { type: "success" | "warning" | "pending"; text: string } | null {
  if (billing === "cancel") {
    return {
      type: "warning",
      text: "Wrócono z płatności bez potwierdzenia zakupu. Sprawdź aktualny stan subskrypcji poniżej i historię płatności przed kolejną próbą.",
    };
  }
  if (billing !== "success") return null;
  if (subscription?.isPro) {
    return {
      type: "success",
      text: subscription.accessSource === "complimentary"
        ? "Serwer potwierdził przyznany dostęp Pro."
        : "Serwer potwierdził aktywny plan Pro.",
    };
  }
  if (verificationExhausted) {
    return {
      type: "warning",
      text: "Aktywacja Pro nie została jeszcze potwierdzona. Odśwież stan za chwilę. Przed ponowieniem zakupu sprawdź historię płatności lub skontaktuj się z pomocą.",
    };
  }
  return {
    type: "pending",
    text: "Sprawdzamy stan subskrypcji. Aktywacja po płatności może potrwać chwilę.",
  };
}
