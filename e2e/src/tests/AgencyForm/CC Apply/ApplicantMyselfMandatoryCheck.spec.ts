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

const fillIfEmpty = async (locator: Locator, value: string) => {
  const visible = await locator.isVisible({ timeout: 2000 }).catch(() => false);
  if (!visible) return;
  const current = (await locator.inputValue().catch(() => '')).trim();
  if (!current) {
    await locator.fill(value);
  }
};

test('Applicant Myself Mandatory Check', async ({ page }, testInfo) => {
  test.setTimeout(240000);

  const agencyFormPage = new AgencyFormPage(page);
  const beforeYouStartPage = new BeforeYouStartPage(page);
  const bysHeading = page.getByRole('heading', { name: /before you start|what are you trying to do\?/i }).first();
  const contactDetailsHeading = page.getByRole('heading', { name: /contact details/i }).first();
  const applicantDetailsHeading = page.getByRole('heading', { name: /applicant details/i }).first();
  const loginIdentity = getLoginIdentityForSpec('ApplicantMyselfMandatoryCheck.spec.ts');
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
        `Auth session is not valid for Applicant Myself Mandatory Check after full ${loginIdentity.provider} login flow. ` +
        `Timed out waiting for Before You Start after identity login. Current URL: ${page.url()}.`
      );
    }
  };

  // Stable auth entry: use env/mapped myID email and recover login inline when needed.
  await ensureBysWithFreshMyIdLogin();
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

  // In Contact Details select "Myself..." and proceed to Applicant Details.
  const myselfOption = page.getByRole('radio', { name: /Myself, the person with a disability/i }).first();
  await myselfOption.check().catch(async () => myselfOption.click());

  const contactFirstName = page.getByRole('textbox', { name: /^First name\b/i }).first();
  const contactLastName = page.getByRole('textbox', { name: /^Last name\b/i }).first();
  const contactEmail = page.getByRole('textbox', { name: /^Email address\b|^Email\b/i }).first();
  const contactPhone = page.getByRole('textbox', { name: /^Phone number\b|^Mobile phone number\b/i }).first();

  await contactFirstName.waitFor({ state: 'visible', timeout: 15000 });
  await fillIfEmpty(contactFirstName, 'Auto');
  await fillIfEmpty(contactLastName, 'Tester');
  await fillIfEmpty(contactEmail, 'auto.tester@example.com');
  await fillIfEmpty(contactPhone, '0401234567');

  const preferredEmail = page.getByRole('radio', { name: /^Email$/i }).first();
  const preferredVisible = await preferredEmail.isVisible({ timeout: 3000 }).catch(() => false);
  if (preferredVisible) {
    await preferredEmail.check().catch(async () => preferredEmail.click());
  }

  await agencyFormPage.clickSaveAndContinue();
  await expect(applicantDetailsHeading).toBeVisible({ timeout: 60000 });

  // Validation 5: Optional email/phone fields should not be shown on Applicant details.
  await expect(page.getByText(/Email address\s*\(optional\)/i)).not.toBeVisible();
  await expect(page.getByText(/Phone number\s*\(optional\)/i)).not.toBeVisible();

  // Validation 1: Do not fill anything, click Save & Continue.
  await agencyFormPage.clickSaveAndContinue();
  await expect(applicantDetailsHeading).toBeVisible({ timeout: 15000 });

  const errorBannerHeading = page.getByRole('heading', { name: /please review the following errors/i }).first();
  await expect(errorBannerHeading).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/complete all required fields to continue/i)).toBeVisible({ timeout: 5000 });

  const residentQuestionInline = page
    .getByText(/is the person with a disability a permanent resident of queensland\? is required/i)
    .first();
  await expect(residentQuestionInline).toBeVisible({ timeout: 10000 });
  await expect(residentQuestionInline).toHaveCSS('color', 'rgb(226, 35, 57)');

  // Validation 2: Click Yes and validate prefilled values.
  const yesOption = page.getByRole('radio', { name: /^Yes$/i }).first();
  await yesOption.check().catch(async () => yesOption.click());

  const applicantFirstName = page.getByRole('textbox', { name: /^First name\b/i }).first();
  const applicantLastName = page.getByRole('textbox', { name: /^Last name\b/i }).first();
  const applicantResidentialAddress = page.getByRole('combobox', { name: /Residential address/i }).first();

  await expect(applicantFirstName).toBeVisible({ timeout: 15000 });
  await expect(applicantLastName).toBeVisible({ timeout: 15000 });
  await expect(applicantResidentialAddress).toBeVisible({ timeout: 15000 });

  const firstNamePrefilled = await isFilled(applicantFirstName);
  const lastNamePrefilled = await isFilled(applicantLastName);
  const residentialPrefilled = await isFilled(applicantResidentialAddress);

  // Trigger applicant-level mandatory validation with Yes selected.
  await agencyFormPage.clickSaveAndContinue();
  await expect(applicantDetailsHeading).toBeVisible({ timeout: 15000 });
  await expect(errorBannerHeading).toBeVisible({ timeout: 10000 });

  // Validation 3: Conditional inline errors for First name / Last name / Residential address.
  if (firstNamePrefilled && lastNamePrefilled && residentialPrefilled) {
    await expect(page.getByText(/first name is required/i).first()).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/last name is required/i).first()).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByText(/residential address is required/i).first()).not.toBeVisible({ timeout: 3000 });
  } else {
    if (!firstNamePrefilled) {
      await expect(page.getByText(/first name is required/i).first()).toBeVisible({ timeout: 10000 });
    }
    if (!lastNamePrefilled) {
      await expect(page.getByText(/last name is required/i).first()).toBeVisible({ timeout: 10000 });
    }
    if (!residentialPrefilled) {
      await expect(page.getByText(/applicant details:\s*residential address/i).first()).toBeVisible({ timeout: 10000 });
      const residentialInline = page.getByText(/residential address is required/i).first();
      await expect(residentialInline).toBeVisible({ timeout: 10000 });
      await expect(residentialInline).toHaveCSS('color', 'rgb(226, 35, 57)');
    }
  }

  // Validation 4: These required items should be flagged when not completed.
  await expect(page.getByRole('link', { name: /applicant details:\s*date of birth/i }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('link', { name: /applicant details:\s*upload a photo/i }).first()).toBeVisible({ timeout: 10000 });
  await expect(
    page
      .getByRole('link', {
        name: /applicant details:\s*i confirm that the uploaded photo has been sighted and verified by my health professional\./i,
      })
      .first()
  ).toBeVisible({ timeout: 10000 });

  const dobInlineOptions = [
    page.getByText(/date of birth is required/i).first(),
    page.getByText(/date of birth is not a valid date/i).first(),
  ];
  const hasDobInline =
    (await dobInlineOptions[0].isVisible({ timeout: 3000 }).catch(() => false)) ||
    (await dobInlineOptions[1].isVisible({ timeout: 3000 }).catch(() => false));


  // --- Take screenshot with unique timestamp after all validation errors appear in applicant details screen ---
  const path = require('path');
  const fs = require('fs');
  const screenshotDir = path.resolve(__dirname, '../../../../test-results');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const screenshotPath = path.join(screenshotDir, `ApplicantMyselfMandatoryCheckValidationErrors_${timestamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Applicant Myself validation errors screenshot saved at: ' + screenshotPath);

  if (!hasDobInline) {
    failValidation(4, 'Date of birth error text not visible');
  }

  const uploadPhotoInlineOptions = [
    page.getByText(/upload a photo is required/i).first(),
    page.getByText(/please upload a photo/i).first(),
  ];
  const hasUploadPhotoInline =
    (await uploadPhotoInlineOptions[0].isVisible({ timeout: 3000 }).catch(() => false)) ||
    (await uploadPhotoInlineOptions[1].isVisible({ timeout: 3000 }).catch(() => false));
  if (!hasUploadPhotoInline) {
    failValidation(4, 'Upload photo error text not visible');
  }

  const hasPhotoVerificationInline = await page
    .getByText(/uploaded photo has been sighted and verified.*required|confirmation that uploaded photo has been sighted and verified required/i)
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);
  if (!hasPhotoVerificationInline) {
    failValidation(4, 'Photo verification error text not visible');
  }

  if (!firstNamePrefilled || !lastNamePrefilled || !residentialPrefilled) {
    console.log('Validation 2 result: One or more applicant fields were not prefilled, and inline errors were validated.');
  } else {
    console.log('Validation 2 result: Applicant first name, last name, and residential address were prefilled.');
  }

  console.log('✅ Test Pass - Conditions are met');
});



