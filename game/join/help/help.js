'use strict';

const form = document.querySelector('#purchase-help-form');
const submit = form.querySelector('button');
const fields = form.querySelector('fieldset');
const errorMessage = document.querySelector('#help-error');
const receipt = document.querySelector('#help-receipt');
const receiptPattern = /^AER-[A-Za-z0-9_-]{22}$/;
let submissionId;
if (new URLSearchParams(location.search).get('issue') === 'charge') {
  form.elements.issue.value = 'charge';
}

form.addEventListener('input', () => { submissionId = undefined; });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  submit.disabled = true;
  errorMessage.textContent = '';
  const defaultError = 'Your request could not be confirmed. Try again to check whether it arrived.';
  try {
    submissionId ||= crypto.randomUUID();
    const payload = Object.fromEntries(new FormData(form));
    fields.disabled = true;
    const response = await fetch(form.action, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...payload, submissionId })
    });
    const result = await response.json();
    if (response.ok && typeof result.caseId === 'string' && receiptPattern.test(result.caseId)) {
      form.reset();
      form.hidden = true;
      document.querySelector('#case-reference').textContent = result.caseId;
      receipt.hidden = false;
      receipt.focus();
    } else {
      errorMessage.textContent = typeof result.error === 'string' ? result.error : defaultError;
    }
  } catch {
    errorMessage.textContent = defaultError;
  } finally {
    fields.disabled = false;
    submit.disabled = false;
  }
});
submit.disabled = false;
