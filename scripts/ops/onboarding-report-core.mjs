export function onboardingGroup() {
  const sequence = fields => ({ $and: [...fields.map(field => ({ $eq: [{ $type: `$stages.${field}` }, 'date'] })), ...fields.slice(1).map((field, index) => ({ $lte: [`$stages.${fields[index]}`, `$stages.${field}`] }))] });
  const sum = fields => ({ $sum: { $cond: [sequence(fields), 1, 0] } });
  return { _id: null, registered: sum(['visit', 'register']), opened: sum(['visit', 'register', 'creator_open']), drafted: sum(['visit', 'register', 'creator_open', 'draft_saved']), issued: sum(['visit', 'register', 'creator_open', 'first_invoice']) };
}
export function onboardingSummary(totals = {}) {
  const step = (name, base, done) => ({ name, eligible: base || 0, completed: done || 0, incomplete: (base || 0) - (done || 0), conversion: base ? done / base : null });
  const steps = [step('registration_to_editor', totals.registered, totals.opened), step('editor_to_saved_draft', totals.opened, totals.drafted), step('editor_to_issued_invoice', totals.opened, totals.issued)];
  return { unit: 'consenting_browser_cohort', steps, suggestedInvestigation: steps.filter(s => s.eligible >= 10).sort((a, b) => b.incomplete - a.incomplete)[0]?.name || 'insufficient_samples', note: 'Saving a draft is optional. Outcomes come from successful server writes; opening the editor is a browser observation, not an issued invoice.' };
}
