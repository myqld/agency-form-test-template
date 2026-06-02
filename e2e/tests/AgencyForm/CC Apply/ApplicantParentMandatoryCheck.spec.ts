import { test, expect, Locator, type Page } from '@playwright/test';
import { AgencyFormPage } from '../../../pages/CC Apply/AgencyForm.page';
import { BeforeYouStartPage } from '../../../pages/CC Apply/BeforeYouStart.page';
import { getLoginIdentityForSpec } from '../../test-data/centralizedTestData';
import { environment } from '../../config/environment';

const fillRequiredContactDetails = async (page: Page) => {
  await page.getByRole('textbox', { name: /^First name\b/i }).first().fill('Tom');
  await page.getByRole('textbox', { name: /^Last name\b/i }).first().fill('Waters');
  await page.getByRole('textbox', { name: /^Email address\b|^Email\b/i }).first().fill('xyz@gmail.com');
  await page.getByRole('textbox', { name: /^Phone number\b|^Mobile phone number\b/i }).first().fill('0401975446');

  const preferredEmail = page.getByRole('radio', { name: /^Email$/i }).first();
  const preferredVisible = await preferredEmail.isVisible({ timeout: 3000 }).catch(() => false);
  if (preferredVisible) {
    await preferredEmail.check().catch(async () => preferredEmail.click());
  }
};

const failValidation = (num: number, reason: string): never => {
  throw new Error(`Validation ${num} - Fail: ${reason}`);
};

const isFilled = async (locator: Locator): Promise<boolean> => {
  const value = (await locator.inputValue().catch(() => '')).trim();
  return value.length > 0;
};

const fillIfEmpty = async (locator: Locator, value: string) => {
  const visible = await locator.isVisible({ timeout: 2000 }).catch(() => false);
  if (!visible) return;
  const current = (await locator.inputValue().catch(() => '')).trim();
  if (!current) {
    await locator.fill(value);
  }
};

const setAddressValue = async (
  field: Locator,
  value: string,
  options?: { searchTerms?: string[]; requireDropdownSelection?: boolean }
) => {
  await field.waitFor({ state: 'visible', timeout: 20000 });
  const page = field.page();
  const searchTerms = options?.searchTerms && options.searchTerms.length > 0 ? options.searchTerms : [value];
  const listboxId = await field.getAttribute('aria-controls');

  const getVisibleOptions = () => {
    if (listboxId) {
      return page.locator(
        `[id="${listboxId}"] [role="option"]:visible, [id="${listboxId}"] li:visible, [id="${listboxId}"] [id*="option"]:visible`
      );
    }
    return page.locator('[role="listbox"] [role="option"]:visible, [role="listbox"] li:visible, [id*="option"]:visible');
  };

  for (const term of searchTerms) {
    await field.click();
    await field.fill('');
    await field.type(term, { delay: 25 });
    await field.press('ArrowDown').catch(() => {});

    const visibleOptions = getVisibleOptions();
    const hasAnyOption = await visibleOptions.first().isVisible({ timeout: 8000 }).catch(() => false);
    if (!hasAnyOption) continue;

    await visibleOptions.first().click({ force: true });
    return;
  }

  await field.press('ArrowDown').catch(() => {});
  await field.press('Enter').catch(() => {});
  await field.blur().catch(() => {});

  if (options?.requireDropdownSelection === false) return;
  throw new Error('Address dropdown options did not appear.');
};

test('Applicant Parent Navigation to Disability Details', async ({ page }, testInfo) => {
  test.setTimeout(300000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();
  const contactDetailsHeading = page.getByRole('heading', { name: /contact details/i }).first();
  const applicantDetailsHeading = page.getByRole('heading', { name: /applicant details/i }).first();
  const disabilityDetailsHeading = page.getByRole('heading', { name: /disability details/i }).first();
  const loginIdentity = getLoginIdentityForSpec('ApplicantParentMandatoryCheck.spec.ts');
  const loginEmail = loginIdentity.email;
  const agencyFormUrl = environment.COMPANION_CARD_AGENCY_FORM_URL;
  const path = require('path');
  const fs = require('fs');

  const handleDraftFailedModal = async () => {
    const draftFailedHeading = page.getByRole('heading', { name: /your draft failed to load/i });
    const visible = await draftFailedHeading.isVisible({ timeout: 2000 }).catch(() => false);
    if (!visible) return false;

    const backToStart = page.getByRole('button', { name: /back to start/i });
    await backToStart.click();
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await draftFailedHeading.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    return true;
  };

  // (removed old resumeLoginIfShown, not needed)

  // NOTE: Avoid global draft-modal handlers because they can trigger during navigation
  // and race with page/context lifecycle. Handle draft modals explicitly at stable checkpoints.
  // Global guard: if session drops to login mid-test, robust login flow will recover inline.

  // (removed old recoverAuthIfNeeded, robust version is below)

  const goFromBysToContactDetails = async () => {
    await handleDraftFailedModal();
    await beforeYouStartPage.startNewIfDraftExists();
    await handleDraftFailedModal();
    await beforeYouStartPage.selectApplyForNewCard();
    await beforeYouStartPage.clickSaveAndContinue();
    await handleDraftFailedModal();
  };


  // --- Robust login and navigation (like ApplicantMyselfMandatoryCheck) ---
  const waitForBysOrDraft = async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const bysVisible = await bysHeading.isVisible({ timeout: 2000 }).catch(() => false);
      if (bysVisible) return true;
      const draftVisible = await beforeYouStartPage.draftDialog.isVisible().catch(() => false);
      if (draftVisible) return true;
      await page.waitForTimeout(1000);
    }
    return false;
  };

  const recoverAuthIfNeeded = async (): Promise<boolean> => {
    const loginHeading = page.getByRole('heading', { name: /login to continue/i });
    const loginVisible = await loginHeading.isVisible({ timeout: 5000 }).catch(() => false);
    if (!loginVisible) return false;
    await agencyFormPage.loginWithIdentity(loginIdentity.provider, loginEmail);
    try {
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      const reachedBysAfterLogin = await waitForBysOrDraft(180000);
      if (reachedBysAfterLogin) return true;
      await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      return await waitForBysOrDraft(15000);
    } catch {
      await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      return await waitForBysOrDraft(15000);
    }
  };

  const ensureBysWithFreshLogin = async () => {
    await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' });
    await agencyFormPage.ensureNoLoadingError();
    await handleDraftFailedModal();
    const alreadyAtBys = await waitForBysOrDraft(8000);
    if (alreadyAtBys) return;
    const recovered = await recoverAuthIfNeeded();
    await handleDraftFailedModal();
    if (recovered) {
      const bysAfterRecovery = await waitForBysOrDraft(30000);
      if (bysAfterRecovery) return;
      throw new Error(
        `Identity login completed but app did not return to Before You Start. Current URL: ${page.url()}.`
      );
    }
    await agencyFormPage.loginWithIdentity(loginIdentity.provider, loginEmail, { navigateFromEntry: true });
    await handleDraftFailedModal();
    const bysVisible = await waitForBysOrDraft(180000);
    if (!bysVisible) {
      throw new Error(
        `Auth session is not valid for Applicant Parent Mandatory Check after full ${loginIdentity.provider} login flow. ` +
        `Timed out waiting for Before You Start after identity login. Current URL: ${page.url()}.`
      );
    }
  };

  // Stable auth entry: use env/mapped login and recover inline when needed.
  await ensureBysWithFreshLogin();
  await beforeYouStartPage.startNewIfDraftExists();
  await handleDraftFailedModal();

  // BYS -> Contact Details
  await goFromBysToContactDetails();

  // If app bounced to login, recover auth and retry once from BYS.
  const onContactDetails = await contactDetailsHeading.isVisible({ timeout: 8000 }).catch(() => false);
  if (!onContactDetails) {
    const recovered = await recoverAuthIfNeeded();
    if (recovered) {
      await goFromBysToContactDetails();
    }
  }

  await expect(contactDetailsHeading).toBeVisible({ timeout: 60000 });


  // Select Myself path and continue to Applicant details (following MyselfApplicant.spec pattern)
  const myselfOption = page.getByRole('radio', { name: /myself, the person with a disability/i }).first();
  await myselfOption.check().catch(async () => myselfOption.click());
  await agencyFormPage.clickSaveAndContinue();
  await expect(applicantDetailsHeading).toBeVisible({ timeout: 60000 });

  // On Applicant Details click Yes (do not fill anything else)
  const yesOption = page.getByRole('radio', { name: /^Yes$/i }).first();
  await yesOption.check().catch(async () => yesOption.click());

  // --- Prefill detection and logging ---
  const prefillStatus: Record<string, string> = {};
  // 1. First name
  const firstName = await page.getByRole('textbox', { name: /^First name\b/i }).first();
  prefillStatus['First name'] = ((await firstName.inputValue().catch(() => '')) || '').trim();
  // 2. Last name
  const lastName = await page.getByRole('textbox', { name: /^Last name\b/i }).first();
  prefillStatus['Last name'] = ((await lastName.inputValue().catch(() => '')) || '').trim();
  // 3. Date of birth
  const dobParts = page.getByRole('spinbutton', { name: 'Date of birth' });
  const dobDay = ((await dobParts.nth(0).inputValue().catch(() => '')) || '').trim();
  const dobMonth = ((await dobParts.nth(1).inputValue().catch(() => '')) || '').trim();
  const dobYear = ((await dobParts.nth(2).inputValue().catch(() => '')) || '').trim();
  prefillStatus['Date of birth'] = dobDay && dobMonth && dobYear ? `${dobDay}/${dobMonth}/${dobYear}` : '';
  // 4. Residential address
  const residentialAddress = page.getByRole('combobox', { name: /Residential address/i }).first();
  prefillStatus['Residential address'] = ((await residentialAddress.inputValue().catch(() => '')) || '').trim();
  // 5. Upload a Photo
  const photoUploaded = await page.getByRole('button', { name: /delete/i }).first().isVisible({ timeout: 2000 }).catch(() => false)
    || await page.getByText(/upload complete/i).first().isVisible({ timeout: 2000 }).catch(() => false);
  prefillStatus['Upload a Photo'] = photoUploaded ? 'Yes' : '';
  // 6. Photo declaration
  const verificationCheckbox = page.getByRole('checkbox', { name: /uploaded photo has been sighted and verified by my health professional/i }).first();
  prefillStatus['Photo declaration'] = (await verificationCheckbox.isChecked().catch(() => false)) ? 'Yes' : '';

  // Log prefilled and empty fields
  const prefilledFields = Object.entries(prefillStatus).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
  const emptyFields = Object.entries(prefillStatus).filter(([_, v]) => !v).map(([k]) => k);
  console.log('Prefilled fields on Applicant Details screen:\n' + prefilledFields);
  if (emptyFields.length) {
    console.log('Empty fields requiring validation: ' + emptyFields.join(', '));
  }

  // Click Save & Continue without filling any fields
  await agencyFormPage.clickSaveAndContinue();

  // Wait for validation errors to appear
  const errorBannerHeading = page.getByRole('heading', { name: /please review the following errors/i }).first();
  await expect(errorBannerHeading).toBeVisible({ timeout: 10000 });

  // Take screenshot with unique timestamp
  const screenshotDir = path.resolve(__dirname, '../../../../test-results');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotDir, `ApplicantDetailsValidationErrors_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Applicant Details validation errors screenshot saved at: ' + screenshotPath);
});
