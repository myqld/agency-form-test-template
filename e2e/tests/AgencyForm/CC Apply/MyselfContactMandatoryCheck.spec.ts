import { test, expect, Locator } from '@playwright/test';
import { AgencyFormPage } from '../../../pages/CC Apply/AgencyForm.page';
import { BeforeYouStartPage } from '../../../pages/CC Apply/BeforeYouStart.page';
import { getLoginIdentityForSpec } from '../../test-data/centralizedTestData';
import { environment } from '../../config/environment';

const failValidation = (num: number, reason: string): never => {
  throw new Error(`Validation ${num} - Fail: ${reason}`);
};

const isFilled = async (locator: Locator): Promise<boolean> => {
  const value = (await locator.inputValue().catch(() => '')).trim();
  return value.length > 0;
};

test('Myself Contact Mandatory Check', async ({ page }, testInfo) => {
  test.setTimeout(240000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();
  const contactDetailsHeading = page.getByRole('heading', { name: /contact details/i }).first();
  const loginIdentity = getLoginIdentityForSpec('MyselfContactMandatoryCheck.spec.ts');
  const loginEmail = loginIdentity.email;
  const agencyFormUrl = `${process.env.DTP_ROOT_URL || 'https://forms.preprod.beta.my.qld.gov.au'}/companioncardapply/agency-form`;

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

  const waitForBysOrDraft = async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const bysVisible = await bysHeading.isVisible({ timeout: 2000 }).catch(() => false);
      if (bysVisible) {
        return true;
      }

      const draftVisible = await beforeYouStartPage.draftDialog.isVisible().catch(() => false);
      if (draftVisible) {
        return true;
      }

      await page.waitForTimeout(1000);
    }

    return false;
  };

  const recoverAuthIfNeeded = async (): Promise<boolean> => {
    const loginHeading = page.getByRole('heading', { name: /login to continue/i });
    const loginVisible = await loginHeading.isVisible({ timeout: 5000 }).catch(() => false);
    if (!loginVisible) {
      return false;
    }

    await agencyFormPage.loginWithIdentity(loginIdentity.provider, loginEmail);

    try {
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      const reachedBysAfterLogin = await waitForBysOrDraft(180000);
      if (reachedBysAfterLogin) {
        return true;
      }

      await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      return await waitForBysOrDraft(15000);
    } catch {
      await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await agencyFormPage.ensureNoLoadingError().catch(() => {});
      return await waitForBysOrDraft(15000);
    }
  };

  const goFromBysToContactDetails = async () => {
    await handleDraftFailedModal();
    await beforeYouStartPage.startNewIfDraftExists();
    await handleDraftFailedModal();
    await beforeYouStartPage.selectApplyForNewCard();
    await beforeYouStartPage.clickSaveAndContinue();
    await handleDraftFailedModal();
  };

  const ensureBysWithFreshMyIdLogin = async () => {
    await page.goto(agencyFormUrl, { waitUntil: 'domcontentloaded' });
    await agencyFormPage.ensureNoLoadingError();
    await handleDraftFailedModal();

    const alreadyAtBys = await waitForBysOrDraft(8000);
    if (alreadyAtBys) {
      return;
    }

    const recovered = await recoverAuthIfNeeded();
    await handleDraftFailedModal();

    if (recovered) {
      const bysAfterRecovery = await waitForBysOrDraft(30000);
      if (bysAfterRecovery) {
        return;
      }

      throw new Error(
        `Identity login completed but app did not return to Before You Start. Current URL: ${page.url()}.`
      );
    }

    // Full login path: do not rely on any saved auth state.
    await agencyFormPage.loginWithIdentity(loginIdentity.provider, loginEmail, { navigateFromEntry: true });
    await handleDraftFailedModal();

    const bysVisible = await waitForBysOrDraft(180000);
    if (!bysVisible) {
      throw new Error(
        `Auth session is not valid for Myself Contact Mandatory Check after full ${loginIdentity.provider} login flow. ` +
        `Timed out waiting for Before You Start after identity login. Current URL: ${page.url()}.`
      );
    }
  };

  // Stable auth entry: use env/mapped myID email and recover login inline when needed.
  await ensureBysWithFreshMyIdLogin();
  await beforeYouStartPage.startNewIfDraftExists();
  await handleDraftFailedModal();

  // Step 1: BYS -> Apply for a new card.
  await goFromBysToContactDetails();

  // Retry if app bounced to login.
  const onContactDetails = await contactDetailsHeading.isVisible({ timeout: 8000 }).catch(() => false);
  if (!onContactDetails) {
    const recovered = await recoverAuthIfNeeded();
    if (recovered) {
      await goFromBysToContactDetails();
    }
  }

  await handleDraftFailedModal();
  await expect(contactDetailsHeading).toBeVisible({ timeout: 60000 });

  // Step 2 / Validation 1:
  // Do not choose "Who has logged in..." and save.
  await agencyFormPage.clickSaveAndContinue();

  await expect(contactDetailsHeading).toBeVisible({ timeout: 10000 });
  const errorBanner = page.getByRole('heading', { name: /please review the following errors/i }).first();
  await expect(errorBanner).toBeVisible({ timeout: 15000 });
  await expect(errorBanner).toHaveText('Please review the following errors');

  const loginQuestionInline = page
    .getByText(/who has logged in to complete this application today\? is required/i)
    .first();
  await expect(loginQuestionInline).toBeVisible({ timeout: 10000 });
  await expect(loginQuestionInline).toHaveCSS('color', 'rgb(226, 35, 57)');

  // Step 3: Choose "Myself, the person with a disability".
  const myselfOption = page.getByRole('radio', { name: /myself, the person with a disability/i }).first();
  await myselfOption.check().catch(async () => myselfOption.click());

  // Validation 2: Check if core fields are prefilled.
  const firstName = page.getByRole('textbox', { name: /^First name\b/i }).first();
  const lastName = page.getByRole('textbox', { name: /^Last name\b/i }).first();
  const email = page.getByRole('textbox', { name: /^Email address\b|^Email\b/i }).first();
  const phone = page.getByRole('textbox', { name: /^Phone number\b|^Mobile phone number\b/i }).first();

  await expect(firstName).toBeVisible({ timeout: 15000 });
  await expect(lastName).toBeVisible({ timeout: 15000 });
  await expect(email).toBeVisible({ timeout: 15000 });
  await expect(phone).toBeVisible({ timeout: 15000 });

  const fieldsArePrefilled =
    (await isFilled(firstName)) &&
    (await isFilled(lastName)) &&
    (await isFilled(email)) &&
    (await isFilled(phone));

  // Step 4 / Validation 3 and Validation 4:
  // Keep preferred contact method empty, then Save & Continue.
  await agencyFormPage.clickSaveAndContinue();

  await expect(contactDetailsHeading).toBeVisible({ timeout: 10000 });
  await expect(errorBanner).toBeVisible({ timeout: 10000 });

  if (fieldsArePrefilled) {
    const shouldNotShow = [
      page.getByText(/first name is required/i).first(),
      page.getByText(/last name is required/i).first(),
      page.getByText(/email( address)? is required/i).first(),
      page.getByText(/phone number is required|mobile phone number is required/i).first(),
    ];

    for (const locator of shouldNotShow) {
      await expect(locator).not.toBeVisible({ timeout: 3000 });
    }
  } else {
    const requiredFieldErrors = [
      page.getByText(/first name is required/i).first(),
      page.getByText(/last name is required/i).first(),
      page.getByText(/email( address)? is required/i).first(),
      page.getByText(/phone number is required|mobile phone number is required/i).first(),
    ];

    for (const locator of requiredFieldErrors) {
      await expect(locator).toBeVisible({ timeout: 10000 });
      await expect(locator).toHaveCSS('color', 'rgb(226, 35, 57)');
    }
  }

  const preferredContactError = page
    .getByText(/preferred contact method.*required|which method would you like.*required/i)
    .first();
  await expect(preferredContactError).toBeVisible({ timeout: 10000 });
  await expect(preferredContactError).toHaveCSS('color', 'rgb(226, 35, 57)');

  // Step 6 / Validation 5:
  // Add a contact and save without filling mandatory fields.
  const addContactButton = page.getByRole('button', { name: /add a contact/i }).first();
  await addContactButton.click();

  const saveDetailsButton = page.getByRole('button', { name: /save details/i }).last();
  await expect(saveDetailsButton).toBeVisible({ timeout: 10000 });
  await saveDetailsButton.click();

  await agencyFormPage.clickSaveAndContinue();

  await expect(contactDetailsHeading).toBeVisible({ timeout: 10000 });
  await expect(errorBanner).toBeVisible({ timeout: 10000 });

  const contactRequiredErrors = [
    page.getByText(/contact\s*\d+[:\s-]*first name is required|first name is required/i).first(),
    page.getByText(/contact\s*\d+[:\s-]*last name is required|last name is required/i).first(),
    page.getByText(/relationship to applicant is required/i).first(),
    page.getByText(/contact\s*\d+[:\s-]*email( address)? is required|email( address)? is required/i).first(),
    page.getByText(/contact\s*\d+[:\s-]*phone number is required|phone number is required/i).first(),
  ];

  for (const locator of contactRequiredErrors) {
    const isVisible = await locator.isVisible({ timeout: 10000 }).catch(() => false);
    if (!isVisible) {
      failValidation(5, 'Expected contact mandatory error is not visible');
    }
    await expect(locator).toHaveCSS('color', 'rgb(226, 35, 57)');
  }

  // --- Unique timestamped screenshot after validation errors appear in Contact details screen ---
  const path = require('path');
  const fs = require('fs');
  const screenshotDir = path.resolve(__dirname, '../../../../test-results');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotDir, `MyselfContactMandatoryCheck_ContactDetailsValidationErrors_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Myself Contact Mandatory Check validation errors screenshot saved at: ' + screenshotPath);

  console.log('✅ Test Pass - Conditions are met');
});



