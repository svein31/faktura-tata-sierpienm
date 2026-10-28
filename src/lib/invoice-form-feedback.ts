export function invoiceFieldElement(field: string): HTMLElement | null {
  const aliases: Record<string,string> = {
    'newContractor.name':'new-name','newContractor.nip':'new-tax-id','newContractor.postal':'new-postal',
    'newContractor.city':'new-city','newContractor.street':'new-street',bankAccountId:'bank-account',
    'recipient.name':'recipient-name','recipient.taxId':'recipient-tax-id','recipient.postal':'recipient-postal',
    'recipient.city':'recipient-city','recipient.street':'recipient-street',
  };
  const normalized = field.replace(/\[(\d+)\]/g,'.$1');
  const target = [...document.querySelectorAll<HTMLElement>('[data-invoice-field]')]
    .find(node=>node.dataset.invoiceField===normalized && node.getClientRects().length>0);
  return target || document.getElementById(`invoice-${aliases[normalized] || normalized}`);
}
export function focusInvoiceField(field: string) {
  const target = invoiceFieldElement(field) || document.getElementById('invoice-validation-summary');
  if (!target) return;
  let parent: HTMLElement | null = target.parentElement;
  while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'center',behavior:'auto'});
}
